import { uid, supabaseAdmin } from "./supabase";
import { lireSentinelle, majSentinelle } from "./sentinelle";
import { estQuadrant, quadrantParDefaut, type Quadrant } from "./eisenhower";
import { NIVEAUX, type Niveau } from "./types";

/**
 * Les Oubliés — l'archive vivante de ce qui traîne.
 *
 * Une tâche secondaire ou annexe qui passe QUATRE jours sans être cochée ne
 * doit plus encombrer la todo : elle glisse ici, marquée `abandonnee` dans la
 * même table (aucune nouvelle table possible, et le statut existe déjà dans la
 * contrainte). Rien n'est perdu : l'archive garde tout, compte les jours
 * (J5, J6…), et un oublié se remet dans la todo en un geste.
 *
 * Le focus principal (urgence « aujourdhui ») est intouchable : ce qui fait
 * la journée ne s'archive jamais tout seul.
 */

const JOURS_AVANT_OUBLI = 4;

export type TacheOubliee = {
  id: string;
  titre: string;
  categorie: string | null;
  urgence: string;
  /** Depuis combien de jours elle attend (depuis sa création). */
  jours: number;
  /** Sa case dans la matrice d'Eisenhower. */
  quadrant: Quadrant;
  /** Faux tant que Twaylo n'a pas tranché lui-même : c'est le rangement d'office. */
  quadrantChoisi: boolean;
};

/**
 * Les cases choisies à la main, par identifiant de tâche.
 *
 * Rangées sur la sentinelle : la table `tasks` n'a pas de colonne pour ça et
 * aucune migration n'est possible (le jeton d'accès a été révoqué). Ne sont
 * mémorisés que les choix de Twaylo — le rangement d'office se recalcule, il
 * n'a pas à être stocké.
 */
async function lireQuadrants(): Promise<Record<string, Quadrant>> {
  const brut = (await lireSentinelle()).oubliesQuadrants;
  if (!brut || typeof brut !== "object") return {};

  const propre: Record<string, Quadrant> = {};
  for (const [id, q] of Object.entries(brut as Record<string, unknown>)) {
    if (estQuadrant(q)) propre[id] = q;
  }
  return propre;
}

/**
 * Par l'écrivain vérifié de la sentinelle, qui porte aussi les skills, les
 * journées types, l'ordre des tâches et les habitudes.
 *
 * Cette fonction relisait puis écrasait de son côté : ranger un oublié
 * pendant que l'OS enregistrait autre chose pouvait effacer l'autre réglage.
 */
async function ecrireQuadrants(quadrants: Record<string, Quadrant>): Promise<void> {
  await majSentinelle({ oubliesQuadrants: quadrants });
}

/** Range un oublié dans une case — le choix de Twaylo prime sur le rangement d'office. */
export async function classerOubliee(id: string, quadrant: Quadrant): Promise<void> {
  const quadrants = await lireQuadrants();
  await ecrireQuadrants({ ...quadrants, [id]: quadrant });
}

/**
 * Fait glisser vers l'archive ce qui a dépassé les quatre jours. Idempotent
 * et appelé à chaque lecture des tâches : une todo qui s'affiche est une todo
 * déjà nettoyée.
 */
export function seuilOubli(): string {
  return new Date(Date.now() - JOURS_AVANT_OUBLI * 86_400_000).toISOString();
}

/**
 * Le MÊME jugement que l'écriture ci-dessous, mais appliqué en mémoire.
 *
 * Les deux doivent rester rigoureusement d'accord : la lecture des tâches
 * n'attend plus l'archivage, elle le double d'un filtre local pour ne pas
 * réafficher une ligne que l'écriture est en train de retirer. Si les
 * conditions divergeaient, on masquerait à l'écran une tâche que la base
 * garde — une tâche cochée le jour même, par exemple, que le SELECT laisse
 * passer (il n'exclut que `abandonnee`) et que ce prédicat doit conserver.
 * D'où la fonction unique, lue par les deux chemins.
 */
export function estOubliee(
  t: { statut: string; urgence: string; created_at?: string | null },
  seuil: string,
): boolean {
  return (
    (t.statut === "ouverte" || t.statut === "en_cours") &&
    t.urgence !== "aujourdhui" &&
    typeof t.created_at === "string" &&
    t.created_at < seuil
  );
}

export async function archiverTachesOubliees(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ statut: "abandonnee" })
    .eq("user_id", (await uid()))
    .in("statut", ["ouverte", "en_cours"])
    .neq("urgence", "aujourdhui")
    .lt("created_at", seuilOubli());

  /*
   * Journalisé, jamais propagé.
   *
   * Cette écriture de ménage est lancée en parallèle de la lecture des tâches.
   * En faisant remonter son échec, un hoquet d'écriture chez Supabase faisait
   * échouer /api/state tout entier : l'écran gardait les données de la veille
   * et affichait une erreur, pour un ménage dont personne n'attend le
   * résultat. Il repassera à la lecture suivante.
   */
  if (error) console.error("[oublies] archivage impossible :", error);
}

export async function lireOubliees(): Promise<TacheOubliee[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("id, titre, categorie, urgence, created_at")
    .eq("user_id", (await uid()))
    .eq("statut", "abandonnee")
    .order("created_at", { ascending: true });

  if (error) throw error;
  const lignes = data ?? [];
  const quadrants = await lireQuadrants();

  /*
   * Les choix devenus orphelins sont oubliés à leur tour : une tâche reprise
   * ou jetée ne doit pas laisser sa case derrière elle. Le ménage se fait ici,
   * à la lecture, plutôt que dans chaque chemin de sortie.
   */
  const vivants = new Set(lignes.map((t) => t.id as string));
  const restants = Object.fromEntries(
    Object.entries(quadrants).filter(([id]) => vivants.has(id)),
  );
  if (Object.keys(restants).length !== Object.keys(quadrants).length) {
    try {
      await ecrireQuadrants(restants);
    } catch (err) {
      console.error("[oublies] ménage des cases impossible :", err);
    }
  }

  return lignes.map((t) => {
    const jours = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(t.created_at as string)) / 86_400_000),
    );
    const id = t.id as string;
    const choisi = restants[id];
    return {
      id,
      titre: t.titre as string,
      categorie: (t.categorie as string | null) ?? null,
      urgence: t.urgence as string,
      jours,
      quadrant: choisi ?? quadrantParDefaut(t.urgence as string, jours),
      quadrantChoisi: Boolean(choisi),
    };
  });
}

/**
 * Remet un oublié dans la todo. Le compteur repart de zéro — sans ça, la
 * tâche repartirait à l'archive dès la lecture suivante, puisque sa date de
 * création est précisément ce qui l'y a envoyée.
 */
export async function reprendreOubliee(
  id: string,
  niveau?: Niveau,
): Promise<TacheReprise | null> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .update({
      statut: "ouverte",
      created_at: new Date().toISOString(),
      // Le quadrant décide du niveau de retour : ce qui sort de « Faire »
      // revient en focus principal, ce qui sort de « Déléguer » en annexe.
      ...(niveau ? { urgence: NIVEAUX[niveau].urgence } : {}),
    })
    .eq("id", id)
    .eq("user_id", (await uid()))
    .eq("statut", "abandonnee")
    .select("id, titre, urgence")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    titre: data.titre as string,
    urgence: data.urgence as string,
  };
}

/** Ce que le navigateur a besoin de savoir pour réafficher la tâche reprise. */
export type TacheReprise = { id: string; titre: string; urgence: string };

/** Jette un oublié pour de bon — le seul effacement, et il est volontaire. */
export async function supprimerOubliee(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", (await uid()))
    .eq("statut", "abandonnee");

  if (error) throw error;
}
