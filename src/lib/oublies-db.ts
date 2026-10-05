import { uid, supabaseAdmin } from "./supabase";

/**
 * LES OUBLIÉS — le filet, et plus le balai.
 *
 * Avant, ce module BALAYAIT : toute tâche non prioritaire passée quatre jours
 * sans être cochée glissait ici, toute seule. Dans un cockpit dont la todo est
 * pilotée par les échéances, cette règle effaçait de l'écran des tâches du plan
 * encore à venir — « Clôture des précommandes », datée du 30 novembre, aurait
 * disparu le 9 octobre, en silence.
 *
 * L'archive reste, et devient ce qu'elle aurait dû être : l'endroit où tombe
 * ce qu'on SUPPRIME. Un clic de travers sur une liste de vingt lignes ne
 * détruit plus rien, il déplace. On remet une tâche dans la todo en un geste,
 * et l'effacement définitif se fait d'ici, là où l'on voit ce qu'on vise.
 *
 * Rangé dans la même table, au statut `abandonnee` : aucune table ne peut être
 * ajoutée (le jeton d'accès Supabase a été révoqué) et ce statut existait déjà
 * dans la contrainte.
 */

export type TacheOubliee = {
  id: string;
  titre: string;
  /** Le JSON de la meta P90, tel quel : le navigateur le décode. */
  categorie: string | null;
  /** Depuis combien de jours elle dort ici. */
  jours: number;
};

export async function lireOubliees(): Promise<TacheOubliee[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("id, titre, categorie, created_at")
    .eq("user_id", (await uid()))
    .eq("statut", "abandonnee")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id as string,
    titre: t.titre as string,
    categorie: (t.categorie as string | null) ?? null,
    jours: Math.max(
      0,
      Math.floor((Date.now() - Date.parse(t.created_at as string)) / 86_400_000),
    ),
  }));
}

/** Ce que le navigateur a besoin de savoir pour réafficher la tâche reprise. */
export type TacheReprise = { id: string; titre: string; urgence: string; categorie: string | null };

/**
 * Remet un oublié dans la todo.
 *
 * La date de création REPART DE ZÉRO : c'est elle qui donne l'âge affiché dans
 * la liste, et une tâche reprise aujourd'hui ne doit pas s'afficher « 40 j »
 * comme si on la repoussait depuis quarante jours.
 */
export async function reprendreOubliee(id: string): Promise<TacheReprise | null> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .update({ statut: "ouverte", created_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", (await uid()))
    .eq("statut", "abandonnee")
    .select("id, titre, urgence, categorie")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    titre: data.titre as string,
    urgence: data.urgence as string,
    categorie: (data.categorie as string | null) ?? null,
  };
}

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
