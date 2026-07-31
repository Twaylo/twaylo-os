import { USER_ID, supabaseAdmin } from "./supabase";
import { JOURNEES_DEFAUT, bornerJournees, type JourneesConfig } from "./journees";

/**
 * L'accès base des journées types, côté serveur uniquement.
 *
 * Même logement que les skills, Momentum et la personnalisation : la ligne
 * sentinelle de daily_logs (le jeton Supabase étant révoqué, pas de nouvelle
 * table possible). Absentes de la sentinelle, on renvoie les modèles de
 * départ SANS les écrire — la première vraie modification écrira le tout.
 */
const JOUR_SENTINELLE = "2000-01-01";

export async function lireJournees(): Promise<JourneesConfig> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  const journees = (data?.habitudes as { journees?: Partial<JourneesConfig> } | null)
    ?.journees;
  if (!journees || typeof journees !== "object") return JOURNEES_DEFAUT;
  return bornerJournees(journees);
}

/** Relit puis fusionne : écrire ici ne doit pas effacer le reste de la sentinelle. */
export async function ecrireJournees(config: JourneesConfig): Promise<void> {
  const db = supabaseAdmin();

  const { data, error: erreurLecture } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (erreurLecture) throw erreurLecture;

  const { error } = await db.from("daily_logs").upsert(
    {
      user_id: USER_ID,
      jour: JOUR_SENTINELLE,
      habitudes: {
        ...((data?.habitudes ?? {}) as object),
        journees: bornerJournees(config),
      },
    },
    { onConflict: "user_id,jour" },
  );

  if (error) throw error;
}
