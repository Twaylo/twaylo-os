import { supabaseAdmin, uid } from "./supabase";
import {
  CUMULS_VIDES,
  chiffrerJourStocke,
  jourALaisseUneTrace,
  xpDuJour,
  type Cumuls,
} from "./xp";

/**
 * L'historique de progression, relu depuis les journées déjà enregistrées.
 *
 * Rien de neuf à écrire pour que ça marche : chaque journée range déjà ses
 * coches, son journal et ses repas dans `daily_logs`. On rejoue simplement le
 * barème dessus. Un OS installé depuis trois mois affiche donc son vrai niveau
 * dès la première ouverture de cette page, sans période d'amorçage.
 */

const JOUR_SENTINELLE = "2000-01-01";
/** Un peu plus d'un an : au-delà, le niveau ne bouge plus assez pour valoir la lecture. */
const FENETRE = 400;

export type Progression = {
  /** Du plus ancien au plus récent. Contient aussi aujourd'hui. */
  jours: { jour: string; xp: number }[];
  /** Somme de l'XP de tous les jours STRICTEMENT avant aujourd'hui. */
  xpAvant: number;
  /** L'XP d'aujourd'hui telle qu'elle est enregistrée — le navigateur la recalcule en direct. */
  xpAujourdhui: number;
  serie: number;
  /**
   * Vrai si la journée en cours est DÉJÀ comptée dans `serie`.
   *
   * Le navigateur en a besoin : tant qu'aujourd'hui est vierge, la série
   * repart d'hier, et une coche faite maintenant doit faire avancer le
   * compteur à l'écran sans attendre un rechargement.
   */
  aujourdhuiCompte: boolean;
  meilleureSerie: number;
  /**
   * Les compteurs de toujours, **aujourd'hui exclu**.
   *
   * Le navigateur y ajoute l'état vivant du jour : c'est ce qui fait qu'un
   * exploit tombe au moment du geste, et non le lendemain. Les inclure ici
   * aussi les compterait deux fois.
   */
  cumuls: Cumuls;
  /** id de bloc → jours d'affilée où il a été coché. */
  seriesBlocs: Record<string, number>;
  record: { jour: string; xp: number } | null;
  /** Le dernier jour qui a laissé une trace, aujourd'hui exclu. */
  dernierJourRempli: string | null;
  /** Les bonus déjà gagnés aujourd'hui — pour ne pas les refêter au rechargement. */
  bonusAujourdhui: string[];
};

/** Avance ou recule d'un nombre de jours, en UTC pour ne pas sauter d'heure d'été. */
function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function lireProgression(aujourdhui: string): Promise<Progression> {
  const debut = decaler(aujourdhui, -(FENETRE - 1));

  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("jour, habitudes, journal_texte")
    .eq("user_id", (await uid()))
    .neq("jour", JOUR_SENTINELLE)
    .gte("jour", debut)
    .lte("jour", aujourdhui)
    .order("jour", { ascending: true });

  if (error) throw error;

  const jours: { jour: string; xp: number }[] = [];
  const remplis = new Set<string>();
  /** id de bloc → jours où il a été coché. */
  const blocsParJour = new Map<string, Set<string>>();
  const cumuls: Cumuls = { ...CUMULS_VIDES };

  let xpAvant = 0;
  let xpAujourdhui = 0;
  let record: { jour: string; xp: number } | null = null;
  let dernierJourRempli: string | null = null;
  let bonusAujourdhui: string[] = [];

  for (const ligne of data ?? []) {
    const jour = ligne.jour as string;
    const chiffre = chiffrerJourStocke(ligne.habitudes, ligne.journal_texte as string | null);
    const xp = xpDuJour(chiffre);

    jours.push({ jour, xp });
    if (jour === aujourdhui) {
      xpAujourdhui = xp;
      bonusAujourdhui = chiffre.bonus;
    } else {
      xpAvant += xp;
    }

    if (jourALaisseUneTrace(chiffre)) {
      remplis.add(jour);
      if (jour !== aujourdhui) {
        dernierJourRempli = jour;
        cumuls.joursRemplis += 1;
      }
    }

    if (!record || xp > record.xp) record = { jour, xp };

    // Les séries par bloc, elles, comptent aujourd'hui : c'est une suite de
    // jours, pas une somme, donc rien n'est compté deux fois.
    const ids = (ligne.habitudes as { journeeFaits?: unknown } | null)?.journeeFaits;
    if (Array.isArray(ids)) {
      for (const brut of ids) {
        const id = String(brut);
        const vus = blocsParJour.get(id) ?? new Set<string>();
        vus.add(jour);
        blocsParJour.set(id, vus);
      }
    }

    /*
     * Les cumuls s'arrêtent à hier.
     *
     * Le navigateur ajoute par-dessus l'état vivant du jour — la coche qu'on
     * vient de faire, pas encore écrite en base. Compter aussi la ligne
     * d'aujourd'hui ici la compterait deux fois, et un exploit tomberait deux
     * fois plus tôt qu'il ne le doit.
     */
    if (jour === aujourdhui) continue;

    cumuls.blocs += chiffre.blocsFaits;
    cumuls.habitudes += chiffre.habitudesFaites;
    cumuls.taches +=
      chiffre.principalesFaites + chiffre.secondairesFaites + chiffre.annexesFaites;
    if (chiffre.journalEcrit) cumuls.journaux += 1;
    if (chiffre.bonus.includes("parfaite")) cumuls.parfaites += 1;
    if (xp > cumuls.meilleurJour) cumuls.meilleurJour = xp;
  }

  // Un record à zéro n'est pas un record.
  if (record && record.xp <= 0) record = null;

  return {
    jours,
    xpAvant,
    xpAujourdhui,
    serie: serieJusqua(remplis, aujourdhui),
    aujourdhuiCompte: remplis.has(aujourdhui),
    meilleureSerie: meilleureSerieDe(remplis),
    cumuls: { ...cumuls, meilleureSerie: meilleureSerieDe(remplis) },
    seriesBlocs: Object.fromEntries(
      [...blocsParJour.entries()]
        .map(([id, vus]) => [id, serieJusqua(vus, aujourdhui)] as const)
        .filter(([, n]) => n > 0),
    ),
    record,
    dernierJourRempli,
    bonusAujourdhui,
  };
}

/**
 * Les jours d'affilée jusqu'à aujourd'hui.
 *
 * La journée en cours ne casse rien tant qu'elle est vide : à neuf heures du
 * matin rien n'est encore coché, et remettre le compteur à zéro chaque nuit
 * rendrait la série absurde. On repart donc d'hier si aujourd'hui est vierge.
 */
function serieJusqua(remplis: Set<string>, aujourdhui: string): number {
  let curseur = remplis.has(aujourdhui) ? aujourdhui : decaler(aujourdhui, -1);
  let serie = 0;
  while (remplis.has(curseur)) {
    serie += 1;
    curseur = decaler(curseur, -1);
  }
  return serie;
}

/** La plus longue suite jamais tenue dans la fenêtre lue. */
function meilleureSerieDe(remplis: Set<string>): number {
  if (remplis.size === 0) return 0;
  const tries = [...remplis].sort();
  let meilleure = 1;
  let courante = 1;
  for (let i = 1; i < tries.length; i++) {
    courante = tries[i] === decaler(tries[i - 1], 1) ? courante + 1 : 1;
    if (courante > meilleure) meilleure = courante;
  }
  return meilleure;
}
