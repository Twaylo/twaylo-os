import type { Task } from "./types";

/**
 * CE QUI SURVIT AU PASSAGE AU JOUR SUIVANT.
 *
 * Trois sorts possibles, et un seul efface :
 *
 *  · une tâche INACHEVÉE reste telle quelle — elle devient la todo de demain,
 *    Twaylo n'a pas à retaper ce qu'il n'a pas eu le temps de finir ;
 *  · une tâche GELÉE est décochée et reste à sa place, cochée ou non. C'est
 *    « poster sur Snap et Facebook » : pas une tâche qu'on finit, une tâche
 *    qu'on refait. L'effacer obligerait à la réécrire chaque matin ;
 *  · une tâche faite et non gelée s'en va.
 *
 * Isolé du contexte et sans effet de bord, parce que c'est la seule règle de
 * l'OS qui DÉTRUIT des données. Une erreur ici ne se voit pas au moment où
 * elle se produit — elle se voit le lendemain matin, quand quelque chose
 * manque et que plus personne ne sait quoi. On peut donc la vérifier hors
 * ligne, cas par cas, sans base de données.
 */
export type Cloture = {
  /** La liste telle que l'écran doit la montrer une fois la journée close. */
  restantes: Task[];
  /**
   * Les identifiants à décocher EN BASE, et à décocher AVANT le vidage.
   *
   * Le vidage efface toutes les lignes marquées faites, sans distinction : une
   * gelée encore cochée à ce moment-là partirait avec les autres. L'ordre
   * n'est donc pas un détail de style, c'est ce qui la sauve.
   */
  aDegeler: string[];
};

export function cloturerTodo(taches: Task[]): Cloture {
  const restantes: Task[] = [];
  const aDegeler: string[] = [];

  for (const t of taches) {
    if (t.gelee) {
      if (t.done) {
        if (typeof t.id === "string" && t.id) aDegeler.push(t.id);
        restantes.push({ ...t, done: false, faiteLe: undefined });
      } else {
        restantes.push(t);
      }
      continue;
    }
    if (!t.done) restantes.push(t);
  }

  return { restantes, aDegeler };
}
