import { supabaseAdmin, USER_ID } from "./supabase";
import type { SnapshotTaches } from "./db";

/**
 * L'historique de complétion des tâches, lu à travers le temps.
 *
 * Les tâches vivent dans leur table, remise à neuf chaque matin. Ce qui
 * survit, ce sont les instantanés figés jour par jour dans
 * `daily_logs.habitudes.taches` — combien de tâches ce jour-là, combien de
 * faites, et le focus principal à part.
 *
 * L'historique commence au premier jour instantané : avant qu'on ne se mette
 * à figer, il n'y a rien, et afficher des mois vides n'apprendrait rien.
 */

export type JourTache = {
  jour: string;
  total: number;
  faites: number;
  /** 0 à 1, sur toutes les tâches. */
  ratio: number;
  principalTotal: number;
  principalFaites: number;
  /** Vrai si le focus principal a été entièrement bouclé (ou, à défaut, tout). */
  boucle: boolean;
};

export type StatsTaches = {
  jours: JourTache[];
  /** Jours d'affilée « bouclés » jusqu'à aujourd'hui (ou hier si vierge). */
  serie: number;
  meilleureSerie: number;
  /** Moyenne du taux de complétion sur tous les jours suivis. */
  tauxGlobal: number;
  /** Taux moyen par jour de la semaine, 0 = lundi. */
  parJourSemaine: { jour: number; taux: number; jours: number }[];
  jourFaible: number | null;
  premierJourSuivi: string | null;
};

const JOUR_SENTINELLE = "2000-01-01";

function jourParis(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Avance ou recule d'un nombre de jours, en UTC pour ne pas sauter d'heure d'été. */
function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function indexJourSemaine(jour: string): number {
  return (new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Une journée est « bouclée » quand le focus principal est entièrement fait.
 *
 * S'il n'y avait pas de focus principal ce jour-là, on retombe sur « toutes
 * les tâches faites ». Une journée sans aucune tâche ne compte pas — ni
 * réussie ni ratée, elle est simplement vide.
 */
function estBoucle(s: SnapshotTaches): boolean {
  if (s.principalTotal > 0) return s.principalFaites >= s.principalTotal;
  return s.total > 0 && s.faites >= s.total;
}

export async function lireStatsTaches(
  aujourdhui: string = jourParis(new Date()),
  fenetre = 120,
): Promise<StatsTaches> {
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

  /** jour → instantané, uniquement les jours qui en ont un avec des tâches. */
  const parJour = new Map<string, SnapshotTaches>();
  for (const ligne of data ?? []) {
    const t = (ligne.habitudes as { taches?: SnapshotTaches } | null)?.taches;
    if (t && typeof t.total === "number" && t.total > 0) {
      parJour.set(ligne.jour as string, t);
    }
  }

  const premierJourSuivi = parJour.size ? [...parJour.keys()][0] : null;

  const jours: JourTache[] = [];
  if (premierJourSuivi) {
    for (let j = premierJourSuivi; j <= aujourdhui; j = decaler(j, 1)) {
      const s = parJour.get(j);
      if (!s) {
        // Jour sans activité : ratio nul, mais on garde la case pour le
        // calendrier — un trou dans la grille se lit comme un jour manqué.
        jours.push({
          jour: j,
          total: 0,
          faites: 0,
          ratio: 0,
          principalTotal: 0,
          principalFaites: 0,
          boucle: false,
        });
        continue;
      }
      jours.push({
        jour: j,
        total: s.total,
        faites: s.faites,
        ratio: s.total ? s.faites / s.total : 0,
        principalTotal: s.principalTotal,
        principalFaites: s.principalFaites,
        boucle: estBoucle(s),
      });
    }
  }

  /* ---- Série de jours bouclés ---- */
  const bouclePar = (jour: string) => parJour.get(jour) !== undefined && estBoucle(parJour.get(jour)!);
  let serie = 0;
  let curseur = bouclePar(aujourdhui) ? aujourdhui : decaler(aujourdhui, -1);
  while (bouclePar(curseur)) {
    serie += 1;
    curseur = decaler(curseur, -1);
  }

  let meilleureSerie = 0;
  let courante = 0;
  for (const j of jours) {
    if (j.boucle) {
      courante += 1;
      meilleureSerie = Math.max(meilleureSerie, courante);
    } else {
      courante = 0;
    }
  }

  /* ---- Rythme de la semaine ---- */
  const cumul = Array.from({ length: 7 }, () => ({ somme: 0, n: 0 }));
  for (const j of jours) {
    const idx = indexJourSemaine(j.jour);
    cumul[idx].somme += j.ratio;
    cumul[idx].n += 1;
  }
  const parJourSemaine = cumul.map((c, jour) => ({
    jour,
    taux: c.n ? c.somme / c.n : 0,
    jours: c.n,
  }));

  const exploitables = parJourSemaine.filter((p) => p.jours >= 3);
  let jourFaible: number | null = null;
  if (exploitables.length >= 5) {
    const moyenne = exploitables.reduce((n, p) => n + p.taux, 0) / exploitables.length;
    const pire = exploitables.reduce((a, b) => (a.taux < b.taux ? a : b));
    if (pire.taux < moyenne - 0.2) jourFaible = pire.jour;
  }

  return {
    jours,
    serie,
    meilleureSerie,
    tauxGlobal: jours.length ? jours.reduce((n, j) => n + j.ratio, 0) / jours.length : 0,
    parJourSemaine,
    jourFaible,
    premierJourSuivi,
  };
}
