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
export type Task = { text: string; done: boolean; categorie?: string };

/**
 * Une habitude, à la façon de l'OS de Miles : soit une simple bascule, soit
 * un compteur de séances avec un objectif hebdomadaire.
 *
 * `cible` absent  → bascule : fait vaut 0 ou 1
 * `cible` présent → séances : fait va de 0 à cible, incrémenté au clic
 */
export type Habit = {
  name: string;
  categorie: string;
  cible?: number;
  fait: number;
};

/** Ce qui bloque, et depuis combien de temps (Miles : KEY BLOCKERS). */
export type Blocage = {
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
