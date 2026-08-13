/** Les formats de publication (spec Partie 4 : short|long|reel_ig|tiktok|live). */
export type Format = "Short" | "Long" | "Reel" | "TikTok" | "Live";

/** Catégories du classifieur de capture (spec Partie 5). */
export type CaptureType =
  | "tache"
  | "idee_video"
  | "contact"
  | "objectif"
  | "depense"
  | "note"
  | "journal";

export type Urgence = "aujourdhui" | "semaine" | "mois" | "un_jour";

export type ContactType =
  | "collab"
  | "sponsor"
  | "investisseur"
  | "fournisseur"
  | "equipe"
  | "audience";

export type Relation = "chaud" | "tiede" | "froid" | "actif";

export type VideoStatus =
  | "idee"
  | "scenario"
  | "tournage"
  | "montage"
  | "pret"
  | "publie";

export type Capture = { text: string; type: CaptureType };
/**
 * Les trois niveaux d'une journée.
 *
 * Une liste à plat ne dit pas où porter son attention : tout y pèse pareil.
 * Ici le focus principal est ce qui fait la journée, le secondaire ce qui la
 * soutient, l'annexe ce qui doit sortir de la tête sans l'encombrer.
 *
 * Rangés dans la colonne `urgence`, dont l'énumération existe déjà en base
 * (`aujourdhui` / `semaine` / `mois` / `un_jour`) — la contrainte interdit d'y
 * mettre d'autres valeurs et aucune migration n'est possible.
 */
export type Niveau = "principal" | "secondaire" | "annexe";

export const NIVEAUX: Record<
  Niveau,
  { urgence: string; nom: string; sousTitre: string; couleur: string }
> = {
  principal: {
    urgence: "aujourdhui",
    nom: "FOCUS PRINCIPAL",
    sousTitre: "CE QUI FAIT LA JOURNÉE",
    couleur: "var(--color-mag)",
  },
  secondaire: {
    urgence: "semaine",
    nom: "SECONDAIRE",
    sousTitre: "CE QUI LA SOUTIENT",
    couleur: "var(--color-amb)",
  },
  annexe: {
    urgence: "un_jour",
    nom: "ANNEXES",
    sousTitre: "À SORTIR DE LA TÊTE",
    couleur: "var(--color-ble)",
  },
};

/** L'inverse : de ce qui est stocké vers le niveau affiché. */
export function niveauDepuisUrgence(urgence: string): Niveau {
  if (urgence === "aujourdhui") return "principal";
  if (urgence === "un_jour" || urgence === "mois") return "annexe";
  return "secondaire";
}

export type Task = {
  /**
   * L'identifiant en base, absent tant que la tâche n'y est pas.
   *
   * Il était lu partout par une conversion à la volée (`t as { id?: string }`)
   * alors qu'il fait partie de la donnée : le déclarer ici permet au
   * compilateur de vérifier ce qui, jusqu'ici, se contentait d'espérer.
   */
  id?: string;
  text: string;
  done: boolean;
  categorie?: string;
  niveau?: Niveau;
  /**
   * Le jour local où elle a été cochée (`AAAA-MM-JJ`), ou absent.
   *
   * Sans cette date, « cochée » et « cochée aujourd'hui » se confondaient. Or
   * une tâche finie reste dans la liste tant que la todo n'est pas clôturée à
   * la main : le lendemain, elle était recomptée comme un accomplissement du
   * jour — XP du jour gonflée, et calendrier du bilan qui marquait « bouclé »
   * des journées où rien n'avait été fait.
   */
  faiteLe?: string;
  /**
   * Le jour local où elle a été notée (`AAAA-MM-JJ`), ou absent.
   *
   * Sert à montrer l'âge d'une tâche dans la liste. Absent pour les tâches
   * qui n'ont pas encore atteint la base — une tâche qu'on vient de taper n'a
   * de toute façon pas d'âge à afficher.
   */
  creeLe?: string;
  /**
   * Gelée : une tâche qui revient tous les jours.
   *
   * « Poster sur Snap » n'est pas une tâche qu'on finit, c'est une tâche qu'on
   * refait. Cochée le soir, elle disparaissait au passage au jour suivant avec
   * les autres, et il fallait la retaper chaque matin. Gelée, la clôture la
   * décoche au lieu de l'effacer, et l'archivage des Oubliés ne la touche pas.
   */
  gelee?: boolean;
};

/**
 * Une habitude.
 *
 * Deux formes, et c'est la présence d'options qui décide :
 *   - sans options : une simple case à cocher (« Sommeil »)
 *   - avec options : un clic déplie les variantes réellement pratiquées
 *     (« Sport » → Gym, Étirements, Vélo). On coche ce qu'on a fait.
 *
 * Le compteur « 0/5 » de la version précédente ne disait rien : cliquer cinq
 * fois sur « Sport » n'apprend pas ce qu'on a fait. Cocher « Gym », si.
 */
export type Habit = {
  /** Identifiant stable : renommer une habitude ne perd pas son historique. */
  id: string;
  nom: string;
  categorie: string;
  /** Variantes cochables. Vide = simple bascule. */
  options: string[];
  /**
   * Habitude à flouter tant qu'on n'a pas « Révélé » — pour ne pas l'exposer à
   * l'écran quand Twaylo filme (ex. « zéro vidéo avec nudité »).
   */
  prive?: boolean;
};

/** Ce qui a été fait aujourd'hui : identifiant d'habitude → options cochées. */
export type FaitesDuJour = Record<string, string[]>;

/**
 * Une compétence, façon RPG (esprit Solo Leveling).
 *
 * `niveau` va de 0 à 100 : c'est la maîtrise, dont on dérive un rang (E→S) et
 * une barre d'XP. `historique` garde un point par mois pour suivre la
 * progression dans le temps, un mois après l'autre.
 */
export type Skill = {
  id: string;
  nom: string;
  categorie: string;
  /** Maîtrise de 0 à 100. */
  niveau: number;
  /** Un instantané par mois (`AAAA-MM` → niveau), pour la progression. */
  historique: { mois: string; niveau: number }[];
};

/** Ce qui bloque, et depuis combien de temps (Miles : KEY BLOCKERS). */
/**
 * Un blocage tel qu'il est stocké : une date, pas un nombre de jours. Un
 * compteur figé en base ne vieillirait pas, alors que c'est justement son
 * vieillissement qui doit alerter.
 */
export type BlocageStocke = {
  id: string;
  texte: string;
  proprietaire: string;
  /** Jour où ça s'est arrêté, au format AAAA-MM-JJ. */
  depuis: string;
};

export type Blocage = {
  id?: string;
  texte: string;
  /** « Toi » ou le nom de la personne dont ça dépend. */
  proprietaire: string;
  depuisJours: number;
  chaleur: "chaud" | "tiede" | "froid";
};

/** Un créneau du calendrier, avec heures et étiquette (Miles : CALENDAR). */
export type Creneau = {
  debut: string;
  fin?: string;
  titre: string;
  contexte?: string;
  tag?: string;
  color: string;
};

/** La revue de semaine (Miles : REVIEW). Une par semaine ISO. */
export type Revue = {
  gains: string;
  bouclesOuvertes: string;
  contenuPublie: string;
  top3: string;
  ceQuiADerape: string;
  personnesARelancer: string;
  patternSante: string;
  scelle: boolean;
};

export const REVUE_VIDE: Revue = {
  gains: "",
  bouclesOuvertes: "",
  contenuPublie: "",
  top3: "",
  ceQuiADerape: "",
  personnesARelancer: "",
  patternSante: "",
  scelle: false,
};

/** Les chiffres qui défilent dans le rail — l'équivalent des tickers de Miles. */
export type Ticker = { label: string; valeur: string; delta?: string };

export type Video = { title: string; format: Format };

export type PipelineColumn = {
  status: VideoStatus;
  name: string;
  color: string;
  videos: Video[];
};

export type Objective = {
  period: string;
  label: string;
  value: string;
  pct: number;
  color: string;
  steps: { text: string; done: boolean }[];
};

export type Contact = {
  nom: string;
  type: ContactType;
  relation: Relation;
  role?: string;
  prochaineAction?: string;
};

export type Deal = { name: string; amount: string; note: string };

export type DealColumn = { name: string; color: string; deals: Deal[] };

export type CalendarEvent = { time: string; title: string; color: string };

/** Ce que Twaylo a décidé de faire aujourd'hui — son unique priorité. */
export type UneChose = { texte: string; fait: boolean };

export type JournalEntry = {
  date: string;
  place: string;
  snippet: string;
};

export type Revenue = {
  /** Faux tant que l'API YouTube Analytics n'est pas branchée (étape 5). */
  connected: boolean;
  amount: string;
  delta: string;
  rpm: string;
  monetizedViews: string;
  stats: { label: string; value: string; delta: string; sensitive: boolean }[];
  historyMax: number;
  history: { month: string; value: number }[];
  sources: { label: string; pct: number; color: string }[];
  topVideos: { title: string; format: Format; views: string; rev: string }[];
};

/** Tout ce qu'affiche l'OS. Deux instances : les vraies données, et la démo. */
export type OsData = {
  operator: {
    name: string;
    role: string;
    streakDays: number;
    status: string;
    focus: string;
  };
  captures: Capture[];
  tasks: Task[];
  habits: Habit[];
  pipeline: PipelineColumn[];
  objectives: Objective[];
  contacts: Contact[];
  dealColumns: DealColumn[];
  dealStats: { label: string; value: string; color: string }[];
  ideas: { title: string; format: Format; src: string }[];
  schedule: { date: string; title: string; format: Format }[];
  events: CalendarEvent[];
  /** Les créneaux détaillés du jour, avec heures et étiquettes. */
  creneaux: Creneau[];
  /** Position dans la semaine (0 = lundi) → couleur de la pastille. */
  busyDays: Record<number, string>;
  /** Ce qui est bloqué et attend quelqu'un. */
  blocages: Blocage[];
  /** Les trois chiffres du rail supérieur. */
  tickers: Ticker[];
  revenue: Revenue;
  journalEntries: JournalEntry[];
  memories: string[];
};

/** Un repas du jour (carte Nutrition). */
export type Repas = {
  id: string;
  /** Heure HH:MM. */
  t: string;
  /** Nom du repas. */
  n: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Vrai si les macros viennent d une estimation IA plutot que d une saisie. */
  estimated: boolean;
};
