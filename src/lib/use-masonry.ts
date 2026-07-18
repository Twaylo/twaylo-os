"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Fait tenir les cartes à la hauteur de leur contenu, au lieu de s'étirer à
 * celle de la plus grande de leur rangée.
 *
 * Le problème mesuré sur l'accueil : dans une grille CSS classique, la hauteur
 * d'une rangée est celle de sa carte la plus haute, et toutes les autres
 * s'étirent. Revenus perdait 260 px de vide, Ça coince 293, Nutrition 281 —
 * pour 2,35 écrans à faire défiler alors que le contenu réel en tenait bien
 * moins.
 *
 * La grille est donc découpée en rangées très fines (`grid-auto-rows`), et
 * chaque carte occupe autant de ces micro-rangées que son contenu l'exige. On
 * retire de l'air, pas du design : largeurs, couleurs et ordre sont intacts.
 *
 * Fait en JavaScript faute de `grid-template-rows: masonry`, encore absent de
 * tous les navigateurs stables.
 *
 * Le recalcul est déclenché par les rendus React, pas par un ResizeObserver.
 * C'est délibéré : une carte change de taille parce que React vient d'y
 * afficher autre chose, et ce moment-là est exactement celui d'un rendu. Une
 * version précédente s'appuyait sur ResizeObserver et laissait la carte
 * Habitudes figée à la taille qu'elle avait avant l'arrivée des données —
 * elle débordait alors sur ses voisines.
 */
export function useMasonry<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const recalculer = useCallback(() => {
    const grille = ref.current;
    if (!grille) return;

    const enfants = Array.from(grille.children) as HTMLElement[];

    // Effacer avant de mesurer, sinon on lit une hauteur déjà contrainte par
    // le span précédent — c'est ce qui faisait se chevaucher les cartes au
    // passage en mobile.
    for (const enfant of enfants) enfant.style.gridRowEnd = "";

    const style = getComputedStyle(grille);
    const unite = parseFloat(style.gridAutoRows);
    const espace = parseFloat(style.rowGap) || 0;
    // Une seule colonne : la grille est déjà une pile, la contraindre
    // n'apporterait rien. `gridAutoRows` vaut alors `auto`, donc NaN.
    const compactable =
      style.gridTemplateColumns.split(" ").length > 1 &&
      Number.isFinite(unite) &&
      unite > 0;

    if (!compactable) return;

    // Toutes les mesures avant toutes les écritures : les intercaler forcerait
    // un recalcul de mise en page à chaque carte.
    const hauteurs = enfants.map((e) => e.getBoundingClientRect().height);
    enfants.forEach((enfant, i) => {
      const rangees = Math.ceil((hauteurs[i] + espace) / (unite + espace));
      enfant.style.gridRowEnd = `span ${rangees}`;
    });
  }, []);

  // Volontairement sans tableau de dépendances : à chaque rendu, donc à chaque
  // fois qu'une carte a pu changer de contenu. `useLayoutEffect` place le
  // calcul avant que le navigateur ne peigne, ce qui évite de voir les cartes
  // sauter.
  useLayoutEffect(recalculer);

  useEffect(() => {
    const grille = ref.current;
    if (!grille) return;

    /*
     * Report par `setTimeout` plutôt que `requestAnimationFrame`.
     *
     * Les deux laissent le navigateur finir son rendu avant qu'on remesure,
     * mais un onglet en arrière-plan suspend `requestAnimationFrame` : le
     * recalcul n'y repassait jamais, et les cartes gardaient la taille qu'elles
     * avaient au moment où l'onglet a été masqué.
     */
    const bientot = () => setTimeout(recalculer, 0);

    // Le chargement des polices modifie les hauteurs sans provoquer de rendu.
    void document.fonts?.ready.then(recalculer);

    /*
     * Trois déclencheurs, parce qu'aucun ne couvre tout :
     *
     * - le rendu React (useLayoutEffect ci-dessus) attrape les changements de
     *   données, mais rate ceux d'un état local à une carte : déplier « Sport »
     *   ne fait pas rendre l'accueil ;
     * - le clic attrape justement ces dépliages, qui sont tous déclenchés par
     *   un clic dans la grille ;
     * - ResizeObserver attrape le reste (contenu asynchrone, images).
     */
    grille.addEventListener("click", bientot);
    // Différé comme les autres : pendant l'événement `resize`, la nouvelle
    // media query n'est pas encore reflétée, et on recalculait donc avec le
    // nombre de colonnes de l'ancien format.
    window.addEventListener("resize", bientot);

    const tailles = new ResizeObserver(bientot);
    for (const enfant of Array.from(grille.children)) tailles.observe(enfant);

    return () => {
      grille.removeEventListener("click", bientot);
      window.removeEventListener("resize", bientot);
      tailles.disconnect();
    };
  }, [recalculer]);

  return ref;
}
