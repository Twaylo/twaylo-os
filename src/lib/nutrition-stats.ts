import { supabaseAdmin, USER_ID } from "./supabase";

/**
 * L'historique nutrition, lu à travers le temps.
 *
 * Rien à figer, contrairement aux tâches : chaque journée écrivait déjà ses
 * repas dans `daily_logs.habitudes.nutrition.repas`. La matière est là depuis
 * le premier jour, elle n'avait jamais été relue en travers.
 */

const JOUR_SENTINELLE = "2000-01-01";

/** Les cibles par défaut — mêmes valeurs que la carte Nutrition. */
export const OBJECTIFS = { kcal: 2800, p: 180, c: 300, f: 80 };

type Repas = { kcal?: number; p?: number; c?: number; f?: number };

export type JourNutrition = {
  jour: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Faux si aucun repas n'a été noté ce jour-là. */
  mange: boolean;
};

export type StatsNutrition = {
  jours: JourNutrition[];
  /** Moyennes sur les seuls jours où quelque chose a été noté. */
  moyenne: { kcal: number; p: number; c: number; f: number };
  joursSuivis: number;
  /** Jours d'affilée où l'objectif protéines a été atteint. */
  serieProteines: number;
  objectifs: typeof OBJECTIFS;
  premierJourSuivi: string | null;
};

function jourParis(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function sommeJour(repas: Repas[]): { kcal: number; p: number; c: number; f: number } {
  const total = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const r of repas) {
    total.kcal += r.kcal ?? 0;
    total.p += r.p ?? 0;
    total.c += r.c ?? 0;
    total.f += r.f ?? 0;
  }
  return total;
}

export async function lireStatsNutrition(
  aujourdhui: string = jourParis(new Date()),
  fenetre = 120,
): Promise<StatsNutrition> {
  const debut = decaler(aujourdhui, -(fenetre - 1));

  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("jour, habitudes")
    .eq("user_id", USER_ID)
    .neq("jour", JOUR_SENTINELLE)
    .gte("jour", debut)
    .lte("jour", aujourdhui)
    .order("jour", { ascending: true });

  if (error) throw error;

  /** jour → repas notés ce jour-là. */
  const parJour = new Map<string, Repas[]>();
  for (const ligne of data ?? []) {
    const repas = (ligne.habitudes as { nutrition?: { repas?: Repas[] } } | null)
      ?.nutrition?.repas;
    if (Array.isArray(repas) && repas.length > 0) parJour.set(ligne.jour as string, repas);
  }

  const premierJourSuivi = parJour.size ? [...parJour.keys()][0] : null;

  const jours: JourNutrition[] = [];
  if (premierJourSuivi) {
    for (let j = premierJourSuivi; j <= aujourdhui; j = decaler(j, 1)) {
      const repas = parJour.get(j);
      if (!repas) {
        jours.push({ jour: j, kcal: 0, p: 0, c: 0, f: 0, mange: false });
        continue;
      }
      const s = sommeJour(repas);
      jours.push({ jour: j, ...s, mange: true });
    }
  }

  const suivis = jours.filter((j) => j.mange);
  const moyenne =
    suivis.length === 0
      ? { kcal: 0, p: 0, c: 0, f: 0 }
      : {
          kcal: Math.round(suivis.reduce((n, j) => n + j.kcal, 0) / suivis.length),
          p: Math.round(suivis.reduce((n, j) => n + j.p, 0) / suivis.length),
          c: Math.round(suivis.reduce((n, j) => n + j.c, 0) / suivis.length),
          f: Math.round(suivis.reduce((n, j) => n + j.f, 0) / suivis.length),
        };

  /*
   * Série protéines : les protéines sont ce qui compte le plus pour tenir la
   * masse quand on tourne toute la journée. Un jour compte s'il atteint la
   * cible ; la journée en cours ne casse pas la série tant qu'elle est vide.
   */
  const atteintProt = (jour: string) => {
    const r = parJour.get(jour);
    return r ? sommeJour(r).p >= OBJECTIFS.p : false;
  };
  let serieProteines = 0;
  let curseur = atteintProt(aujourdhui) ? aujourdhui : decaler(aujourdhui, -1);
  while (atteintProt(curseur)) {
    serieProteines += 1;
    curseur = decaler(curseur, -1);
  }

  return {
    jours,
    moyenne,
    joursSuivis: suivis.length,
    serieProteines,
    objectifs: OBJECTIFS,
    premierJourSuivi,
  };
}
