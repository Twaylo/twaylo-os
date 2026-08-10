import { localDateKey } from "./local-date";
import type { Skill } from "./types";

/**
 * Le suivi hebdomadaire des compétences.
 *
 * L'historique était mensuel : un seul instantané par mois, écrasé à chaque
 * réglage. Sur un rythme mensuel, une progression met un trimestre à devenir
 * visible — trois points ne font pas une courbe. On passe donc à la semaine,
 * ce qui donne douze points par trimestre et une trajectoire qu'on peut lire.
 *
 * Tout ici est PUR : aucune lecture, aucune écriture. C'est ce qui permet de
 * l'éprouver cas par cas hors ligne, comme le moteur d'XP.
 */

/**
 * La clé d'une semaine : le lundi qui la commence, en `AAAA-MM-JJ`.
 *
 * Le lundi et non le jour courant : deux réglages le mardi et le vendredi
 * doivent produire UN point, pas deux. Sans ça, une semaine où l'on se règle
 * trois fois peserait trois fois plus qu'une semaine tranquille.
 *
 * Calcul ancré sur UTC volontairement : ajouter des jours à une date locale
 * saute ou répète une heure aux changements d'heure, et un lundi peut alors
 * devenir un dimanche.
 */
export function cleSemaine(jour: string = localDateKey()): string {
  const debut = Date.parse(`${jour}T00:00:00Z`);
  if (!Number.isFinite(debut)) return jour;
  // getUTCDay : 0 = dimanche. On veut le lundi comme premier jour.
  const recul = (new Date(debut).getUTCDay() + 6) % 7;
  return new Date(debut - recul * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pose (ou remplace) le point d'une clé donnée.
 *
 * Le champ garde son nom `mois` : il porte désormais soit un mois (`AAAA-MM`,
 * les anciennes données) soit une semaine (`AAAA-MM-JJ`). Aucune migration
 * n'est possible sur cette base, et les deux formats se trient correctement
 * dans l'ordre alphabétique — « 2026-07 » vient bien avant « 2026-07-06 »,
 * lui-même avant « 2026-08 ».
 */
export function majPoint(
  historique: Skill["historique"],
  cle: string,
  niveau: number,
): Skill["historique"] {
  return [...historique.filter((h) => h.mois !== cle), { mois: cle, niveau }]
    .sort((a, b) => a.mois.localeCompare(b.mois))
    /*
     * On garde les 60 derniers points, comme la route API.
     *
     * Sans cette coupe, l'historique grossit d'un point par semaine et par
     * compétence — la sentinelle est relue et réécrite entièrement à chaque
     * modification, et c'est la ligne la plus sollicitée de la base.
     */
    .slice(-60);
}

/** Ce qui a été gagné depuis le dernier point ANTÉRIEUR, ou null si nouveau. */
export function progressionDepuis(s: Skill, cle: string): number | null {
  const anterieurs = s.historique.filter((h) => h.mois < cle);
  if (anterieurs.length === 0) return null;
  return s.niveau - anterieurs[anterieurs.length - 1].niveau;
}

/** La clé du dernier point enregistré, toutes compétences confondues. */
export function dernierPoint(skills: Skill[]): string | null {
  let max: string | null = null;
  for (const s of skills) {
    for (const h of s.historique) {
      if (max === null || h.mois > max) max = h.mois;
    }
  }
  return max;
}

/**
 * Faut-il proposer l'actualisation hebdomadaire ?
 *
 * Oui si aucune compétence n'a été touchée depuis le lundi de cette semaine.
 * Aucun réglage à stocker : la réponse se déduit de l'historique lui-même, et
 * un compteur séparé aurait pu se désynchroniser de ce qu'on voit à l'écran.
 */
export function aActualiser(skills: Skill[], semaine: string = cleSemaine()): boolean {
  if (skills.length === 0) return false;
  const dernier = dernierPoint(skills);
  return dernier === null || dernier < semaine;
}

/** Le nombre de semaines entières écoulées depuis le dernier point. */
export function semainesDepuis(skills: Skill[], semaine: string = cleSemaine()): number {
  const dernier = dernierPoint(skills);
  if (!dernier) return 0;
  // Les anciens points mensuels n'ont pas de jour : on les rattache au 1er.
  const normalise = dernier.length === 7 ? `${dernier}-01` : dernier;
  const a = Date.parse(`${cleSemaine(normalise)}T00:00:00Z`);
  const b = Date.parse(`${semaine}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / (7 * 86_400_000)));
}

/**
 * Les courbes à dessiner : une abscisse commune, une valeur par compétence.
 *
 * Une compétence non réglée une semaine garde son niveau : on reporte la
 * dernière valeur connue. C'est le sens réel — ne pas se réévaluer ne fait pas
 * régresser — et sans ce report la courbe tomberait à zéro entre deux
 * réglages.
 */
export function courbes(
  skills: Skill[],
  nbSemaines = 12,
  semaine: string = cleSemaine(),
): { cles: string[]; series: { id: string; nom: string; categorie: string; valeurs: (number | null)[] }[] } {
  const cles: string[] = [];
  const base = Date.parse(`${semaine}T00:00:00Z`);
  if (!Number.isFinite(base)) return { cles: [], series: [] };
  for (let i = nbSemaines - 1; i >= 0; i--) {
    cles.push(new Date(base - i * 7 * 86_400_000).toISOString().slice(0, 10));
  }

  const series = skills.map((s) => {
    const trie = [...s.historique].sort((a, b) => a.mois.localeCompare(b.mois));
    let curseur = 0;
    let dernier: number | null = null;
    const valeurs = cles.map((cle) => {
      // Tous les points antérieurs ou égaux à cette semaine.
      while (curseur < trie.length && trie[curseur].mois <= cle) {
        dernier = trie[curseur].niveau;
        curseur++;
      }
      return dernier;
    });
    // Le niveau courant est plus frais que le dernier point enregistré dès
    // qu'on vient de bouger un curseur : la fin de courbe doit le montrer.
    if (valeurs.length > 0) valeurs[valeurs.length - 1] = s.niveau;
    return { id: s.id, nom: s.nom, categorie: s.categorie, valeurs };
  });

  return { cles, series };
}
