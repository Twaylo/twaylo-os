import { USER_ID, supabaseAdmin } from "./supabase";
import {
  JOURNEES_DEFAUT,
  TITRES_SEMIS_V1,
  bornerJournees,
  type JourneesConfig,
} from "./journees";

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
  const config = bornerJournees(journees);

  /*
   * Migration du premier semis. La toute première version avait écrit en base
   * des blocs inventés (« Tournage terrain »…) AVANT que Twaylo ne dicte ses
   * vrais immuables — et une base remplie masque les nouveaux défauts. Si un
   * titre de ce vieux semis traîne encore, c'est que la configuration est
   * celle-là : on la remplace par ses blocs réels, une fois pour toutes
   * (l'écriture fait disparaître les titres marqueurs, donc la migration ne
   * rejoue jamais).
   */
  const vieuxSemis = config.liste.some((j) =>
    j.blocs.some((b) => TITRES_SEMIS_V1.includes(b.titre)),
  );
  if (vieuxSemis) {
    const remplacement: JourneesConfig = {
      ...JOURNEES_DEFAUT,
      active: JOURNEES_DEFAUT.liste.some((j) => j.id === config.active)
        ? config.active
        : JOURNEES_DEFAUT.active,
    };
    await ecrireJournees(remplacement);
    return remplacement;
  }

  return config;
}

/**
 * Les blocs cochés d'UN jour donné — la journée type vécue, pas le modèle.
 *
 * Rangés sur la ligne du jour (pas la sentinelle) : c'est une donnée datée,
 * comme les habitudes cochées. Le modèle ne se remet jamais à zéro ; seules
 * les coches repartent vierges chaque matin, ce qui en fait des habitudes
 * de long terme plutôt que des tâches jetables.
 */
export async function lireBlocsFaits(jour: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", jour)
    .maybeSingle();

  if (error) throw error;
  const faits = (data?.habitudes as { journeeFaits?: unknown } | null)?.journeeFaits;
  return Array.isArray(faits) ? faits.slice(0, 48).map((f) => String(f).slice(0, 40)) : [];
}

export async function ecrireBlocsFaits(jour: string, faits: string[]): Promise<void> {
  const db = supabaseAdmin();

  // Relire-fusionner : la ligne du jour porte aussi les habitudes cochées,
  // le journal… — écrire les coches ne doit rien effacer d'autre.
  const { data, error: erreurLecture } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", jour)
    .maybeSingle();

  if (erreurLecture) throw erreurLecture;

  const { error } = await db.from("daily_logs").upsert(
    {
      user_id: USER_ID,
      jour,
      habitudes: {
        ...((data?.habitudes ?? {}) as object),
        journeeFaits: faits.slice(0, 48).map((f) => String(f).slice(0, 40)),
      },
    },
    { onConflict: "user_id,jour" },
  );

  if (error) throw error;
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
