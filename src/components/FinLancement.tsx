"use client";

import { useEffect } from "react";

/**
 * Retire l'écran de lancement, dès que l'interface est réellement peinte.
 *
 * Monté dans la mise en page racine et non dans le Shell : l'écran de
 * connexion passe par la même racine, et laissé au seul filet de sécurité il
 * y serait resté six secondes devant un formulaire pourtant prêt.
 *
 * Aucun état React ici, uniquement le DOM. L'écran de lancement n'appartient
 * pas à l'arbre React — il est écrit dans le HTML avant que React n'existe —
 * et le faire piloter par un état forcerait un rendu de plus au pire moment.
 */
export function FinLancement() {
  useEffect(() => {
    const ecran = document.getElementById("ecran-lancement");
    if (!ecran) return;

    /*
     * Deux images d'attente, et c'est délibéré.
     *
     * La première laisse React poser le DOM, la seconde laisse le navigateur
     * le peindre. Retirer l'écran dès le montage découvrirait une fraction de
     * seconde de page encore vide — soit exactement ce qu'il est censé cacher.
     */
    let seconde = 0;
    const premiere = requestAnimationFrame(() => {
      seconde = requestAnimationFrame(() => ecran.classList.add("parti"));
    });

    return () => {
      cancelAnimationFrame(premiere);
      cancelAnimationFrame(seconde);
    };
  }, []);

  return null;
}
