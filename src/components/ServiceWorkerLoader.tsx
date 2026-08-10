"use client";

import { useEffect } from "react";

/**
 * Branche le service worker, celui qui fait démarrer l'OS sans réseau.
 *
 * L'adresse porte la version : un fichier statique ne change jamais d'un
 * déploiement à l'autre, donc le navigateur n'aurait aucune raison d'aller
 * rechercher le nouveau. En faisant varier l'adresse, chaque déploiement
 * installe le sien et jette les caches du précédent.
 */
export function ServiceWorkerLoader() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${version}`).catch((err) => {
      // Jamais de catch vide : si l'installation échoue, l'OS marche encore,
      // simplement il redevient un site qui a besoin du réseau.
      console.error("[sw] installation impossible :", err);
    });
  }, []);

  return null;
}
