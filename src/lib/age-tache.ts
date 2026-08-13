/**
 * L'ÂGE D'UNE TÂCHE.
 *
 * Une liste sans âge donne le même poids à ce qu'on vient de noter et à ce
 * qu'on repousse depuis une semaine. C'est comme ça qu'une tâche pourrit en
 * pleine lumière : elle est là tous les jours, on la lit tous les jours, et
 * rien ne dit qu'elle est là depuis six jours.
 *
 * L'onglet « Oubliés » archive ce qui traîne au-delà d'un seuil, mais
 * l'archivage arrive trop tard — ce qui compte est de la voir vieillir pendant
 * qu'elle est encore sous les yeux et qu'un geste peut encore la clore.
 *
 * Rien ici ne lit l'horloge : le jour du jour est passé en paramètre. C'est ce
 * qui rend la règle vérifiable hors ligne, et ce qui évite qu'un composant
 * rendu côté serveur et côté navigateur ne calcule deux âges différents.
 */

/** Un jour civil `AAAA-MM-JJ` transformé en nombre de jours, ancré à midi UTC. */
function enJours(jour: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const t = Date.parse(`${jour}T12:00:00Z`);
  return Number.isNaN(t) ? null : Math.round(t / 86_400_000);
}

/**
 * Combien de jours séparent la création d'aujourd'hui.
 *
 * `null` si la date manque ou n'a pas la bonne forme — une tâche qu'on vient
 * de taper n'a pas encore atteint la base, elle n'a donc pas d'âge à montrer.
 * Jamais négatif : une date de création dans le futur (horloge de travers,
 * fuseau exotique) vaut « aujourd'hui » plutôt qu'un « -1j » absurde.
 */
export function ageEnJours(creeLe: string | undefined, aujourdhui: string): number | null {
  if (!creeLe) return null;
  const a = enJours(creeLe);
  const b = enJours(aujourdhui);
  if (a === null || b === null) return null;
  return Math.max(0, b - a);
}

/** Ce qu'on affiche pour un âge donné, ou rien. */
export type Vieillesse = { texte: string; couleur: string; titre: string };

/**
 * Le badge d'âge — et le SILENCE en dessous de deux jours.
 *
 * Une tâche notée hier n'est pas en retard, c'est le fonctionnement normal
 * d'une todo. Marquer « 1j » sur la moitié de la liste ne dirait rien et
 * ferait du bruit partout ; on ne parle qu'à partir du moment où la tâche a
 * survécu à deux clôtures de journée.
 *
 * Deux paliers seulement, parce que trois nuances de gravité sur une étiquette
 * de dix pixels ne se lisent pas : ambre = ça traîne, rose = ça pourrit.
 */
export function vieillesse(jours: number | null): Vieillesse | null {
  if (jours === null || jours < 2) return null;
  const texte = `${jours}j`;
  if (jours >= 5) {
    return {
      texte,
      couleur: "var(--color-mag)",
      titre: `Notée il y a ${jours} jours — à faire ou à retirer`,
    };
  }
  return {
    texte,
    couleur: "var(--color-amb)",
    titre: `Notée il y a ${jours} jours`,
  };
}
