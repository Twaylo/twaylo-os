/**
 * Le type d'un événement d'agenda, isolé de `agenda.ts`.
 *
 * `agenda.ts` importe `node-ical`, qui est un module Node : l'importer depuis
 * un composant client ferait entrer tout le parseur ICS dans le bundle
 * navigateur. Seul le type traverse la frontière.
 */
export type EvenementAgenda = {
  id: string;
  titre: string;
  /** `HH:MM`, ou vide pour un événement sur la journée entière. */
  heure: string;
  /** Position dans la semaine, 0 = lundi. */
  jourIndex: number;
  debut: string;
  journeeEntiere: boolean;
};
