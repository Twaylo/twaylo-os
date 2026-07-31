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
  return typeof v === "string" && v in QUADRANTS;
}

/**
 * Le rangement d'office, à l'arrivée dans l'archive.
 *
 * Twaylo n'a rien à trier pour que la grille soit lisible : on part de ce que
 * la tâche disait déjà d'elle-même. Son ancien niveau porte l'importance
 * (le focus principal était ce qui faisait la journée) ; l'âge porte
 * l'urgence, mais à l'envers de l'intuition — quelque chose qui attend depuis
 * deux semaines sans que rien ne casse n'était pas urgent. Twaylo corrige
 * d'un geste, et son choix est mémorisé.
 */
export function quadrantParDefaut(urgence: string, jours: number): Quadrant {
  const niveau = niveauDepuisUrgence(urgence);
  const important = niveau === "principal" || niveau === "secondaire";
  // Passé deux semaines, l'urgence supposée ne tient plus : si ça n'a pas
  // explosé, ce n'était pas urgent.
  const urgent = niveau === "principal" && jours < 14;

  if (important && urgent) return "faire";
  if (important) return "planifier";
  return jours < 14 ? "deleguer" : "eliminer";
}
