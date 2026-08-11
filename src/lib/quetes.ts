import type { JourChiffre } from "./xp";

/**
 * Les quêtes du jour — trois objectifs tirés chaque matin.
 *
 * Ce que les bonus permanents ne font pas : SURPRENDRE. « Journée type pliée »
 * et « toutes les habitudes » sont les mêmes tous les jours ; au bout de trois
 * semaines on ne les lit plus. Une quête change, se lit en une ligne, et se
 * boucle dans la journée — c'est ce qui fait rouvrir l'application à 21 h pour
 * aller chercher les vingt points qui manquent.
 *
 * Trois principes tiennent l'ensemble :
 *
 * 1. TIRAGE DÉTERMINISTE. Les quêtes se déduisent de la date, sans hasard :
 *    recharger la page ne redistribue pas, et le téléphone montre exactement
 *    les mêmes que l'ordinateur. Un tirage aléatoire donnerait trois quêtes
 *    différentes à chaque rafraîchissement — autant dire aucune.
 * 2. UNE DE CHAQUE POIDS. Une facile, une moyenne, une difficile. Trois
 *    difficiles se soldent par zéro sur trois et la mécanique s'éteint ; trois
 *    faciles ne récompensent rien.
 * 3. RIEN QU'ON NE PUISSE FAIRE. Une quête sur le journal chez quelqu'un qui
 *    n'a pas le module Journal est une punition, pas un objectif : le tirage
 *    ne pioche que dans ce qui est installé.
 *
 * Le gain passe par le mécanisme des bonus, qui a déjà la bonne propriété :
 * écrit dans la journée le jour où il tombe, jamais recalculé. Une quête
 * gagnée reste gagnée même si le catalogue change demain.
 */

export type PoidsQuete = 1 | 2 | 3;

export type Quete = {
  id: string;
  emoji: string;
  titre: string;
  xp: number;
  cible: number;
  poids: PoidsQuete;
  /** Où on en est aujourd'hui. */
  lire: (j: JourChiffre) => number;
  /**
   * Le bloc d'accueil sans lequel la quête n'a pas de sens.
   *
   * On se cale sur les blocs plutôt que sur les modules : quelqu'un peut
   * garder l'onglet Journal sans la carte, ce qui reste jouable ; l'inverse
   * (la carte sans l'onglet) est déjà interdit par le catalogue.
   */
  besoin?: string;
};

const taches = (j: JourChiffre) =>
  j.principalesFaites + j.secondairesFaites + j.annexesFaites;

/**
 * Le catalogue. Les identifiants sont GRAVÉS : ils partent en base dans la
 * liste des bonus du jour, et l'XP d'une journée passée se relit à partir
 * d'eux. En renommer un ferait disparaître des points déjà gagnés.
 */
export const QUETES: Quete[] = [
  /* ---- Faciles : bouclées presque sans y penser ---- */
  { id: "b2", emoji: "📅", titre: "Cocher 2 blocs de ta journée", xp: 15, cible: 2, poids: 1, lire: (j) => j.blocsFaits, besoin: "journee" },
  { id: "h2", emoji: "☑️", titre: "Tenir 2 habitudes", xp: 15, cible: 2, poids: 1, lire: (j) => j.habitudesFaites, besoin: "habitudes" },
  { id: "t2", emoji: "✅", titre: "Boucler 2 tâches", xp: 15, cible: 2, poids: 1, lire: taches, besoin: "taches" },
  { id: "chose", emoji: "🎯", titre: "Faire la chose du jour", xp: 20, cible: 1, poids: 1, lire: (j) => (j.uneChoseFaite ? 1 : 0) },
  { id: "r2", emoji: "🍽", titre: "Noter 2 repas", xp: 15, cible: 2, poids: 1, lire: (j) => j.repas, besoin: "nutrition" },
  { id: "a2", emoji: "▫️", titre: "Sortir 2 annexes de ta tête", xp: 15, cible: 2, poids: 1, lire: (j) => j.annexesFaites, besoin: "taches" },

  /* ---- Moyennes : il faut s'y mettre ---- */
  { id: "b4", emoji: "📅", titre: "Cocher 4 blocs de ta journée", xp: 30, cible: 4, poids: 2, lire: (j) => j.blocsFaits, besoin: "journee" },
  { id: "h4", emoji: "☑️", titre: "Tenir 4 habitudes", xp: 30, cible: 4, poids: 2, lire: (j) => j.habitudesFaites, besoin: "habitudes" },
  { id: "f1", emoji: "⭐", titre: "Boucler un focus principal", xp: 30, cible: 1, poids: 2, lire: (j) => j.principalesFaites, besoin: "taches" },
  { id: "t4", emoji: "✅", titre: "Boucler 4 tâches", xp: 30, cible: 4, poids: 2, lire: taches, besoin: "taches" },
  { id: "journal", emoji: "✍️", titre: "Écrire ton journal du soir", xp: 30, cible: 1, poids: 2, lire: (j) => (j.journalEcrit ? 1 : 0), besoin: "journal" },
  {
    id: "trio",
    emoji: "🔗",
    titre: "Un bloc, une habitude, une tâche",
    xp: 30,
    cible: 3,
    poids: 2,
    lire: (j) =>
      Math.min(1, j.blocsFaits) + Math.min(1, j.habitudesFaites) + Math.min(1, taches(j)),
  },

  /* ---- Difficiles : la quête qui fait la journée ---- */
  { id: "b6", emoji: "🏗", titre: "Cocher 6 blocs de ta journée", xp: 55, cible: 6, poids: 3, lire: (j) => j.blocsFaits, besoin: "journee" },
  { id: "f2", emoji: "🌟", titre: "Boucler 2 focus principaux", xp: 55, cible: 2, poids: 3, lire: (j) => j.principalesFaites, besoin: "taches" },
  { id: "t7", emoji: "🧹", titre: "Boucler 7 tâches", xp: 55, cible: 7, poids: 3, lire: taches, besoin: "taches" },
  { id: "h6", emoji: "🧘", titre: "Tenir 6 habitudes", xp: 55, cible: 6, poids: 3, lire: (j) => j.habitudesFaites, besoin: "habitudes" },
  {
    id: "complet",
    emoji: "🌗",
    titre: "Un bloc, une habitude, un focus et le journal",
    xp: 55,
    cible: 4,
    poids: 3,
    lire: (j) =>
      Math.min(1, j.blocsFaits) +
      Math.min(1, j.habitudesFaites) +
      Math.min(1, j.principalesFaites) +
      (j.journalEcrit ? 1 : 0),
  },
];

export const QUETE_PAR_ID = new Map(QUETES.map((q) => [q.id, q]));

/** Le préfixe qui distingue une quête d'un bonus permanent dans la liste du jour. */
export const PREFIXE_QUETE = "q:";

export const cleQuete = (id: string) => `${PREFIXE_QUETE}${id}`;

/** La quête derrière un identifiant de bonus, ou null si ce n'en est pas un. */
export function queteDepuisCle(cle: string): Quete | null {
  if (!cle.startsWith(PREFIXE_QUETE)) return null;
  return QUETE_PAR_ID.get(cle.slice(PREFIXE_QUETE.length)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Le tirage                                                           */
/* ------------------------------------------------------------------ */

/**
 * Un nombre stable tiré d'une chaîne (FNV-1a 32 bits).
 *
 * On n'utilise pas `Math.random()` : le tirage doit donner le même résultat au
 * rechargement, sur le téléphone comme sur l'ordinateur, et le même toute la
 * journée. Une date suffit à le fixer.
 */
function empreinte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Les trois quêtes du jour : une facile, une moyenne, une difficile. */
export function quetesDuJour(jour: string, blocsInstalles: readonly string[]): Quete[] {
  const dispo = new Set(blocsInstalles);
  const tirees: Quete[] = [];

  for (const poids of [1, 2, 3] as const) {
    /*
     * Le choix se fait dans une liste TRIÉE par identifiant, pas dans l'ordre
     * du fichier : ajouter une quête au milieu du catalogue ne doit pas
     * redistribuer toutes les quêtes des jours déjà passés.
     */
    const candidates = QUETES.filter(
      (q) => q.poids === poids && (!q.besoin || dispo.has(q.besoin)),
    ).sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0) continue;
    tirees.push(candidates[empreinte(`${jour}:${poids}`) % candidates.length]);
  }

  return tirees;
}

/** Les quêtes du jour déjà bouclées, sous leur forme « clé de bonus ». */
export function quetesBouclees(quetes: readonly Quete[], j: JourChiffre): string[] {
  return quetes.filter((q) => q.lire(j) >= q.cible).map((q) => cleQuete(q.id));
}
