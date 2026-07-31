"use client";

import { useEffect, useState } from "react";

/**
 * L'heure courante HH:MM, rafraîchie toutes les 30 s — le même pas que
 * l'horloge du rail. Vide au premier rendu : l'heure du serveur n'est pas
 * celle du navigateur, la poser d'emblée casserait l'hydratation.
 *
 * Partagée entre l'onglet Journée type et sa carte d'accueil : les deux
 * doivent désigner le même « en ce moment ».
 */
export function useHeure(): string {
  const [heure, setHeure] = useState("");
  useEffect(() => {
    const lire = () =>
      setHeure(
        new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      );
    lire();
    const id = setInterval(lire, 30_000);
    return () => clearInterval(id);
  }, []);
  return heure;
}
