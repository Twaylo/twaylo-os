/**
 * Le sas d'accueil : les profils et les questions.
 *
 * Pur et partagé — la landing page en affiche les profils, le sas les fait
 * choisir, et le serveur s'en sert pour brider ce que l'IA a le droit de
 * renvoyer. Une seule source, sinon les trois divergent au premier ajout.
 *
 * Le principe de l'enchaînement, emprunté à Duolingo : UNE question par
 * écran, jamais un formulaire. Un formulaire de douze champs se referme ;
 * douze écrans d'une question se traversent. Chaque écran doit pouvoir être
 * répondu d'un pouce, sans clavier — la saisie libre est réservée au dernier,
 * quand la personne est déjà engagée.
 */

export type Profil = {
  id: string;
  emoji: string;
  titre: string;
  /** Ce que la personne reconnaît d'elle-même en une ligne. */
  accroche: string;
  couleur: string;
  /** Ce que l'OS mettra en avant pour ce profil — montré avant de choisir. */
  promesses: string[];
};

export const PROFILS: Profil[] = [
  {
    id: "etudiant",
    emoji: "🎓",
    titre: "Étudiant",
    accroche: "Des examens, des deadlines, et des journées à structurer seul.",
    couleur: "#22d3ee",
    promesses: ["Sessions de révision", "Suivi par matière", "Rythme de sommeil"],
  },
  {
    id: "createur",
    emoji: "🎬",
    titre: "Créateur",
    accroche: "Tu publies. Le vrai travail, c'est de tenir la cadence.",
    couleur: "#ff3d8b",
    promesses: ["Pipeline de contenu", "Idées captées à la voix", "Rythme de publication"],
  },
  {
    id: "actif",
    emoji: "💼",
    titre: "Salarié",
    accroche: "Des journées prises par le travail, et une vie à faire tenir autour.",
    couleur: "#4f9cff",
    promesses: ["Frontière travail / perso", "Trajets et coupures", "Projets de fond"],
  },
  {
    id: "independant",
    emoji: "🧭",
    titre: "Indépendant",
    accroche: "Personne au-dessus pour cadrer. C'est toi le cadre.",
    couleur: "#ffc63d",
    promesses: ["Clients et relances", "Revenus suivis", "Temps facturable"],
  },
  {
    id: "sportif",
    emoji: "🏋️",
    titre: "Sportif",
    accroche: "Une progression physique, et tout ce qu'il faut autour pour la tenir.",
    couleur: "#3ddc84",
    promesses: ["Séances et charges", "Sommeil et nutrition", "Cycles de progression"],
  },
  {
    id: "autre",
    emoji: "✨",
    titre: "Autre chose",
    accroche: "Rien de tout ça ne te ressemble. Tu diras toi-même.",
    couleur: "#b06bff",
    promesses: ["Construit sur ta réponse", "Aucun modèle imposé", "Modifiable ensuite"],
  },
];

export type Question = {
  id: string;
  intitule: string;
  /** Une phrase qui explique POURQUOI on demande — sinon on répond au hasard. */
  raison: string;
  choix: { id: string; libelle: string; emoji?: string }[];
  /** Plusieurs réponses possibles ? */
  multiple?: boolean;
};

export const QUESTIONS: Question[] = [
  {
    id: "rythme",
    intitule: "Tu donnes le meilleur à quel moment ?",
    raison: "Ta journée type sera construite autour de ce créneau, pas contre lui.",
    choix: [
      { id: "matin", libelle: "Tôt le matin", emoji: "🌅" },
      { id: "journee", libelle: "En pleine journée", emoji: "☀️" },
      { id: "soir", libelle: "Le soir", emoji: "🌙" },
      { id: "variable", libelle: "Ça change tout le temps", emoji: "🎲" },
    ],
  },
  {
    id: "temps",
    intitule: "Combien d'heures vraiment à toi, par jour ?",
    raison: "Une journée type qui ignore ta contrainte réelle ne tient pas trois jours.",
    choix: [
      { id: "moins2", libelle: "Moins de 2 h" },
      { id: "2a4", libelle: "2 à 4 h" },
      { id: "4a8", libelle: "4 à 8 h" },
      { id: "plus8", libelle: "Toute la journée" },
    ],
  },
  {
    id: "priorites",
    intitule: "Qu'est-ce que tu veux faire bouger cette année ?",
    raison: "C'est ce qui décidera de tes objectifs et de tes compétences suivies.",
    multiple: true,
    choix: [
      { id: "corps", libelle: "Mon corps", emoji: "💪" },
      { id: "argent", libelle: "Mes revenus", emoji: "💸" },
      { id: "savoir", libelle: "Apprendre", emoji: "📚" },
      { id: "creation", libelle: "Créer et publier", emoji: "🎨" },
      { id: "calme", libelle: "Moins de chaos", emoji: "🧘" },
      { id: "relations", libelle: "Mes relations", emoji: "🤝" },
    ],
  },
  {
    id: "obstacle",
    intitule: "Qu'est-ce qui te fait décrocher, d'habitude ?",
    raison: "L'OS relancera précisément là-dessus — pas au hasard.",
    choix: [
      { id: "oubli", libelle: "J'oublie", emoji: "🌀" },
      { id: "motivation", libelle: "Je perds la motivation", emoji: "🪫" },
      { id: "surcharge", libelle: "J'en mets trop d'un coup", emoji: "🧱" },
      { id: "flou", libelle: "Je ne sais pas par où commencer", emoji: "🌫️" },
    ],
  },
];

/** Les réponses telles qu'elles circulent entre l'écran et le serveur. */
export type Reponses = {
  profil: string;
  /** id de question → id(s) de choix */
  choix: Record<string, string[]>;
  /** Le mot libre du dernier écran. Facultatif, borné. */
  precision?: string;
};

export const LONGUEUR_PRECISION = 280;

/**
 * Vrai si les réponses sont exploitables.
 *
 * Vérifié des DEUX côtés : l'écran pour ne pas laisser avancer sur du vide, le
 * serveur parce qu'une requête peut arriver sans passer par l'écran.
 */
export function reponsesValides(r: unknown): r is Reponses {
  if (!r || typeof r !== "object") return false;
  const c = r as Partial<Reponses>;
  if (!PROFILS.some((p) => p.id === c.profil)) return false;
  if (!c.choix || typeof c.choix !== "object") return false;
  for (const q of QUESTIONS) {
    const donnees = c.choix[q.id];
    if (!Array.isArray(donnees) || donnees.length === 0) return false;
    if (!q.multiple && donnees.length !== 1) return false;
    if (!donnees.every((id) => q.choix.some((ch) => ch.id === id))) return false;
  }
  if (c.precision !== undefined && typeof c.precision !== "string") return false;
  if ((c.precision?.length ?? 0) > LONGUEUR_PRECISION) return false;
  return true;
}

/** Le résumé lisible des réponses, tel qu'il part au modèle. */
export function resumerReponses(r: Reponses): string {
  const profil = PROFILS.find((p) => p.id === r.profil);
  const lignes = [`Profil : ${profil?.titre ?? r.profil}`];
  for (const q of QUESTIONS) {
    const libelles = (r.choix[q.id] ?? [])
      .map((id) => q.choix.find((c) => c.id === id)?.libelle ?? id)
      .join(", ");
    lignes.push(`${q.intitule} → ${libelles}`);
  }
  if (r.precision?.trim()) lignes.push(`Précision libre : ${r.precision.trim()}`);
  return lignes.join("\n");
}

/* ------------------------------------------------------------------ */
/* Le catalogue de blocs, par profil                                    */
/* ------------------------------------------------------------------ */

/**
 * Ce que chaque profil se voit proposer, avant même que l'IA n'intervienne.
 *
 * Deux rôles, et le second est le plus important :
 *
 * 1. il donne à l'IA une base reconnaissable, pour qu'un étudiant ne reçoive
 *    pas la journée d'un indépendant repeinte ;
 * 2. il sert de SECOURS. Si la clé d'IA manque ou si le modèle ne répond pas,
 *    le sas propose quand même une journée complète au lieu d'un message
 *    d'échec. Un accueil qui se termine sur « réessaie » est un accueil qu'on
 *    ne recommence pas.
 *
 * Les horaires sont des points de départ : tout est modifiable à l'écran
 * juste après.
 */
export type BlocCatalogue = {
  debut: string;
  fin: string;
  titre: string;
  categorie: string;
  /** Proposé coché ? Les indispensables oui, les optionnels non. */
  parDefaut: boolean;
};

const SOCLE: BlocCatalogue[] = [
  { debut: "07:00", fin: "07:30", titre: "Réveil sans téléphone", categorie: "corps", parDefaut: true },
  { debut: "22:30", fin: "23:00", titre: "Coupure écrans", categorie: "repos", parDefaut: false },
];

export const BLOCS_PAR_PROFIL: Record<string, BlocCatalogue[]> = {
  etudiant: [
    ...SOCLE,
    { debut: "09:00", fin: "12:00", titre: "Cours", categorie: "autre", parDefaut: true },
    { debut: "14:00", fin: "16:00", titre: "Révisions ciblées", categorie: "creation", parDefaut: true },
    { debut: "16:30", fin: "17:30", titre: "Sport", categorie: "corps", parDefaut: true },
    { debut: "18:00", fin: "19:00", titre: "Fiches et relecture", categorie: "creation", parDefaut: false },
    { debut: "21:00", fin: "21:30", titre: "Lecture", categorie: "repos", parDefaut: false },
  ],
  createur: [
    ...SOCLE,
    { debut: "08:00", fin: "09:30", titre: "Écriture de scripts", categorie: "creation", parDefaut: true },
    { debut: "10:00", fin: "12:00", titre: "Tournage", categorie: "tournage", parDefaut: true },
    { debut: "14:00", fin: "16:30", titre: "Montage", categorie: "creation", parDefaut: true },
    { debut: "17:00", fin: "17:30", titre: "Réponses à la communauté", categorie: "business", parDefaut: false },
    { debut: "18:00", fin: "19:00", titre: "Sport", categorie: "corps", parDefaut: true },
  ],
  actif: [
    ...SOCLE,
    { debut: "07:30", fin: "08:15", titre: "Trajet — podcast ou lecture", categorie: "autre", parDefaut: false },
    { debut: "09:00", fin: "12:30", titre: "Travail — matinée", categorie: "business", parDefaut: true },
    { debut: "14:00", fin: "18:00", titre: "Travail — après-midi", categorie: "business", parDefaut: true },
    { debut: "18:30", fin: "19:30", titre: "Sport", categorie: "corps", parDefaut: true },
    { debut: "20:30", fin: "21:30", titre: "Projet perso", categorie: "creation", parDefaut: false },
  ],
  independant: [
    ...SOCLE,
    { debut: "08:30", fin: "09:00", titre: "Relances clients", categorie: "business", parDefaut: true },
    { debut: "09:00", fin: "12:30", titre: "Travail facturable", categorie: "business", parDefaut: true },
    { debut: "14:00", fin: "17:00", titre: "Travail facturable", categorie: "business", parDefaut: true },
    { debut: "17:00", fin: "17:30", titre: "Prospection", categorie: "business", parDefaut: false },
    { debut: "18:00", fin: "19:00", titre: "Sport", categorie: "corps", parDefaut: true },
  ],
  sportif: [
    ...SOCLE,
    { debut: "07:30", fin: "09:00", titre: "Séance du matin", categorie: "corps", parDefaut: true },
    { debut: "09:15", fin: "09:45", titre: "Petit-déjeuner protéiné", categorie: "corps", parDefaut: true },
    { debut: "12:30", fin: "13:15", titre: "Repas complet", categorie: "corps", parDefaut: false },
    { debut: "18:00", fin: "19:15", titre: "Séance du soir", categorie: "corps", parDefaut: false },
    { debut: "22:00", fin: "22:30", titre: "Étirements et sommeil", categorie: "repos", parDefaut: true },
  ],
  autre: [
    ...SOCLE,
    { debut: "09:00", fin: "11:00", titre: "Bloc de travail profond", categorie: "creation", parDefaut: true },
    { debut: "14:00", fin: "16:00", titre: "Deuxième bloc", categorie: "creation", parDefaut: true },
    { debut: "17:30", fin: "18:30", titre: "Sport", categorie: "corps", parDefaut: true },
    { debut: "20:00", fin: "20:30", titre: "Bilan de la journée", categorie: "repos", parDefaut: false },
  ],
};

/** Les habitudes proposées par profil, en secours comme pour l'IA. */
export const HABITUDES_PAR_PROFIL: Record<string, { nom: string; categorie: string }[]> = {
  etudiant: [
    { nom: "Révision du jour", categorie: "Savoir" },
    { nom: "Sport", categorie: "Corps" },
    { nom: "Coucher avant minuit", categorie: "Corps" },
  ],
  createur: [
    { nom: "Publier", categorie: "Création" },
    { nom: "Sport", categorie: "Corps" },
    { nom: "Veille", categorie: "Création" },
  ],
  actif: [
    { nom: "Sport", categorie: "Corps" },
    { nom: "Couper le travail le soir", categorie: "Autre" },
    { nom: "Projet perso avancé", categorie: "Création" },
  ],
  independant: [
    { nom: "Relance faite", categorie: "Business" },
    { nom: "Sport", categorie: "Corps" },
    { nom: "Compta à jour", categorie: "Business" },
  ],
  sportif: [
    { nom: "Séance faite", categorie: "Corps" },
    { nom: "Protéines atteintes", categorie: "Corps" },
    { nom: "8 h de sommeil", categorie: "Corps" },
  ],
  autre: [
    { nom: "Bloc profond fait", categorie: "Autre" },
    { nom: "Sport", categorie: "Corps" },
  ],
};
