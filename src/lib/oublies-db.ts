import { USER_ID, supabaseAdmin } from "./supabase";

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
};

/**
 * Fait glisser vers l'archive ce qui a dépassé les quatre jours. Idempotent
 * et appelé à chaque lecture des tâches : une todo qui s'affiche est une todo
 * déjà nettoyée.
 */
export async function archiverTachesOubliees(): Promise<void> {
  const seuil = new Date(Date.now() - JOURS_AVANT_OUBLI * 86_400_000).toISOString();
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ statut: "abandonnee" })
    .eq("user_id", USER_ID)
    .in("statut", ["ouverte", "en_cours"])
    .neq("urgence", "aujourdhui")
    .lt("created_at", seuil);

  if (error) throw error;
}

export async function lireOubliees(): Promise<TacheOubliee[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("id, titre, categorie, urgence, created_at")
    .eq("user_id", USER_ID)
    .eq("statut", "abandonnee")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    titre: t.titre as string,
    categorie: (t.categorie as string | null) ?? null,
    urgence: t.urgence as string,
    jours: Math.max(
      0,
      Math.floor((Date.now() - Date.parse(t.created_at as string)) / 86_400_000),
    ),
  }));
}

/**
 * Remet un oublié dans la todo. Le compteur repart de zéro — sans ça, la
 * tâche repartirait à l'archive dès la lecture suivante, puisque sa date de
 * création est précisément ce qui l'y a envoyée.
 */
export async function reprendreOubliee(id: string): Promise<TacheReprise | null> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .update({ statut: "ouverte", created_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", USER_ID)
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
    .eq("user_id", USER_ID)
    .eq("statut", "abandonnee");

  if (error) throw error;
}
