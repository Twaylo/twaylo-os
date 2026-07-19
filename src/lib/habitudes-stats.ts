import { supabaseAdmin, USER_ID } from "./supabase";
import { lireHabitudesDef, type HabitudeDef } from "./db";

/**
 * L'historique des habitudes, lu à travers le temps.
 *
 * Rien à migrer : chaque journée écrit déjà ses habitudes cochées dans
 * `daily_logs.habitudes.faites`. La matière est là depuis le premier jour,
 * elle n'avait simplement jamais été relue autrement qu'au jour le jour.
 *
 * Ce que ce module cherche, ce n'est pas un pourcentage. Un taux de 71 % ne
 * dit rien de ce qu'il faut corriger. Ce qui se corrige, c'est :
 *   - une série qui tient ou qui vient de casser,
 *   - une pente — les sept derniers jours contre les sept précédents,
 *   - un creux, c'est-à-dire plusieurs jours d'affilée à l'arrêt,
 *   - un jour de la semaine où ça lâche toujours.
 */

export type JourStat = {
  jour: string;
  /** Nombre d'habitudes cochées ce jour-là. */
  faites: number;
  /** Sur combien, d'après les habitudes actuellement définies. */
  total: number;
  /** 0 à 1. */
  ratio: number;
};

export type HabitudeStat = {
  id: string;
  nom: string;
  categorie: string;
  /** Jours d'affilée jusqu'à aujourd'hui (ou hier si aujourd'hui est vierge). */
  serie: number;
  meilleureSerie: number;
  /** Taux sur les 7 et 30 derniers jours suivis. */
  taux7: number;
  taux30: number;
  /** Points de pourcentage gagnés ou perdus entre les deux dernières semaines. */
  tendance: number;
  /** Dernier jour où elle a été cochée, ou null. */
  dernierJour: string | null;
  /** Les options les plus souvent choisies (« Gym » plutôt que « Vélo »). */
  variantes: { nom: string; fois: number }[];
};

export type Creux = {
  debut: string;
  fin: string;
  jours: number;
  ratioMoyen: number;
};

export type StatsHabitudes = {
  /** Du plus ancien au plus récent, uniquement depuis le premier jour suivi. */
  jours: JourStat[];
  habitudes: HabitudeStat[];
  creux: Creux[];
  /** Taux moyen par jour de la semaine, 0 = lundi. */
  parJourSemaine: { jour: number; taux: number; jours: number }[];
  /** Le jour de la semaine le plus faible, s'il se détache nettement. */
  jourFaible: number | null;
  premierJourSuivi: string | null;
  tauxGlobal: number;
};

const JOUR_SENTINELLE = "2000-01-01";

/** Le jour local de Twaylo, en Europe/Paris. */
function jourParis(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Avance ou recule d'un nombre de jours, en UTC pour ne pas sauter d'heure d'été. */
function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0 = lundi, 6 = dimanche. */
export function indexJourSemaine(jour: string): number {
  return (new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export async function lireStatsHabitudes(
  aujourdhui: string = jourParis(new Date()),
  fenetre = 120,
): Promise<StatsHabitudes> {
  const definitions = await lireHabitudesDef();
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

  /** jour → { habitudeId → options cochées } */
  const parJour = new Map<string, Record<string, string[]>>();
  for (const ligne of data ?? []) {
    const faites = (ligne.habitudes as { faites?: Record<string, string[]> } | null)?.faites;
    if (faites) parJour.set(ligne.jour as string, faites);
  }

  /*
   * Le suivi commence au premier jour où quelque chose a été coché.
   *
   * Sans ce point de départ, un OS installé hier afficherait quatre mois de
   * cases vides et un taux de 2 % — un tableau décourageant qui ne décrit
   * rien de réel.
   */
  let premierJourSuivi: string | null = null;
  for (const [jour, faites] of parJour) {
    if (Object.values(faites).some((o) => o.length > 0)) {
      premierJourSuivi = jour;
      break;
    }
  }

  const jours: JourStat[] = [];
  if (premierJourSuivi) {
    for (let j = premierJourSuivi; j <= aujourdhui; j = decaler(j, 1)) {
      const faites = parJour.get(j) ?? {};
      const nb = definitions.filter((h) => (faites[h.id] ?? []).length > 0).length;
      jours.push({
        jour: j,
        faites: nb,
        total: definitions.length,
        ratio: definitions.length ? nb / definitions.length : 0,
      });
    }
  }

  return {
    jours,
    habitudes: definitions.map((h) => statsUneHabitude(h, jours, parJour, aujourdhui)),
    creux: detecterCreux(jours),
    ...rythmeHebdomadaire(jours),
    premierJourSuivi,
    tauxGlobal: jours.length
      ? jours.reduce((n, j) => n + j.ratio, 0) / jours.length
      : 0,
  };
}

function statsUneHabitude(
  h: HabitudeDef,
  jours: JourStat[],
  parJour: Map<string, Record<string, string[]>>,
  aujourdhui: string,
): HabitudeStat {
  const faitLe = (jour: string) => (parJour.get(jour)?.[h.id] ?? []).length > 0;

  /*
   * La série ne casse pas parce que la journée en cours n'est pas finie.
   * À neuf heures du matin rien n'est encore coché : repartir de zéro chaque
   * nuit rendrait le compteur absurde. On repart donc d'hier si aujourd'hui
   * est vierge.
   */
  let serie = 0;
  let curseur = faitLe(aujourdhui) ? aujourdhui : decaler(aujourdhui, -1);
  while (faitLe(curseur)) {
    serie += 1;
    curseur = decaler(curseur, -1);
  }

  let meilleureSerie = 0;
  let courante = 0;
  for (const j of jours) {
    if (faitLe(j.jour)) {
      courante += 1;
      meilleureSerie = Math.max(meilleureSerie, courante);
    } else {
      courante = 0;
    }
  }

  const taux = (derniers: JourStat[]) =>
    derniers.length ? derniers.filter((j) => faitLe(j.jour)).length / derniers.length : 0;

  const sept = jours.slice(-7);
  const septPrecedents = jours.slice(-14, -7);
  const trente = jours.slice(-30);

  let dernierJour: string | null = null;
  for (let i = jours.length - 1; i >= 0; i--) {
    if (faitLe(jours[i].jour)) {
      dernierJour = jours[i].jour;
      break;
    }
  }

  // Quelles variantes il pratique vraiment — « Gym » ou « Vélo ».
  const compte = new Map<string, number>();
  for (const j of jours) {
    for (const option of parJour.get(j.jour)?.[h.id] ?? []) {
      if (option === "fait") continue; // marqueur des habitudes sans variante
      compte.set(option, (compte.get(option) ?? 0) + 1);
    }
  }

  return {
    id: h.id,
    nom: h.nom,
    categorie: h.categorie,
    serie,
    meilleureSerie,
    taux7: taux(sept),
    taux30: taux(trente),
    tendance: Math.round((taux(sept) - taux(septPrecedents)) * 100),
    dernierJour,
    variantes: [...compte.entries()]
      .map(([nom, fois]) => ({ nom, fois }))
      .sort((a, b) => b.fois - a.fois),
  };
}

/**
 * Les creux : au moins trois jours d'affilée sous 25 %.
 *
 * Trois jours et pas deux, parce qu'un week-end mou n'est pas un décrochage.
 * C'est la répétition qui signale un vrai moment de bas — celui qu'on veut
 * pouvoir relire pour comprendre ce qui s'est passé cette semaine-là.
 */
function detecterCreux(jours: JourStat[]): Creux[] {
  const SEUIL = 0.25;
  const MINIMUM = 3;

  const creux: Creux[] = [];
  let debut: number | null = null;

  const fermer = (fin: number) => {
    if (debut === null) return;
    const tranche = jours.slice(debut, fin);
    if (tranche.length >= MINIMUM) {
      creux.push({
        debut: tranche[0].jour,
        fin: tranche[tranche.length - 1].jour,
        jours: tranche.length,
        ratioMoyen: tranche.reduce((n, j) => n + j.ratio, 0) / tranche.length,
      });
    }
    debut = null;
  };

  jours.forEach((j, i) => {
    if (j.ratio < SEUIL) {
      if (debut === null) debut = i;
    } else {
      fermer(i);
    }
  });
  fermer(jours.length);

  // Les plus récents d'abord : ce sont ceux sur lesquels on peut encore agir.
  return creux.reverse();
}

/**
 * Le rythme de la semaine.
 *
 * Un taux global ne dit pas quoi corriger ; « tu lâches tous les dimanches »,
 * si. On ne désigne un jour faible que s'il décroche nettement — sinon on
 * ferait passer du bruit pour une tendance.
 */
function rythmeHebdomadaire(jours: JourStat[]): {
  parJourSemaine: { jour: number; taux: number; jours: number }[];
  jourFaible: number | null;
} {
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

  // Il faut au moins trois occurrences de chaque jour pour que la comparaison
  // veuille dire quelque chose.
  const exploitables = parJourSemaine.filter((p) => p.jours >= 3);
  if (exploitables.length < 5) return { parJourSemaine, jourFaible: null };

  const moyenne = exploitables.reduce((n, p) => n + p.taux, 0) / exploitables.length;
  const pire = exploitables.reduce((a, b) => (a.taux < b.taux ? a : b));

  // Vingt points sous la moyenne : en dessous, c'est du bruit.
  return {
    parJourSemaine,
    jourFaible: pire.taux < moyenne - 0.2 ? pire.jour : null,
  };
}
