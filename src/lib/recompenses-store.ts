"use client";

/**
 * La file des fenêtres de récompense, gardée HORS de React.
 *
 * Ce n'est pas un caprice d'architecture. Les célébrations sont déclenchées
 * depuis des effets — « je viens de détecter une montée de niveau, annonce-la ».
 * Un effet a le droit de pousser vers un système extérieur ; il n'a pas à
 * appeler `setState` en cascade sur le composant qui vient de rendre. La file
 * vit donc dans ce module, et les composants s'y abonnent avec
 * `useSyncExternalStore` — le motif prévu pour exactement ça.
 *
 * Effet de bord utile : n'importe quel morceau de l'OS peut féliciter Twaylo
 * sans avoir accès au contexte de progression.
 */

export type Recompense = {
  /** Unique par occurrence : clé de rendu et garde-fou anti-doublon. */
  cle: string;
  emoji: string;
  titre: string;
  texte: string;
  couleur: string;
  /** Affiché en gros quand la récompense rapporte de l'XP. */
  xp?: number;
};

/**
 * Référence stable tant que rien ne change : `useSyncExternalStore` compare
 * les instantanés par identité et bouclerait à l'infini sur un tableau
 * reconstruit à chaque lecture.
 */
let file: Recompense[] = [];
const VIDE: Recompense[] = [];
const abonnes = new Set<() => void>();
let compteur = 0;

function prevenir() {
  for (const f of abonnes) f();
}

/** Ajoute une célébration à la file. Rien ne s'affiche si une autre est en cours. */
export function feter(r: Omit<Recompense, "cle">): void {
  compteur += 1;
  file = [...file, { ...r, cle: `r${compteur}` }];
  prevenir();
}

/** Referme celle du dessus et laisse passer la suivante. */
export function fermerRecompense(): void {
  if (file.length === 0) return;
  file = file.slice(1);
  prevenir();
}

export function lireFile(): Recompense[] {
  return file;
}

/** L'instantané côté serveur : jamais de récompense dans le HTML initial. */
export function lireFileServeur(): Recompense[] {
  return VIDE;
}

export function surRecompenses(f: () => void): () => void {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}
