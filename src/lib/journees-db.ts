import { USER_ID, supabaseAdmin } from "./supabase";
import { ecrireJour } from "./db";
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

  /*
   * Plus aucune migration ici, volontairement.
   *
   * Une version précédente remplaçait toute la configuration dès qu'UN bloc
   * portait l'un des onze titres du premier semis (« Libre », « Repas local »,
   * « Tournage / montage »…). Le but était de chasser des blocs inventés que
   * Twaylo n'avait jamais demandés, et c'est fait — mais ces libellés sont
   * parfaitement ordinaires : en nommer un ainsi aurait suffi, plus tard, à
   * faire disparaître d'un coup toutes ses journées types. Une lecture ne doit
   * pas pouvoir détruire ce qu'elle lit.
   */
  return bornerJournees(journees);
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
  /*
   * Par le canal commun de la journée, qui fusionne PUIS vérifie.
   *
   * Cette fonction faisait sa propre lecture-fusion-écriture sur la ligne du
   * jour — la même que celle des habitudes, des repas et de la revue. Deux
   * écritures qui se croisent, et l'une effaçait l'autre : le Brain cochant
   * un bloc pouvait annuler une habitude cochée à l'écran une seconde plus tôt.
   */
  await ecrireJour(jour, {
    etat: { journeeFaits: faits.slice(0, 48).map((f) => String(f).slice(0, 40)) },
  });
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
