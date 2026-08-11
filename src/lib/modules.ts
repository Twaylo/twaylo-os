/**
 * Le catalogue : ce qu'un OS peut contenir, et ce qu'il contient par défaut.
 *
 * C'est le fichier qui sépare **le produit** de **l'OS de Twaylo**. Jusqu'ici
 * les treize onglets étaient une constante : tout le monde recevait le tableau
 * de bord d'un YouTubeur, sponsors et pipeline vidéo compris. Un étudiant
 * n'avait rien à en faire, et Twaylo ne pouvait rien ajouter chez lui sans
 * l'ajouter chez tout le monde.
 *
 * Deux catalogues, deux échelles :
 *
 * - les MODULES sont les onglets. Installer un module, c'est ajouter une page
 *   entière à son OS ;
 * - les BLOCS sont les cartes de l'accueil. C'est le réglage fin : deux
 *   personnes avec les mêmes modules peuvent avoir deux accueils très
 *   différents.
 *
 * Les deux sont choisis une première fois par le sas (d'après le profil), puis
 * modifiables à vie depuis « Personnaliser ». Rien n'est verrouillé : un
 * étudiant qui se met à publier installe Contenu le jour où ça lui sert.
 *
 * Pur, sans React et sans base : le sas côté serveur, le rail côté navigateur
 * et l'aperçu du plan lisent tous ce même fichier. Trois copies auraient
 * divergé au premier ajout.
 */

/* ------------------------------------------------------------------ */
/* Les modules — un module, un onglet                                  */
/* ------------------------------------------------------------------ */

export const TABS = [
  "Accueil",
  "Brain",
  "Bilan",
  "Journée type",
  "Contacts",
  "Sponsors",
  "Contenu",
  "Revenus",
  "Journal",
  "Objectifs",
  "Skill",
  "Revue",
  "Oubliés",
] as const;

export type Tab = (typeof TABS)[number];

export type Module = {
  id: Tab;
  emoji: string;
  /** Une ligne qui dit ce que ça FAIT, pas ce que ça contient. */
  description: string;
  /** Installé d'office et non désinstallable : sans lui, plus d'OS. */
  coeur?: boolean;
  /** Les profils qui le reçoivent installé dès le premier jour. */
  profils: string[];
};

const TOUS = ["etudiant", "createur", "actif", "independant", "sportif", "autre"];

export const MODULES: Module[] = [
  {
    id: "Accueil",
    emoji: "🏠",
    description: "Le tableau de bord. Tout ce que tu veux voir en ouvrant.",
    coeur: true,
    profils: TOUS,
  },
  {
    id: "Journée type",
    emoji: "🗓️",
    description: "Le déroulé de tes journées, en plusieurs versions selon le contexte.",
    profils: TOUS,
  },
  {
    id: "Objectifs",
    emoji: "🎯",
    description: "Ce que tu vises à la semaine, au mois, à l'année — découpé en étapes.",
    profils: TOUS,
  },
  {
    id: "Bilan",
    emoji: "📊",
    description: "Ta progression en chiffres : XP, séries, exploits, calendrier.",
    profils: [],
  },
  {
    id: "Journal",
    emoji: "✍️",
    description: "Une ligne par soir. C'est ce qui rend une année lisible.",
    profils: ["etudiant", "actif", "sportif", "autre"],
  },
  {
    id: "Skill",
    emoji: "📈",
    description: "Tes compétences notées chaque semaine, et leur courbe.",
    profils: ["etudiant", "sportif"],
  },
  {
    id: "Brain",
    emoji: "🧠",
    description: "L'assistant : tu lui parles, il range au bon endroit.",
    profils: ["createur"],
  },
  {
    id: "Revue",
    emoji: "🔍",
    description: "Le point hebdomadaire : ce qui a tenu, ce qui a lâché.",
    profils: ["independant"],
  },
  {
    id: "Oubliés",
    emoji: "🕳️",
    description: "Les tâches qui traînent depuis trop longtemps, sorties de la liste.",
    profils: ["actif"],
  },
  {
    id: "Contacts",
    emoji: "🤝",
    description: "Les gens, leur température, et qui relancer.",
    profils: ["independant"],
  },
  {
    id: "Contenu",
    emoji: "🎬",
    description: "Le pipeline de publication, de l'idée au publié.",
    profils: ["createur"],
  },
  {
    id: "Sponsors",
    emoji: "💼",
    description: "Les deals : négociation, livraison, paiement.",
    profils: [],
  },
  {
    id: "Revenus",
    emoji: "💸",
    description: "Ce qui rentre, d'où ça vient, et la tendance.",
    profils: ["independant"],
  },
];

export const MODULE_PAR_ID = new Map(MODULES.map((m) => [m.id as string, m]));

/** Les modules qu'on ne peut pas retirer. */
export const MODULES_COEUR: string[] = MODULES.filter((m) => m.coeur).map((m) => m.id);

/* ------------------------------------------------------------------ */
/* Les blocs de l'accueil                                              */
/* ------------------------------------------------------------------ */

export type BlocAccueil = {
  id: string;
  titre: string;
  emoji: string;
  description: string;
  /**
   * Le module sans lequel ce bloc n'a aucun sens.
   *
   * Le pipeline de contenu sur l'accueil de quelqu'un qui n'a pas l'onglet
   * Contenu montrerait des colonnes qu'il ne peut ni remplir ni ouvrir.
   */
  module?: Tab;
  /** Toute la largeur, sous la grille compactée. */
  large?: boolean;
  profils: string[];
};

export const BLOCS: BlocAccueil[] = [
  {
    id: "operateur",
    titre: "Opérateur",
    emoji: "👤",
    description: "Qui tu es, ta série, et la chose du jour.",
    profils: TOUS,
  },
  {
    id: "progression",
    titre: "Progression",
    emoji: "⚡",
    description: "Niveau, XP du jour, et ce qu'il reste à prendre avant ce soir.",
    profils: TOUS,
  },
  {
    id: "quetes",
    titre: "Quêtes du jour",
    emoji: "🎲",
    description: "Trois objectifs tirés chaque matin. Ils changent tous les jours.",
    profils: TOUS,
  },
  {
    id: "taches",
    titre: "Tâches clés",
    emoji: "✅",
    description: "Focus principal, secondaire, annexes — rangés par ce qui compte.",
    profils: TOUS,
  },
  {
    id: "journee",
    titre: "Journée type",
    emoji: "🗓️",
    description: "Les blocs immuables du jour, à cocher au fil des heures.",
    module: "Journée type",
    profils: TOUS,
  },
  {
    id: "habitudes",
    titre: "Habitudes",
    emoji: "☑️",
    description: "Ce qui revient chaque jour, et la série de chacune.",
    profils: TOUS,
  },
  {
    id: "objectifs",
    titre: "Objectifs",
    emoji: "🎯",
    description: "Où tu en es sur ce que tu vises, en une barre par objectif.",
    module: "Objectifs",
    profils: [],
  },
  {
    id: "blocages",
    titre: "Ça coince",
    emoji: "🧱",
    description: "Ce qui bloque, nommé — pour arrêter d'y penser en boucle.",
    profils: [],
  },
  {
    id: "semaine",
    titre: "La semaine",
    emoji: "📆",
    description: "Les sept derniers jours d'un coup d'œil.",
    profils: [],
  },
  {
    id: "nutrition",
    titre: "Nutrition",
    emoji: "🍽",
    description: "Les repas notés, les calories et les protéines du jour.",
    profils: ["sportif"],
  },
  {
    id: "revenus",
    titre: "Revenus",
    emoji: "💸",
    description: "Le résumé de ce qui rentre.",
    module: "Revenus",
    profils: ["independant"],
  },
  {
    id: "exploits",
    titre: "Exploits",
    emoji: "🏅",
    description: "Les prochains exploits à débloquer, et ceux déjà pris.",
    profils: [],
  },
  {
    id: "pipeline",
    titre: "Pipeline contenu",
    emoji: "🎬",
    description: "Tes vidéos par étape, en pleine largeur.",
    module: "Contenu",
    large: true,
    profils: ["createur"],
  },
  {
    id: "journal",
    titre: "Journal du soir",
    emoji: "✍️",
    description: "Le champ d'écriture du soir, directement sur l'accueil.",
    module: "Journal",
    large: true,
    profils: [],
  },
];

export const BLOC_PAR_ID = new Map(BLOCS.map((b) => [b.id, b]));

/* ------------------------------------------------------------------ */
/* Ce qu'on installe selon le profil                                   */
/* ------------------------------------------------------------------ */

/**
 * Les modules d'un profil, dans l'ordre du catalogue.
 *
 * L'ordre du catalogue n'est pas alphabétique : il va du quotidien
 * (accueil, journée, objectifs) vers l'occasionnel (contacts, sponsors). Le
 * rail se lit donc de gauche à droite dans l'ordre où on s'en sert.
 */
export function modulesDuProfil(profil: string): string[] {
  return MODULES.filter((m) => m.coeur || m.profils.includes(profil)).map((m) => m.id);
}

/** Les blocs d'accueil d'un profil, filtrés par les modules réellement installés. */
export function blocsDuProfil(profil: string, modules: string[]): string[] {
  const installes = new Set(modules);
  return BLOCS.filter(
    (b) => b.profils.includes(profil) && (!b.module || installes.has(b.module)),
  ).map((b) => b.id);
}

/** L'OS complet — ce que reçoit le compte historique, et le repli général. */
export function tousLesModules(): string[] {
  return MODULES.map((m) => m.id);
}

export function tousLesBlocs(): string[] {
  return BLOCS.map((b) => b.id);
}

/* ------------------------------------------------------------------ */
/* Mise en ordre                                                       */
/* ------------------------------------------------------------------ */

/**
 * Range une sélection : d'abord ce que la personne a rangé, puis les nouveautés.
 *
 * Un module ajouté par une version future n'est PAS installé d'office — il
 * apparaît dans le catalogue de « Personnaliser », à installer si on veut. On
 * ne s'invite pas dans l'OS de quelqu'un.
 */
export function ordonner(choisis: string[], catalogue: readonly string[]): string[] {
  const connus = new Set(catalogue);
  const vus = new Set<string>();
  const rangés: string[] = [];
  for (const id of choisis) {
    if (connus.has(id) && !vus.has(id)) {
      vus.add(id);
      rangés.push(id);
    }
  }
  return rangés;
}
