import type { MetadataRoute } from "next";

import { PAGES_PUBLIQUES, SITE } from "@/lib/site";

/**
 * Le plan du site : les trois pages ouvertes, rien d'autre.
 *
 * Pas de date de modification. `lastModified: new Date()` — le réflexe — ferait
 * dire au plan que tout a changé à chaque déploiement, y compris les pages
 * intactes : un moteur cesse vite d'y croire, et l'information devient du bruit.
 * Mieux vaut ne rien affirmer que d'affirmer faux.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES_PUBLIQUES.map((chemin) => ({
    url: `${SITE}${chemin}`,
    changeFrequency: "monthly" as const,
    priority: chemin === "/bienvenue" ? 1 : 0.6,
  }));
}
