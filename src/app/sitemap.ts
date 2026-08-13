import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { estHoteOS } from "@/lib/hotes";
import { PAGES_PUBLIQUES, SITE } from "@/lib/site";

/**
 * Le plan du site, différent selon l'adresse (voir `lib/hotes`).
 *
 * Sur l'adresse des Tway'tools : la bibliothèque et l'outil. Sur celle de
 * l'OS : ses trois pages ouvertes, rien d'autre. Un plan unique servi aux
 * deux donnerait aux moteurs la liste des chemins de l'OS depuis l'adresse
 * publique — l'inverse de ce qu'on cherche.
 *
 * Pas de date de modification. `lastModified: new Date()` — le réflexe —
 * ferait dire au plan que tout a changé à chaque déploiement, y compris les
 * pages intactes : un moteur cesse vite d'y croire, et l'information devient
 * du bruit. Mieux vaut ne rien affirmer que d'affirmer faux.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hote = (await headers()).get("host");

  if (!estHoteOS(hote)) {
    const base = `https://${hote}`;
    return [
      { url: `${base}/`, changeFrequency: "monthly" as const, priority: 1 },
      { url: `${base}/piraterie`, changeFrequency: "monthly" as const, priority: 0.9 },
    ];
  }

  return PAGES_PUBLIQUES.map((chemin) => ({
    url: `${SITE}${chemin}`,
    changeFrequency: "monthly" as const,
    priority: chemin === "/bienvenue" ? 1 : 0.6,
  }));
}
