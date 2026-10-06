/**
 * LE PROJECT 90 — le modèle, et rien que le modèle.
 *
 * Tout ce que le cockpit sait des 90 jours (5 octobre → 31 décembre 2026) est
 * ici : les cinq objectifs, les quatre blocs de la journée, les responsables,
 * les étapes d'une OP sponsor, la priorisation automatique, la trésorerie
 * déduite des OP payées, et les comptes à rebours.
 *
 * AUCUNE dépendance : pas de React, pas de base, pas d'horloge. Le jour courant
 * est toujours passé en paramètre. C'est ce qui permet de vérifier ces règles
 * hors ligne, dans un petit script, plutôt que de cliquer dans une interface
 * pour savoir si un score est juste — et c'est ce qui garantit que le serveur
 * et le navigateur calculent la même chose.
 *
 * CONTRAINTE DURE : aucune migration SQL n'est possible (le jeton Supabase a
 * été révoqué). Les champs qui n'ont pas de colonne sont donc encodés dans
 * celles qui existent — `tasks.categorie` et `deals.note` portent un petit
 * JSON, `tasks.urgence` porte le bloc horaire. Les deux encodages sont
 * tolérants : du texte libre laissé par l'ancienne version se relit sans rien
 * perdre, et une valeur inconnue ne fait jamais planter une lecture.
 */

/* ------------------------------------------------------------------ */
/* Le calendrier des 90 jours                                          */
/* ------------------------------------------------------------------ */

/** Premier jour du compte. */
export const P90_DEBUT = "2026-10-05";
/** Dernier jour : tout se juge là. */
export const P90_FIN = "2026-12-31";
/** L'ouverture de Momentum, le soir du 1er novembre. */
export const P90_OUVERTURE = "2026-11-01";

/** Un jour civil `AAAA-MM-JJ` en nombre de jours, ancré à midi UTC. */
function enJours(jour: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const t = Date.parse(`${jour}T12:00:00Z`);
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000);
}

/**
 * Combien de jours séparent deux jours civils (`b - a`), ou `null` si l'une
 * des deux dates est absente ou mal formée.
 *
 * Ancré à midi : une soustraction d'horodatages à minuit tombe à côté d'un
 * jour entier dès qu'un changement d'heure traîne dans l'intervalle.
 */
export function ecartJours(a: string | undefined | null, b: string | undefined | null): number | null {
  if (!a || !b) return null;
  const x = enJours(a);
  const y = enJours(b);
  if (x === null || y === null) return null;
  return y - x;
}

/**
 * Jours restants avant une échéance. Négatif = en retard.
 * `null` quand la tâche n'a pas de date : ce n'est pas « urgent », ce n'est
 * pas « lointain », c'est inconnu, et le score le traite comme tel.
 */
export function joursRestants(echeance: string | undefined, aujourdhui: string): number | null {
  return ecartJours(aujourdhui, echeance);
}

/** Le bandeau du haut : où on en est dans les 90 jours. */
export type Rebours = {
  /** Jours avant l'ouverture de Momentum. Négatif une fois passée. */
  versOuverture: number;
  /** Jours avant le 31 décembre. */
  versFin: number;
  /** Jours écoulés depuis le 5 octobre. */
  ecoules: number;
  /** Durée totale du projet, en jours. */
  total: number;
  /** Part du temps consommée, de 0 à 100. */
  pctEcoule: number;
};

export function compteARebours(aujourdhui: string): Rebours {
  const total = ecartJours(P90_DEBUT, P90_FIN) ?? 0;
  const ecoules = Math.max(0, Math.min(total, ecartJours(P90_DEBUT, aujourdhui) ?? 0));
  return {
    versOuverture: ecartJours(aujourdhui, P90_OUVERTURE) ?? 0,
    versFin: ecartJours(aujourdhui, P90_FIN) ?? 0,
    ecoules,
    total,
    pctEcoule: total > 0 ? Math.round((ecoules / total) * 100) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Les cinq objectifs                                                  */
/* ------------------------------------------------------------------ */

export type IdObjectif = "momentum" | "twaylo" | "terrain" | "trigger" | "tresorerie";

/**
 * L'objectif des tâches qui ne servent pas un seul chantier — « Bilan des
 * 90 jours » appartient à tout le monde. Ce n'est pas un sixième objectif :
 * rien ne s'en mesure, il ne sert qu'à ranger et à filtrer.
 */
export const ID_TRANSVERSE = "tous";
export type Portee = IdObjectif | typeof ID_TRANSVERSE;

export type Jalon = {
  texte: string;
  /** `AAAA-MM-JJ`, quand le jalon a une date. */
  date?: string;
};

export type ObjectifP90 = {
  id: IdObjectif;
  /** 1 = Momentum. Le rang pèse dans la priorisation, c'est son seul rôle. */
  rang: number;
  nom: string;
  /**
   * Sa couleur, parmi les sept de la maquette.
   *
   * Un objectif se retrouve à sa teinte avant d'être lu — sur la carte qui le
   * porte, sur l'étiquette d'une tâche, dans le filtre du Kanban. C'est la
   * raison d'être de la palette : cinq objectifs du même gris sont cinq
   * paragraphes à lire.
   */
  couleur: string;
  /** Ce qui est compté, en une ligne. */
  kpi: string;
  /** Le symbole collé au chiffre (« € », « abonnés »…). */
  unite: string;
  /** La valeur au 5 octobre : sans elle, une barre de progression mentirait. */
  depart: number;
  cible: number;
  echeance: string;
  /** Le détail qui explique le chiffre, affiché sous le titre. */
  detail: string;
  jalons: Jalon[];
  /**
   * Vrai quand la valeur courante se DÉDUIT et ne se saisit pas.
   * Seule la trésorerie l'est : elle se lit sur les OP passées en « Payé ».
   */
  calcule?: boolean;
};

export const OBJECTIFS_P90: ObjectifP90[] = [
  {
    id: "momentum",
    rang: 1,
    nom: "Momentum",
    couleur: "var(--color-mag)",
    kpi: "Contracté en décembre",
    unite: "€",
    depart: 0,
    cible: 30_000,
    echeance: "2026-12-31",
    detail: "8 × 1:1 à 2 500 € + 100 abonnés à 98 €/mois",
    jalons: [
      { texte: "Liste d'attente + formulaire de candidature 1:1", date: "2026-10-12" },
      { texte: "Discord gratuit avec les retours clients", date: "2026-10-15" },
      { texte: "CGV + critères mesurables de la garantie", date: "2026-10-20" },
      { texte: "Formations et web app prêtes", date: "2026-10-29" },
      { texte: "Ouverture, le soir du 1er novembre", date: "2026-11-01" },
    ],
  },
  {
    id: "twaylo",
    rang: 2,
    nom: "Twaylo",
    couleur: "var(--color-amb)",
    kpi: "Abonnés YouTube",
    unite: "abonnés",
    depart: 316_000,
    cible: 500_000,
    echeance: "2026-12-31",
    detail: "3 vidéos longues par mois, toutes sponsorisées",
    jalons: [
      { texte: "« Les pires moments pour être né »", date: "2026-10-10" },
      { texte: "Série Bangladesh J1 → J14 programmée", date: "2026-10-15" },
      { texte: "Dossier Chine", date: "2026-10-17" },
      { texte: "Trailer Bangladesh", date: "2026-10-21" },
      { texte: "Hors Zone Bangladesh", date: "2026-10-30" },
    ],
  },
  {
    id: "terrain",
    rang: 3,
    nom: "Terrain & international",
    couleur: "var(--color-vio)",
    kpi: "Abonnés cumulés EN · ES · BN",
    unite: "abonnés",
    depart: 0,
    cible: 100_000,
    echeance: "2026-12-31",
    detail: "3 chaînes à 2 vidéos par mois",
    jalons: [
      { texte: "Chaînes EN, ES et BN créées", date: "2026-10-15" },
      { texte: "Doublages BN et EN du doc", date: "2026-10-28" },
      { texte: "Hors Zone Bangladesh", date: "2026-10-30" },
      { texte: "Tournage Pologne (6 → 8 novembre)", date: "2026-11-06" },
    ],
  },
  {
    id: "trigger",
    rang: 4,
    nom: "Trigger Warning",
    couleur: "var(--color-cor)",
    kpi: "Vestes précommandées",
    unite: "vestes",
    depart: 0,
    cible: 250,
    echeance: "2026-11-30",
    detail: "250 à 300 vestes à 250 € · 2 000 inscrits visés au 30 octobre",
    jalons: [
      { texte: "Liste d'attente ouverte", date: "2026-10-08" },
      { texte: "Recherche d'antériorité (France + UE)", date: "2026-10-14" },
      { texte: "Dépôt INPI", date: "2026-10-23" },
      { texte: "Proto v2 validé et reçu en Espagne", date: "2026-10-26" },
      { texte: "Contrat Creator Lab signé", date: "2026-10-28" },
      { texte: "Précommandes du 1er au 30 novembre", date: "2026-11-01" },
    ],
  },
  {
    id: "tresorerie",
    rang: 5,
    nom: "Trésorerie",
    couleur: "var(--color-ver)",
    kpi: "Encaissé sur les OP dues",
    unite: "€",
    depart: 0,
    cible: 8_400,
    echeance: "2026-12-31",
    detail: "Encaisser les OP en retard et constituer une réserve",
    calcule: true,
    jalons: [
      { texte: "Relance Expandia (carVertical, Linguana)", date: "2026-10-09" },
      { texte: "Mise en demeure Legal Place via Rares Corp", date: "2026-10-09" },
      { texte: "Compte réserve ouvert", date: "2026-10-12" },
    ],
  },
];

const PAR_ID = new Map<string, ObjectifP90>(OBJECTIFS_P90.map((o) => [o.id, o]));

export function objectifDe(id: string | undefined): ObjectifP90 | null {
  return id ? PAR_ID.get(id) ?? null : null;
}

/** Le nom affiché, y compris pour la portée transverse. */
export function nomObjectif(id: string | undefined): string {
  if (!id) return "Sans objectif";
  if (id === ID_TRANSVERSE) return "Tous";
  return PAR_ID.get(id)?.nom ?? "Sans objectif";
}

/** Sa couleur, ou le gris de « sans objectif ». */
export function couleurObjectif(id: string | undefined): string {
  if (!id || id === ID_TRANSVERSE) return "rgba(255,255,255,0.45)";
  return PAR_ID.get(id)?.couleur ?? "rgba(255,255,255,0.45)";
}

export function estPortee(v: unknown): v is Portee {
  return typeof v === "string" && (v === ID_TRANSVERSE || PAR_ID.has(v));
}

/**
 * La part du chemin parcourue, de 0 à 100.
 *
 * Mesurée DEPUIS le départ, pas depuis zéro. Twaylo part de 316 000 abonnés
 * pour 500 000 : une barre « valeur / cible » afficherait 63 % le premier
 * matin et 100 % n'aurait plus aucun rapport avec les 90 jours. Ce qui compte
 * est l'écart à combler, donc la barre part bien à zéro le 5 octobre.
 */
export function progression(valeur: number, objectif: ObjectifP90): number {
  const portee = objectif.cible - objectif.depart;
  if (!Number.isFinite(valeur)) return 0;
  if (portee <= 0) return valeur >= objectif.cible ? 100 : 0;
  const fait = valeur - objectif.depart;
  return Math.max(0, Math.min(100, Math.round((fait / portee) * 100)));
}

/* ------------------------------------------------------------------ */
/* Les responsables                                                    */
/* ------------------------------------------------------------------ */

/**
 * Qui porte quoi. Liste fermée : une tâche confiée à « Nico » et une autre à
 * « nicolas » rendraient le filtre du Kanban inutilisable.
 */
export const RESPONSABLES = ["Nicolas", "Océane", "Tom", "Creator Lab", "Expandia"] as const;
export type Responsable = (typeof RESPONSABLES)[number];

/** Reconnaît un responsable quelle que soit la casse ou les accents saisis. */
export function normaliserResponsable(brut: string): Responsable | null {
  const nu = brut
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  for (const r of RESPONSABLES) {
    const cible = r
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (nu === cible) return r;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Les quatre blocs de la journée                                      */
/* ------------------------------------------------------------------ */

export type IdBloc = "momentum" | "creation" | "tournages" | "operations";

export type Bloc = {
  id: IdBloc;
  nom: string;
  /** Minutes depuis minuit — comparer des heures en texte ne se fait pas. */
  debut: number;
  fin: number;
  /** « 9h → 11h30 », tel qu'affiché. */
  plage: string;
  /** Sa couleur — quatre cartes de journée, quatre teintes. */
  couleur: string;
  /**
   * La valeur rangée dans `tasks.urgence`.
   *
   * La colonne existe, elle est contrainte à quatre valeurs — et il y a
   * exactement quatre blocs. Le bloc vit donc dans une vraie colonne, pas dans
   * le JSON : atomique avec la ligne, filtrable en SQL, et aucun risque de
   * perdre le rangement d'une tâche en écrivant autre chose à côté.
   */
  urgence: "aujourdhui" | "semaine" | "mois" | "un_jour";
};

export const BLOCS: Bloc[] = [
  { id: "momentum", nom: "Momentum", debut: 540, fin: 690, plage: "9h → 11h30", urgence: "aujourdhui", couleur: "var(--color-mag)" },
  { id: "creation", nom: "Création Twaylo", debut: 690, fin: 780, plage: "11h30 → 13h", urgence: "semaine", couleur: "var(--color-amb)" },
  { id: "tournages", nom: "Tournages", debut: 840, fin: 990, plage: "14h → 16h30", urgence: "mois", couleur: "var(--color-vio)" },
  { id: "operations", nom: "Opérations", debut: 990, fin: 1110, plage: "16h30 → 18h30", urgence: "un_jour", couleur: "var(--color-cya)" },
];

export const BLOC_PAR_DEFAUT: IdBloc = "operations";

const BLOC_PAR_ID = new Map<string, Bloc>(BLOCS.map((b) => [b.id, b]));
const BLOC_PAR_URGENCE = new Map<string, Bloc>(BLOCS.map((b) => [b.urgence, b]));

export function estIdBloc(v: unknown): v is IdBloc {
  return typeof v === "string" && BLOC_PAR_ID.has(v);
}

export function blocDe(id: string | undefined): Bloc {
  return (id ? BLOC_PAR_ID.get(id) : undefined) ?? BLOC_PAR_ID.get(BLOC_PAR_DEFAUT)!;
}

/** Du stockage vers l'affichage. Une urgence inconnue retombe sur Opérations. */
export function blocDepuisUrgence(urgence: string | undefined): IdBloc {
  return (urgence ? BLOC_PAR_URGENCE.get(urgence)?.id : undefined) ?? BLOC_PAR_DEFAUT;
}

/** De l'affichage vers le stockage. */
export function urgenceDepuisBloc(bloc: IdBloc | undefined): Bloc["urgence"] {
  return blocDe(bloc).urgence;
}

/**
 * Le bloc où une tâche atterrit quand on ne l'a pas rangée à la main : celui
 * qui correspond à son objectif. Taper « Relancer Expandia » depuis la barre
 * de capture ne doit pas demander trois clics de rangement.
 */
export function blocSuggere(objectif: string | undefined): IdBloc {
  switch (objectif) {
    case "momentum":
      return "momentum";
    case "twaylo":
      return "creation";
    case "terrain":
      return "tournages";
    default:
      return "operations";
  }
}

/** Le bloc en cours à une heure donnée (minutes depuis minuit), ou rien. */
export function blocAHeure(minutes: number): Bloc | null {
  return BLOCS.find((b) => minutes >= b.debut && minutes < b.fin) ?? null;
}

/* ------------------------------------------------------------------ */
/* Ce qu'une tâche porte en plus — encodé dans `tasks.categorie`        */
/* ------------------------------------------------------------------ */

/**
 * L'impact, de 1 à 3.
 *
 * Troisième terme de la priorisation voulue (« échéance proche + objectif n°1
 * + impact »). Ni l'échéance ni l'objectif ne disent si une tâche fait avancer
 * le projet ou si elle le décore : « Ouvrir le compte réserve » et « Grand vlog
 * Nico P + ouverture de Momentum » peuvent tomber la même semaine sur le même
 * objectif. Deux par défaut : tout part à égalité, et le classement visible au
 * premier matin ne dépend que de l'échéance et de l'objectif.
 */
export type Impact = 1 | 2 | 3;
export const IMPACT_PAR_DEFAUT: Impact = 2;
export const NOMS_IMPACT: Record<Impact, string> = { 1: "Faible", 2: "Normal", 3: "Fort" };

export type MetaTache = {
  objectif?: Portee;
  responsables: Responsable[];
  /** `AAAA-MM-JJ`. */
  echeance?: string;
  impact: Impact;
  /**
   * Bloquée : on ne peut pas agir dessus. C'est la colonne « Bloqué » du
   * Kanban, impossible à ranger dans `statut` dont la contrainte n'accepte que
   * quatre valeurs déjà prises.
   */
  bloque: boolean;
  /**
   * Ce que l'ancienne version avait laissé dans `categorie` : un simple mot
   * (« Tournage », « Momentum »). Conservé tel quel plutôt que jeté — une
   * relecture ne doit jamais effacer ce qu'elle ne comprend pas.
   */
  libelle?: string;
};

export const META_VIDE: MetaTache = { responsables: [], impact: IMPACT_PAR_DEFAUT, bloque: false };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vers le texte rangé dans `tasks.categorie`.
 *
 * Clés d'une lettre : la colonne est du texte libre et ce JSON est relu à
 * chaque affichage de la todo. `null` quand il n'y a rien à dire, pour que la
 * colonne reste vide au lieu de porter `{}`.
 */
export function encoderMeta(m: MetaTache): string | null {
  const o: Record<string, unknown> = {};
  if (m.objectif && estPortee(m.objectif)) o.o = m.objectif;
  const resp = m.responsables.filter((r) => RESPONSABLES.includes(r)).slice(0, RESPONSABLES.length);
  if (resp.length > 0) o.r = resp;
  if (m.echeance && JOUR.test(m.echeance)) o.e = m.echeance;
  if (m.impact !== IMPACT_PAR_DEFAUT && (m.impact === 1 || m.impact === 3)) o.i = m.impact;
  if (m.bloque) o.k = 1;
  if (m.libelle && m.libelle.trim()) o.l = m.libelle.trim().slice(0, 60);
  return Object.keys(o).length === 0 ? null : JSON.stringify(o);
}

/**
 * Depuis `tasks.categorie`, et TOLÉRANT.
 *
 * Trois cas à traverser sans jamais lever : la colonne est vide ; elle porte
 * notre JSON ; elle porte le texte libre de l'ancienne version — auquel cas ce
 * texte devient le libellé et rien n'est perdu. Un JSON valide mais d'une autre
 * forme (`"120"`, `null`, un tableau) retombe sur le vide : du JSON qui se
 * parse n'est pas pour autant une meta.
 */
export function decoderMeta(brut: string | null | undefined): MetaTache {
  if (!brut || !brut.trim()) return { ...META_VIDE };
  const texte = brut.trim();

  if (!texte.startsWith("{")) return { ...META_VIDE, libelle: texte.slice(0, 60) };

  let parse: unknown;
  try {
    parse = JSON.parse(texte);
  } catch {
    return { ...META_VIDE, libelle: texte.slice(0, 60) };
  }
  if (typeof parse !== "object" || parse === null || Array.isArray(parse)) {
    return { ...META_VIDE, libelle: texte.slice(0, 60) };
  }

  const o = parse as Record<string, unknown>;
  const responsables: Responsable[] = [];
  if (Array.isArray(o.r)) {
    for (const brutR of o.r) {
      if (typeof brutR !== "string") continue;
      const r = normaliserResponsable(brutR);
      if (r && !responsables.includes(r)) responsables.push(r);
    }
  }

  return {
    objectif: estPortee(o.o) ? o.o : undefined,
    responsables,
    echeance: typeof o.e === "string" && JOUR.test(o.e) ? o.e : undefined,
    impact: o.i === 1 || o.i === 3 ? o.i : IMPACT_PAR_DEFAUT,
    bloque: o.k === 1 || o.k === true,
    libelle: typeof o.l === "string" && o.l.trim() ? o.l.trim().slice(0, 60) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* La priorisation automatique                                         */
/* ------------------------------------------------------------------ */

/** Le minimum qu'il faut savoir d'une tâche pour la classer. */
export type TacheP90 = {
  id: string;
  titre: string;
  /** `faite` en base. */
  faite: boolean;
  /** `en_cours` en base. */
  enCours: boolean;
  bloc: IdBloc;
  meta: MetaTache;
};

/** Le poids de l'échéance : le terme qui domine, et qui monte avec le retard. */
export function pointsEcheance(jours: number | null): number {
  if (jours === null) return 8; // sans date : ni urgent, ni invisible
  if (jours < 0) return 60 + Math.min(10, -jours) * 2; // 62 → 80
  if (jours === 0) return 50;
  if (jours === 1) return 42;
  if (jours <= 3) return 32;
  if (jours <= 7) return 22;
  if (jours <= 14) return 12;
  if (jours <= 30) return 5;
  return 2;
}

/** Le poids de l'objectif, par rang. Momentum est n°1, il pèse le plus. */
export function pointsObjectif(objectif: string | undefined): number {
  if (objectif === ID_TRANSVERSE) return 14;
  const o = objectifDe(objectif);
  if (!o) return 10;
  return [25, 20, 16, 12, 8][o.rang - 1] ?? 10;
}

export function pointsImpact(impact: Impact): number {
  return impact === 3 ? 18 : impact === 1 ? 0 : 9;
}

/**
 * Le score d'une tâche : échéance + objectif + impact, puis deux corrections.
 *
 * « En cours » remonte, parce que finir ce qui est commencé coûte moins que
 * d'ouvrir un autre chantier. « Bloqué » descend fort : la tâche reste visible
 * dans son Kanban, mais elle n'a rien à faire en tête d'une liste de choses à
 * faire aujourd'hui — on ne peut pas agir dessus. Une tâche faite sort du
 * classement.
 */
export function scorePriorite(t: TacheP90, aujourdhui: string): number {
  if (t.faite) return 0;
  let s =
    pointsEcheance(joursRestants(t.meta.echeance, aujourdhui)) +
    pointsObjectif(t.meta.objectif) +
    pointsImpact(t.meta.impact);
  if (t.enCours) s += 10;
  if (t.meta.bloque) s -= 25;
  return Math.max(0, s);
}

/**
 * Le classement complet, du plus urgent au moins urgent.
 *
 * À score égal on tranche par échéance, puis par titre : sans ça l'ordre
 * dépendrait de celui de la base et la liste sautillerait d'un affichage à
 * l'autre, ce qui est exactement ce qu'on reproche à une todo.
 */
export function ordreParPriorite<T extends TacheP90>(taches: T[], aujourdhui: string): T[] {
  return [...taches].sort((a, b) => {
    const d = scorePriorite(b, aujourdhui) - scorePriorite(a, aujourdhui);
    if (d !== 0) return d;
    const ea = a.meta.echeance ?? "9999-99-99";
    const eb = b.meta.echeance ?? "9999-99-99";
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.titre.localeCompare(b.titre, "fr");
  });
}

/**
 * Les trois priorités du jour.
 *
 * Trois, pas cinq : une liste de priorités aussi longue que la todo n'est pas
 * une liste de priorités. Ce qui est fait ou bloqué n'y entre pas — proposer
 * comme priorité une tâche sur laquelle on ne peut pas agir fait perdre
 * confiance au bandeau tout entier.
 */
export function troisPriorites<T extends TacheP90>(taches: T[], aujourdhui: string): T[] {
  const candidates = taches.filter((t) => !t.faite && !t.meta.bloque);
  return ordreParPriorite(candidates, aujourdhui).slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Les deux vues : Aujourd'hui et Semaine                              */
/* ------------------------------------------------------------------ */

export type Vue = "aujourdhui" | "semaine" | "tout";

/**
 * Aujourd'hui : ce qui est dû aujourd'hui, ce qui est en retard, et ce qui est
 * déjà commencé. Rien d'autre — c'est une journée, pas un inventaire.
 */
export function dansAujourdhui(t: TacheP90, aujourdhui: string): boolean {
  if (t.enCours) return true;
  const j = joursRestants(t.meta.echeance, aujourdhui);
  return j !== null && j <= 0;
}

/**
 * Semaine : les sept jours qui viennent, le retard, et TOUT CE QUI N'A PAS DE
 * DATE.
 *
 * Ce dernier point est volontaire : une tâche sans échéance n'apparaîtrait
 * dans aucune des deux vues et disparaîtrait de l'OS sans être supprimée. La
 * vue Semaine est donc aussi le filet — ce qui n'a pas de date se voit, et se
 * date.
 */
export function dansSemaine(t: TacheP90, aujourdhui: string): boolean {
  const j = joursRestants(t.meta.echeance, aujourdhui);
  return j === null || j <= 7;
}

/**
 * Tout : rien n'est filtré.
 *
 * Troisième vue, ajoutée après coup et pour une raison précise. Les deux
 * autres montrent sept jours au plus — or le plan va jusqu'au 31 décembre :
 * « Clôture des précommandes », datée du 30 novembre, n'apparaissait NULLE
 * PART dans la todo. Vingt tâches sur vingt-six invisibles, sans qu'on puisse
 * les atteindre autrement que par le Kanban. Une todo qui cache ce qu'on y a
 * mis n'est pas une todo.
 */
export function filtrerVue<T extends TacheP90>(taches: T[], vue: Vue, aujourdhui: string): T[] {
  if (vue === "tout") return taches;
  const garde = vue === "aujourdhui" ? dansAujourdhui : dansSemaine;
  return taches.filter((t) => garde(t, aujourdhui));
}

/* ------------------------------------------------------------------ */
/* Le Kanban — la MÊME donnée que la todo                              */
/* ------------------------------------------------------------------ */

export type ColonneKanban = "afaire" | "encours" | "bloque" | "fait";

export const COLONNES_KANBAN: { id: ColonneKanban; nom: string; couleur: string }[] = [
  { id: "afaire", nom: "À faire", couleur: "var(--color-ble)" },
  { id: "encours", nom: "En cours", couleur: "var(--color-cya)" },
  { id: "bloque", nom: "Bloqué", couleur: "var(--color-mag)" },
  { id: "fait", nom: "Fait", couleur: "var(--color-ver)" },
];

/**
 * Dans quelle colonne tombe une tâche.
 *
 * « Fait » gagne sur « Bloqué » : une tâche finie n'est plus bloquée par quoi
 * que ce soit, et le drapeau peut traîner si elle a été débloquée puis cochée
 * dans le même geste.
 */
export function colonneDe(statut: string, bloque: boolean): ColonneKanban {
  if (statut === "faite") return "fait";
  if (bloque) return "bloque";
  if (statut === "en_cours") return "encours";
  return "afaire";
}

/**
 * Ce qu'il faut écrire pour poser une carte dans une colonne. Deux champs,
 * dans deux endroits différents du stockage — d'où cette fonction unique,
 * pour que déplacer une carte ne puisse pas n'en écrire qu'un.
 */
export function patchColonne(c: ColonneKanban): { statut: string; faite: boolean; bloque: boolean } {
  switch (c) {
    case "fait":
      return { statut: "faite", faite: true, bloque: false };
    case "bloque":
      return { statut: "ouverte", faite: false, bloque: true };
    case "encours":
      return { statut: "en_cours", faite: false, bloque: false };
    default:
      return { statut: "ouverte", faite: false, bloque: false };
  }
}

/* ------------------------------------------------------------------ */
/* Les sponsors : une OP, du prospect à l'encaissement                  */
/* ------------------------------------------------------------------ */

export type IdChaine = "twaylo" | "tway" | "nicop";

export const CHAINES: { id: IdChaine; nom: string }[] = [
  { id: "twaylo", nom: "Twaylo" },
  { id: "tway", nom: "Tway'" },
  { id: "nicop", nom: "Nico P" },
];

export function estIdChaine(v: unknown): v is IdChaine {
  return v === "twaylo" || v === "tway" || v === "nicop";
}

export function nomChaine(id: IdChaine | undefined): string {
  return CHAINES.find((c) => c.id === id)?.nom ?? "—";
}

export type EtapeOp = "prospect" | "negociation" | "signe" | "livre" | "facture" | "paye";

export const ETAPES_OP: { id: EtapeOp; nom: string; couleur: string }[] = [
  { id: "prospect", nom: "Prospect", couleur: "rgba(255,255,255,0.45)" },
  { id: "negociation", nom: "Négo", couleur: "var(--color-amb)" },
  { id: "signe", nom: "Signé", couleur: "var(--color-ble)" },
  { id: "livre", nom: "Livré", couleur: "var(--color-vio)" },
  { id: "facture", nom: "Facturé", couleur: "var(--color-cor)" },
  { id: "paye", nom: "Payé", couleur: "var(--color-ver)" },
];

export function estEtapeOp(v: unknown): v is EtapeOp {
  return typeof v === "string" && ETAPES_OP.some((e) => e.id === v);
}

export function nomEtapeOp(e: EtapeOp): string {
  return ETAPES_OP.find((x) => x.id === e)?.nom ?? e;
}

/**
 * SIX étapes affichées pour CINQ valeurs en base.
 *
 * La contrainte de `deals.etape` n'accepte que prospect, negociation, signe,
 * livre et regle — « Facturé » n'existe pas et aucune migration n'est
 * possible. Facturé est donc « livré, et la facture est partie » : l'étape
 * reste `livre`, un drapeau dans le JSON porte la facture. `regle` = Payé.
 *
 * Et « Payé » a son drapeau aussi (`paye`), pour une raison de terrain : la
 * valeur `regle` vient de la migration 0004, qui s'applique à la main. Si elle
 * n'est pas passée, la base refuse l'écriture — marquer une OP payée « ne
 * marcherait tout simplement pas ». Le repli écrit alors `livre` + le drapeau,
 * que cette lecture comprend aussi bien.
 */
export function etapeDepuisDB(etape: string, facture: boolean, paye = false): EtapeOp {
  if (etape === "regle" || paye) return "paye";
  if (etape === "livre") return facture ? "facture" : "livre";
  if (etape === "signe" || etape === "negociation" || etape === "prospect") return etape;
  return "prospect";
}

export function etapeVersDB(e: EtapeOp): { etape: string; facture: boolean } {
  if (e === "paye") return { etape: "regle", facture: true };
  if (e === "facture") return { etape: "livre", facture: true };
  if (e === "livre") return { etape: "livre", facture: false };
  return { etape: e, facture: false };
}

/** La commission d'Expandia, sur la chaîne Twaylo uniquement. */
export const COMMISSION_EXPANDIA = 0.3;

/**
 * Ce que l'OP rapporte vraiment.
 *
 * Expandia prend 30 % — mais seulement sur Twaylo, et seulement quand l'OP
 * passe par elle. Une OP Nico P signée en direct ne paie rien ; une OP Twaylo
 * via Expandia à 2 500 € brut en rapporte 1 750. Le net n'est jamais saisi à
 * la main : un chiffre recopié finit toujours par mentir.
 */
export function commission(brut: number, chaine: IdChaine | undefined, viaExpandia: boolean): number {
  if (!viaExpandia || chaine !== "twaylo" || !Number.isFinite(brut) || brut <= 0) return 0;
  return Math.round(brut * COMMISSION_EXPANDIA);
}

export function net(brut: number, chaine: IdChaine | undefined, viaExpandia: boolean): number {
  if (!Number.isFinite(brut) || brut <= 0) return 0;
  return brut - commission(brut, chaine, viaExpandia);
}

/** Ce qu'une OP porte en plus, encodé dans `deals.note`. */
export type MetaOp = {
  chaine?: IdChaine;
  /** Date de diffusion, `AAAA-MM-JJ`. */
  diffusion?: string;
  /** Date de paiement attendue, `AAAA-MM-JJ`. */
  paiement?: string;
  /** La facture est partie (étape « Facturé »). */
  facture: boolean;
  /** L'OP passe par Expandia : c'est ce qui déclenche la commission. */
  expandia: boolean;
  /** Un litige en cours — Legal Place, par exemple. */
  litige: boolean;
  /**
   * Payée, quand la base a refusé l'étape `regle` (migration 0004 non
   * appliquée). Jamais écrit autrement : l'étape reste la source normale.
   */
  paye?: boolean;
  /** Le texte libre, celui qu'on écrit à la main. */
  note?: string;
};

export const META_OP_VIDE: MetaOp = { facture: false, expandia: false, litige: false };

export function encoderOp(m: MetaOp): string | null {
  const o: Record<string, unknown> = {};
  if (m.chaine && estIdChaine(m.chaine)) o.c = m.chaine;
  if (m.diffusion && JOUR.test(m.diffusion)) o.d = m.diffusion;
  if (m.paiement && JOUR.test(m.paiement)) o.p = m.paiement;
  if (m.facture) o.f = 1;
  if (m.expandia) o.x = 1;
  if (m.litige) o.g = 1;
  if (m.paye) o.y = 1;
  if (m.note && m.note.trim()) o.n = m.note.trim().slice(0, 400);
  return Object.keys(o).length === 0 ? null : JSON.stringify(o);
}

/**
 * Depuis `deals.note`, et tolérant de la même façon : ce qui n'est pas notre
 * JSON est du texte écrit à la main, et ce texte redevient la note.
 */
export function decoderOp(brut: string | null | undefined): MetaOp {
  if (!brut || !brut.trim()) return { ...META_OP_VIDE };
  const texte = brut.trim();
  if (!texte.startsWith("{")) return { ...META_OP_VIDE, note: texte.slice(0, 400) };

  let parse: unknown;
  try {
    parse = JSON.parse(texte);
  } catch {
    return { ...META_OP_VIDE, note: texte.slice(0, 400) };
  }
  if (typeof parse !== "object" || parse === null || Array.isArray(parse)) {
    return { ...META_OP_VIDE, note: texte.slice(0, 400) };
  }

  const o = parse as Record<string, unknown>;
  return {
    chaine: estIdChaine(o.c) ? o.c : undefined,
    diffusion: typeof o.d === "string" && JOUR.test(o.d) ? o.d : undefined,
    paiement: typeof o.p === "string" && JOUR.test(o.p) ? o.p : undefined,
    facture: o.f === 1 || o.f === true,
    expandia: o.x === 1 || o.x === true,
    litige: o.g === 1 || o.g === true,
    ...(o.y === 1 || o.y === true ? { paye: true } : {}),
    note: typeof o.n === "string" && o.n.trim() ? o.n.trim().slice(0, 400) : undefined,
  };
}

/** Une OP telle que le cockpit la manipule, étape et net déjà résolus. */
export type Op = {
  id: string;
  marque: string;
  /** Montant brut, celui qui est signé. */
  brut: number;
  etape: EtapeOp;
  meta: MetaOp;
};

export function netOp(op: Op): number {
  return net(op.brut, op.meta.chaine, op.meta.expandia);
}

export function commissionOp(op: Op): number {
  return commission(op.brut, op.meta.chaine, op.meta.expandia);
}

/** Livrée mais pas encore payée : l'argent qui est dehors. */
export function aEncaisser(op: Op): boolean {
  return op.etape === "livre" || op.etape === "facture";
}

/** Jours de retard sur le paiement attendu. 0 si pas en retard ou pas de date. */
export function joursDeRetard(op: Op, aujourdhui: string): number {
  if (!aEncaisser(op)) return 0;
  const j = joursRestants(op.meta.paiement, aujourdhui);
  return j === null || j >= 0 ? 0 : -j;
}

/** Au-delà de ça, le retard devient une alerte. */
export const SEUIL_RETARD = 30;
/** En dessous de ça, une OP ne vaut pas la place qu'elle prend. */
export const SEUIL_MONTANT = 3_000;
/**
 * Le seuil tel qu'il s'écrit, en dur.
 *
 * `toLocaleString("fr-FR")` rend une espace fine insécable dont le code varie
 * selon la version d'ICU embarquée : le texte de l'alerte n'était pas le même
 * dans le navigateur, sur Vercel et dans les tests. Un seuil affiché est du
 * texte, pas un calcul.
 */
export const SEUIL_MONTANT_TEXTE = "3 000 €";

/**
 * Une OP livrée dont on n'attend aucune date : l'argent est dehors et rien ne
 * le réclamera.
 *
 * Sans ce signal, une OP sans date de paiement ne déclenche jamais l'alerte de
 * retard — elle dort dans « À encaisser » et personne ne la relance. Le trou
 * devient donc lui-même une alerte : c'est une date à renseigner, pas un
 * silence.
 */
export function paiementAInscrire(op: Op): boolean {
  return aEncaisser(op) && !op.meta.paiement;
}

export type Alerte = { ton: "danger" | "alerte"; texte: string };

/**
 * Ce qui doit sauter aux yeux sur une OP.
 *
 * Deux règles, celles demandées : un paiement en retard de plus de 30 jours,
 * et une OP sous 3 000 €. La seconde ne s'applique qu'à ce qui est engagé —
 * un prospect à 1 000 € n'est pas un problème, c'est une discussion ; une OP
 * signée à 1 000 €, si.
 */
export function alertesOp(op: Op, aujourdhui: string): Alerte[] {
  const sorties: Alerte[] = [];
  const retard = joursDeRetard(op, aujourdhui);
  if (retard > SEUIL_RETARD) {
    // « Payé en retard » se lisait comme si l'argent était arrivé : c'est
    // exactement l'inverse. Il n'est pas arrivé, et il est attendu depuis.
    sorties.push({ ton: "danger", texte: `Paiement en retard de ${retard} jours` });
  }
  if (paiementAInscrire(op)) {
    sorties.push({ ton: "alerte", texte: "Date de paiement à renseigner" });
  }
  const engagee = op.etape !== "prospect" && op.etape !== "negociation";
  if (engagee && op.brut > 0 && op.brut < SEUIL_MONTANT) {
    sorties.push({ ton: "alerte", texte: `Sous ${SEUIL_MONTANT_TEXTE}` });
  }
  if (op.meta.litige) sorties.push({ ton: "danger", texte: "Litige" });
  return sorties;
}

export type BilanEncaissement = {
  /** Les OP livrées ou facturées, les plus en retard d'abord. */
  lignes: Op[];
  /** Total net à encaisser. */
  total: number;
  /** Total net déjà encaissé (étape « Payé »). */
  encaisse: number;
  /** Le net des OP en retard de plus de 30 jours. */
  enRetard: number;
};

export function bilanEncaissement(ops: Op[], aujourdhui: string): BilanEncaissement {
  const lignes = ops
    .filter(aEncaisser)
    .sort((a, b) => joursDeRetard(b, aujourdhui) - joursDeRetard(a, aujourdhui) || netOp(b) - netOp(a));
  return {
    lignes,
    total: lignes.reduce((s, op) => s + netOp(op), 0),
    encaisse: ops.filter((op) => op.etape === "paye").reduce((s, op) => s + netOp(op), 0),
    enRetard: lignes
      .filter((op) => joursDeRetard(op, aujourdhui) > SEUIL_RETARD)
      .reduce((s, op) => s + netOp(op), 0),
  };
}

/**
 * La progression de l'objectif Trésorerie, DÉDUITE et non saisie.
 *
 * Valeur courante = le net des OP passées en « Payé ». Cible = tout ce qui est
 * engagé (signé et au-delà), c'est-à-dire l'argent dû plus l'argent rentré :
 * la barre dit donc quelle part de ce qu'on nous doit est effectivement
 * arrivée. Elle se maintient toute seule quand une OP s'ajoute.
 */
export function tresorerie(ops: Op[]): { valeur: number; cible: number; pct: number } {
  const engagees = ops.filter((op) => op.etape !== "prospect" && op.etape !== "negociation");
  const valeur = engagees.filter((op) => op.etape === "paye").reduce((s, op) => s + netOp(op), 0);
  const cible = engagees.reduce((s, op) => s + netOp(op), 0);
  return {
    valeur,
    cible,
    pct: cible > 0 ? Math.max(0, Math.min(100, Math.round((valeur / cible) * 100))) : 0,
  };
}
