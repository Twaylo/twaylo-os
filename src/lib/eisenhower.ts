import { niveauDepuisUrgence, type Niveau } from "./types";

/**
 * La matrice d'Eisenhower — la grille de décision des Oubliés.
 *
 * Une tâche qui a traîné quatre jours ne se juge plus à sa place dans la todo
 * mais à deux questions : est-ce important, est-ce urgent ? Les quatre
 * réponses appellent quatre gestes différents — et c'est le geste, pas
 * l'étiquette, qui vide l'archive.
 *
 * Le quadrant décide aussi du retour : reprendre depuis « Faire » ramène la
 * tâche en focus principal, depuis « Planifier » en secondaire, depuis
 * « Déléguer » en annexe. La grille n'est pas un classement décoratif, elle
 * pilote la todo.
 */

export type Quadrant = "faire" | "planifier" | "deleguer" | "eliminer";

export const QUADRANTS: Record<
  Quadrant,
  {
    nom: string;
    /** Ce que la case veut dire, en une ligne. */
    sousTitre: string;
    /** Le geste qu'elle appelle. */
    action: string;
    couleur: string;
    important: boolean;
    urgent: boolean;
    /** Le niveau dans lequel la tâche revient si elle est reprise. */
    niveauRetour: Niveau;
  }
> = {
  faire: {
    nom: "FAIRE",
    sousTitre: "Important · Urgent",
    action: "À reprendre maintenant",
    couleur: "var(--color-mag)",
    important: true,
    urgent: true,
    niveauRetour: "principal",
  },
  planifier: {
    nom: "PLANIFIER",
    sousTitre: "Important · Pas urgent",
    action: "À caler dans la semaine",
    couleur: "var(--color-cya)",
    important: true,
    urgent: false,
    niveauRetour: "secondaire",
  },
  deleguer: {
    nom: "DÉLÉGUER",
    sousTitre: "Urgent · Pas important",
    action: "Monteur, fixeur, freelance",
    couleur: "var(--color-amb)",
    important: false,
    urgent: true,
    niveauRetour: "annexe",
  },
  eliminer: {
    nom: "ÉLIMINER",
    sousTitre: "Ni important · Ni urgent",
    action: "À jeter sans regret",
    couleur: "rgba(255,255,255,0.4)",
    important: false,
    urgent: false,
    niveauRetour: "annexe",
  },
};

/** L'ordre de lecture de la grille : la ligne du haut est celle qui compte. */
export const ORDRE_QUADRANTS: Quadrant[] = [
  "faire",
  "planifier",
  "deleguer",
  "eliminer",
];

export function estQuadrant(v: unknown): v is Quadrant {
  // `Object.hasOwn` et non `in` : ce dernier accepte « toString » ou
  // « constructor », hérités du prototype. Une tâche rangée sous un tel nom
  // ne correspondait à aucune case et disparaissait de l'écran tout en
  // restant en base.
  return typeof v === "string" && Object.hasOwn(QUADRANTS, v);
}

/** Au-delà, une tâche qui n'a rien cassé n'était pas urgente. */
const JOURS_ENCORE_CHAUD = 7;

/**
 * Le rangement d'office, à l'arrivée dans l'archive.
 *
 * Twaylo n'a rien à trier pour que la grille soit lisible : on part de ce que
 * la tâche disait déjà d'elle-même. Son ancien niveau porte l'importance,
 * son âge porte l'urgence — mais à l'envers de l'intuition : ce qui attend
 * depuis trois semaines sans que rien ne casse n'était pas urgent, tandis que
 * ce qui vient tout juste de tomber l'est peut-être encore.
 *
 * L'importance ne peut PAS venir du focus principal : l'archivage l'épargne
 * justement (`archiverTachesOubliees` écarte l'urgence « aujourdhui »), donc
 * aucune tâche archivée n'est de ce niveau. S'y fier laissait la case FAIRE
 * — la première de la grille, celle qu'on lit d'abord — vide à tout jamais.
 * C'est le secondaire, « ce qui soutient la journée », qui porte ici
 * l'importance ; l'annexe, « à sortir de la tête », ne la porte pas.
 *
 * Twaylo corrige d'un geste, et son choix est mémorisé.
 */
export function quadrantParDefaut(urgence: string, jours: number): Quadrant {
  const important = niveauDepuisUrgence(urgence) !== "annexe";
  const urgent = jours < JOURS_ENCORE_CHAUD;

  if (important) return urgent ? "faire" : "planifier";
  return urgent ? "deleguer" : "eliminer";
}
