/**
 * Le moteur de jeu de l'OS : XP, niveaux, bonus, exploits.
 *
 * Pur, sans base et sans React — la même fonction sert au navigateur (qui
 * calcule l'XP du jour en direct, à chaque coche) et au serveur (qui rejoue
 * l'historique pour le bilan et les messages Telegram). Un seul barème, donc
 * jamais deux chiffres différents pour la même journée.
 *
 * Règle de conception qui tient tout le reste debout : **l'XP acquise ne
 * redescend jamais**. Les points par geste sont comptés sur ce qui est stocké
 * (le nombre de coches d'un jour ne change plus une fois le jour passé), et
 * les bonus de journée complète sont ÉCRITS dans la journée le jour où ils
 * tombent. Sans ça, ajouter une habitude ferait rétroactivement perdre le
 * bonus « toutes les habitudes » de tous les jours passés, et le niveau
 * baisserait tout seul — le plus sûr moyen de dégoûter quelqu'un d'un
 * compteur.
 */

/* ------------------------------------------------------------------ */
/* Le barème                                                           */
/* ------------------------------------------------------------------ */

export const BAREME = {
  /** Un bloc de la journée type coché. */
  bloc: 10,
  /** Une habitude cochée (peu importe le nombre d'options). */
  habitude: 6,
  tachePrincipale: 25,
  tacheSecondaire: 12,
  tacheAnnexe: 5,
  /** Le journal du soir écrit (au moins quelques mots). */
  journal: 15,
  /** « La chose du jour » cochée. */
  uneChose: 20,
  /** Un repas noté dans Nutrition. */
  repas: 4,
} as const;

/** Ce qu'on sait d'une journée, réduit aux nombres qui rapportent. */
export type JourChiffre = {
  blocsFaits: number;
  blocsTotal: number;
  habitudesFaites: number;
  habitudesTotal: number;
  principalesFaites: number;
  principalesTotal: number;
  secondairesFaites: number;
  annexesFaites: number;
  journalEcrit: boolean;
  uneChoseFaite: boolean;
  repas: number;
  /** Les bonus déjà acquis ce jour-là (lus dans la journée stockée). */
  bonus: string[];
};

export const JOUR_CHIFFRE_VIDE: JourChiffre = {
  blocsFaits: 0,
  blocsTotal: 0,
  habitudesFaites: 0,
  habitudesTotal: 0,
  principalesFaites: 0,
  principalesTotal: 0,
  secondairesFaites: 0,
  annexesFaites: 0,
  journalEcrit: false,
  uneChoseFaite: false,
  repas: 0,
  bonus: [],
};

/* ------------------------------------------------------------------ */
/* Les bonus de journée — gagnés une fois, gardés pour toujours        */
/* ------------------------------------------------------------------ */

export type Bonus = {
  id: string;
  label: string;
  emoji: string;
  xp: number;
  /** Le texte de la fenêtre de récompense. */
  cri: string;
};

export const BONUS: Bonus[] = [
  {
    id: "journee",
    label: "Journée type pliée",
    emoji: "📅",
    xp: 40,
    cri: "Tous les blocs cochés. La journée est pliée.",
  },
  {
    id: "habitudes",
    label: "Toutes les habitudes",
    emoji: "☑️",
    xp: 30,
    cri: "Pas une habitude lâchée aujourd'hui.",
  },
  {
    id: "focus",
    label: "Focus principal bouclé",
    emoji: "⭐",
    xp: 35,
    cri: "L'essentiel est fait. Le reste, c'est du bonus.",
  },
  {
    id: "parfaite",
    label: "Journée parfaite",
    emoji: "🏆",
    xp: 75,
    cri: "Blocs, habitudes, focus : rien n'est passé à travers.",
  },
];

const BONUS_PAR_ID = new Map(BONUS.map((b) => [b.id, b]));

/** Les bonus que cette journée MÉRITE, d'après son état actuel. */
export function bonusMerites(j: JourChiffre): string[] {
  const gagnes: string[] = [];
  const journee = j.blocsTotal > 0 && j.blocsFaits >= j.blocsTotal;
  const habitudes = j.habitudesTotal > 0 && j.habitudesFaites >= j.habitudesTotal;
  const focus = j.principalesTotal > 0 && j.principalesFaites >= j.principalesTotal;
  if (journee) gagnes.push("journee");
  if (habitudes) gagnes.push("habitudes");
  if (focus) gagnes.push("focus");
  if (journee && habitudes && focus) gagnes.push("parfaite");
  return gagnes;
}

/* ------------------------------------------------------------------ */
/* L'XP d'une journée                                                  */
/* ------------------------------------------------------------------ */

export type LigneXp = { label: string; emoji: string; xp: number };

/**
 * Le détail de l'XP d'une journée. Le détail autant que le total : voir
 * « 4 blocs × 10 » explique le chiffre, et un chiffre expliqué motive.
 */
export function detailXp(j: JourChiffre): LigneXp[] {
  const lignes: LigneXp[] = [];
  const pousser = (label: string, emoji: string, xp: number) => {
    if (xp > 0) lignes.push({ label, emoji, xp });
  };

  pousser(`${j.blocsFaits} bloc${j.blocsFaits > 1 ? "s" : ""}`, "📅", j.blocsFaits * BAREME.bloc);
  pousser(
    `${j.habitudesFaites} habitude${j.habitudesFaites > 1 ? "s" : ""}`,
    "☑️",
    j.habitudesFaites * BAREME.habitude,
  );
  pousser(
    `${j.principalesFaites} focus principal${j.principalesFaites > 1 ? "s" : ""}`,
    "⭐",
    j.principalesFaites * BAREME.tachePrincipale,
  );
  pousser(
    `${j.secondairesFaites} secondaire${j.secondairesFaites > 1 ? "s" : ""}`,
    "🔹",
    j.secondairesFaites * BAREME.tacheSecondaire,
  );
  pousser(
    `${j.annexesFaites} annexe${j.annexesFaites > 1 ? "s" : ""}`,
    "▫️",
    j.annexesFaites * BAREME.tacheAnnexe,
  );
  if (j.uneChoseFaite) pousser("La chose du jour", "🎯", BAREME.uneChose);
  if (j.journalEcrit) pousser("Journal écrit", "✍️", BAREME.journal);
  pousser(`${j.repas} repas noté${j.repas > 1 ? "s" : ""}`, "🍽", j.repas * BAREME.repas);

  for (const id of j.bonus) {
    const b = BONUS_PAR_ID.get(id);
    if (b) lignes.push({ label: b.label, emoji: b.emoji, xp: b.xp });
  }

  return lignes;
}

/** L'XP totale d'une journée. */
export function xpDuJour(j: JourChiffre): number {
  return detailXp(j).reduce((n, l) => n + l.xp, 0);
}

/* ------------------------------------------------------------------ */
/* Relire une journée déjà stockée                                     */
/* ------------------------------------------------------------------ */

/** La forme JSON d'une journée telle qu'elle dort dans `daily_logs`. */
type JourStocke = {
  faites?: Record<string, string[]>;
  une_chose?: { texte?: string; fait?: boolean };
  nutrition?: { repas?: unknown[] };
  taches?: { liste?: { niveau?: string; fait?: boolean }[] };
  journeeFaits?: string[];
  bonus?: string[];
};

/**
 * Traduit une journée stockée en nombres.
 *
 * Volontairement tolérante : ces lignes ont été écrites par des versions
 * successives de l'OS, et une journée d'il y a trois mois n'a ni bonus, ni
 * instantané de tâches. Tout ce qui manque vaut zéro plutôt que de faire
 * planter le bilan.
 *
 * Les totaux (combien de blocs EXISTAIENT ce jour-là) restent à zéro : on ne
 * les connaît pas rétroactivement, et on n'en a pas besoin — les bonus de
 * journée complète sont lus, pas recalculés.
 */
export function chiffrerJourStocke(
  brut: unknown,
  journalTexte?: string | null,
): JourChiffre {
  const j = (brut ?? {}) as JourStocke;
  const faites = j.faites ?? {};
  const liste = j.taches?.liste ?? [];
  const compter = (niveau: string) =>
    liste.filter((t) => t?.fait && t?.niveau === niveau).length;

  return {
    blocsFaits: Array.isArray(j.journeeFaits) ? j.journeeFaits.length : 0,
    blocsTotal: 0,
    habitudesFaites: Object.values(faites).filter((o) => Array.isArray(o) && o.length > 0)
      .length,
    habitudesTotal: 0,
    principalesFaites: compter("principal"),
    principalesTotal: 0,
    secondairesFaites: compter("secondaire"),
    annexesFaites: compter("annexe"),
    journalEcrit: (journalTexte ?? "").trim().length > 0,
    uneChoseFaite: Boolean(j.une_chose?.fait),
    repas: Array.isArray(j.nutrition?.repas) ? j.nutrition.repas.length : 0,
    bonus: Array.isArray(j.bonus) ? j.bonus.filter((b) => typeof b === "string") : [],
  };
}

/**
 * Cette journée a-t-elle laissé une trace réelle ?
 *
 * C'est la question qui décide de la série. Elle ne se limite pas aux
 * habitudes : un jour en déplacement où Twaylo n'a coché que ses blocs de
 * journée type est un jour tenu, et ne doit pas casser la série.
 */
export function jourALaisseUneTrace(j: JourChiffre): boolean {
  return (
    j.blocsFaits > 0 ||
    j.habitudesFaites > 0 ||
    j.journalEcrit ||
    j.uneChoseFaite ||
    j.repas > 0 ||
    j.principalesFaites + j.secondairesFaites + j.annexesFaites > 0
  );
}

/* ------------------------------------------------------------------ */
/* Les niveaux                                                         */
/* ------------------------------------------------------------------ */

const XP_BASE = 150;
const XP_PAS = 60;

/** L'XP à fournir pour passer du niveau n au suivant. */
export function coutNiveau(n: number): number {
  return XP_BASE + XP_PAS * Math.max(0, n - 1);
}

/** Les grades — un nom sur le chiffre, sinon « niveau 14 » ne dit rien. */
const GRADES: { min: number; nom: string; couleur: string }[] = [
  { min: 40, nom: "Légende", couleur: "#ffd23d" },
  { min: 30, nom: "Souverain", couleur: "#ff3d8b" },
  { min: 22, nom: "Implacable", couleur: "#b06bff" },
  { min: 15, nom: "Machine", couleur: "#22d3ee" },
  { min: 9, nom: "Discipliné", couleur: "#3ddc84" },
  { min: 5, nom: "Assidu", couleur: "#4f9cff" },
  { min: 3, nom: "Régulier", couleur: "#e6c060" },
  { min: 1, nom: "Éveil", couleur: "rgba(255,255,255,0.5)" },
];

export function gradeDe(niveau: number): { nom: string; couleur: string } {
  return GRADES.find((g) => niveau >= g.min) ?? GRADES[GRADES.length - 1];
}

export type Palier = {
  niveau: number;
  /** XP accumulée à l'intérieur du niveau courant. */
  dansNiveau: number;
  /** XP nécessaire pour finir le niveau courant. */
  pourNiveau: number;
  /** 0 à 1. */
  fraction: number;
  grade: string;
  couleur: string;
};

/**
 * Le niveau atteint avec cette XP totale.
 *
 * Boucle plutôt que formule inversée : la courbe peut changer sans avoir à
 * redémontrer une racine carrée, et 999 niveaux est un plafond qu'aucune vie
 * humaine n'atteint (≈ 30 millions d'XP) mais qui interdit la boucle infinie
 * si le barème devient un jour dégénéré.
 */
export function palierDe(xpTotal: number): Palier {
  let niveau = 1;
  let reste = Math.max(0, Math.floor(xpTotal));
  while (niveau < 999 && reste >= coutNiveau(niveau)) {
    reste -= coutNiveau(niveau);
    niveau += 1;
  }
  const pourNiveau = coutNiveau(niveau);
  const grade = gradeDe(niveau);
  return {
    niveau,
    dansNiveau: reste,
    pourNiveau,
    fraction: pourNiveau > 0 ? Math.min(1, reste / pourNiveau) : 0,
    grade: grade.nom,
    couleur: grade.couleur,
  };
}

/* ------------------------------------------------------------------ */
/* Les exploits                                                        */
/* ------------------------------------------------------------------ */

/** Les compteurs de toute une vie d'OS, d'où se déduisent les exploits. */
export type Cumuls = {
  joursRemplis: number;
  meilleureSerie: number;
  blocs: number;
  habitudes: number;
  journaux: number;
  parfaites: number;
  meilleurJour: number;
  taches: number;
};

export const CUMULS_VIDES: Cumuls = {
  joursRemplis: 0,
  meilleureSerie: 0,
  blocs: 0,
  habitudes: 0,
  journaux: 0,
  parfaites: 0,
  meilleurJour: 0,
  taches: 0,
};

export type Exploit = {
  id: string;
  nom: string;
  emoji: string;
  description: string;
  /** Où on en est, et où il faut arriver. */
  valeur: number;
  seuil: number;
  debloque: boolean;
};

const DEFINITIONS: {
  id: string;
  nom: string;
  emoji: string;
  description: string;
  seuil: number;
  lire: (c: Cumuls) => number;
}[] = [
  { id: "etincelle", nom: "Première étincelle", emoji: "🌱", description: "Une première journée qui laisse une trace.", seuil: 1, lire: (c) => c.joursRemplis },
  { id: "semaine", nom: "Semaine pleine", emoji: "🔥", description: "Sept jours d'affilée.", seuil: 7, lire: (c) => c.meilleureSerie },
  { id: "quinzaine", nom: "Quinze jours", emoji: "🔥", description: "Deux semaines sans lâcher.", seuil: 14, lire: (c) => c.meilleureSerie },
  { id: "mois", nom: "Un mois d'affilée", emoji: "🗓", description: "Trente jours. Ce n'est plus un effort, c'est une habitude.", seuil: 30, lire: (c) => c.meilleureSerie },
  { id: "cent", nom: "Cent jours", emoji: "💎", description: "Cent jours d'affilée. Presque personne ne va là.", seuil: 100, lire: (c) => c.meilleureSerie },
  { id: "blocs50", nom: "Cinquante blocs", emoji: "🧱", description: "Cinquante blocs de journée type cochés.", seuil: 50, lire: (c) => c.blocs },
  { id: "blocs300", nom: "Trois cents blocs", emoji: "🏗", description: "La journée type est devenue une machine.", seuil: 300, lire: (c) => c.blocs },
  { id: "coches200", nom: "Deux cents coches", emoji: "☑️", description: "Deux cents habitudes cochées, tous jours confondus.", seuil: 200, lire: (c) => c.habitudes },
  { id: "plume", nom: "La plume", emoji: "✍️", description: "Quinze journaux écrits.", seuil: 15, lire: (c) => c.journaux },
  { id: "sansfaute", nom: "Sans faute", emoji: "🏆", description: "Une journée parfaite : blocs, habitudes et focus.", seuil: 1, lire: (c) => c.parfaites },
  { id: "dixsansfaute", nom: "Dix sans faute", emoji: "👑", description: "Dix journées parfaites.", seuil: 10, lire: (c) => c.parfaites },
  { id: "grossejournee", nom: "Grosse journée", emoji: "⚡", description: "Deux cents XP dans une seule journée.", seuil: 200, lire: (c) => c.meilleurJour },
];

export function exploitsDe(c: Cumuls): Exploit[] {
  return DEFINITIONS.map((d) => {
    const valeur = d.lire(c);
    return {
      id: d.id,
      nom: d.nom,
      emoji: d.emoji,
      description: d.description,
      valeur: Math.min(valeur, d.seuil),
      seuil: d.seuil,
      debloque: valeur >= d.seuil,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Petits utilitaires partagés                                         */
/* ------------------------------------------------------------------ */

/** Le prochain palier de série qui vaut une fête. */
export const PALIERS_SERIE = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

export function prochainPalierSerie(serie: number): number | null {
  return PALIERS_SERIE.find((p) => p > serie) ?? null;
}

/** Vrai si cette série vient d'atteindre un palier fêtable. */
export function estPalierSerie(serie: number): boolean {
  return PALIERS_SERIE.includes(serie);
}
