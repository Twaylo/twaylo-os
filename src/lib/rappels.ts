import { lireJour } from "./db";
import { type Notification } from "./push";

/**
 * Ce que la notification doit dire, en fonction de ce qui manque vraiment.
 *
 * Le principe est le même que pour les relances de l'écran : une notification
 * qui tombe alors que tout est rempli n'est pas un rappel, c'est du bruit — et
 * le bruit apprend à balayer sans lire. Quand il n'y a rien à dire, on
 * renvoie `null` et rien ne part.
 *
 * La DÉCISION est pure, la lecture en base est à côté. C'est ce qui permet de
 * l'éprouver hors ligne, cas par cas, sans base ni serveur — comme le moteur
 * d'XP.
 */

export type EtatRappel = {
  /** Nombre de tâches de la journée, et combien sont cochées. */
  taches: number;
  tachesFaites: number;
  /** Le focus du jour, tel qu'il est écrit (vide s'il n'y en a pas). */
  focus: string;
  /** Le journal du soir. */
  journal: string;
};

/** Le matin : poser la journée. On ne relance que si elle est encore vierge. */
export function rappelMatin(e: EtatRappel): Notification | null {
  const focus = e.focus.trim();
  if (e.taches > 0 && focus) return null;

  const manque: string[] = [];
  if (e.taches === 0) manque.push("ta to-do");
  if (!focus) manque.push("ton focus du jour");

  return {
    titre: "La journée commence",
    corps: `Pose ${manque.join(" et ")} — deux minutes, et le reste suit.`,
    etiquette: "matin",
  };
}

/**
 * Le soir : ce qui manque encore, nommé.
 *
 * « Tu n'as rien rempli » ne fait rien faire. « Il te manque ton journal »
 * dit quoi ouvrir, et c'est la différence entre une notification balayée et
 * une notification suivie.
 */
export function rappelSoir(e: EtatRappel): Notification | null {
  const manque: string[] = [];
  if (!e.journal.trim()) manque.push("ton journal");
  if (!e.focus.trim()) manque.push("ton focus du jour");

  const restantes = Math.max(0, e.taches - e.tachesFaites);
  if (manque.length === 0 && restantes === 0) return null;

  const morceaux = [...manque];
  if (restantes > 0) morceaux.push(`${restantes} tâche${restantes > 1 ? "s" : ""} à cocher`);

  return {
    titre: "Avant de fermer la journée",
    corps: `Il te reste ${morceaux.join(", ")}.`,
    etiquette: "soir",
  };
}

/* ---------- La lecture, seule partie qui touche la base ---------- */

type EtatBrut = {
  taches?: { total?: number; faites?: number };
  une_chose?: { texte?: string };
};

async function lireEtatRappel(jour: string): Promise<EtatRappel> {
  const { etat, journal } = (await lireJour(jour)) as { etat: EtatBrut; journal: string };
  return {
    taches: etat.taches?.total ?? 0,
    tachesFaites: etat.taches?.faites ?? 0,
    focus: etat.une_chose?.texte ?? "",
    journal: journal ?? "",
  };
}

export async function rappelDuMatin(jour: string): Promise<Notification | null> {
  return rappelMatin(await lireEtatRappel(jour));
}

export async function rappelDuSoir(jour: string): Promise<Notification | null> {
  return rappelSoir(await lireEtatRappel(jour));
}
