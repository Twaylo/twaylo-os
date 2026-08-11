import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

/**
 * Ce qu'un moteur a le droit de lire.
 *
 * Le principe est inversé par rapport à l'habitude : on INTERDIT tout, puis on
 * autorise les trois pages publiques. Le reste du site est un tableau de bord
 * personnel derrière un mot de passe — un robot n'y trouverait que la page de
 * connexion, mais l'exclure explicitement évite de voir apparaître
 * « twaylo-os.vercel.app/journal » dans des résultats de recherche.
 *
 * `/api/` est refusé séparément et en premier : ces routes répondent 401, et
 * les faire visiter en boucle réveille des fonctions serverless pour rien.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/bienvenue", "/demarrer", "/login"],
        disallow: ["/", "/api/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
