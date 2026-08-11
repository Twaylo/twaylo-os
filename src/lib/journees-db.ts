import { USER_ID, uid, supabaseAdmin } from "./supabase";
import { ecrireJour } from "./db";
import { lireSentinelle, majSentinelle } from "./sentinelle";
import {
  JOURNEES_DEFAUT,
  JOURNEE_VIERGE,
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

export async function lireJournees(): Promise<JourneesConfig> {
  const journees = (await lireSentinelle()).journees as
    | Partial<JourneesConfig>
    | undefined;
  /*
   * Rien d'enregistré : le programme de Twaylo chez Twaylo, un modèle vide
   * ailleurs.
   *
   * Sans cette distinction, chaque OS créé s'ouvrait sur « 07:00 Réveil +
   * sport », « 08:00 Script les shorts du jour », « 17:00 Passage Momentum » —
   * la journée d'un YouTubeur, servie à un étudiant en droit. C'est ensuite le
   * sas qui écrit une vraie journée à partir des réponses données.
   */
  if (!journees || typeof journees !== "object") {
    return (await uid()) === USER_ID ? JOURNEES_DEFAUT : JOURNEE_VIERGE;
  }

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
    .eq("user_id", (await uid()))
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

/**
 * Par l'écrivain vérifié de la sentinelle.
 *
 * Cette fonction relisait puis écrasait de son côté. Cela protège d'un
 * écrivain distrait, pas de deux écritures qui se croisent : modifier sa
 * journée type pendant que l'OS enregistre l'ordre des tâches ou une
 * habitude pouvait faire disparaître l'autre réglage.
 */
export async function ecrireJournees(config: JourneesConfig): Promise<void> {
  await majSentinelle({ journees: bornerJournees(config) });
}
