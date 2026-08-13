import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { estHoteOS } from "@/lib/hotes";
import { SITE } from "@/lib/site";

/**
 * Ce qu'un moteur a le droit de lire — et la réponse dépend de l'adresse.
 *
 * Un seul déploiement sert deux sites (voir `lib/hotes`). Un `robots.txt`
 * écrit une fois pour toutes annoncerait les chemins de l'OS depuis l'adresse
 * publique des Tway'tools : un moteur qui lit « allow: /login » vient d'y
 * apprendre qu'il existe une page de connexion, et l'adresse où la trouver.
 * C'est précisément ce qu'on ne veut pas.
 *
 * · Sur l'adresse des Tway'tools : la bibliothèque et l'outil, ouverts ; les
 *   routes d'API, refusées. Rien de l'OS n'y est même nommé.
 * · Sur l'adresse de l'OS : le principe est inversé par rapport à l'habitude —
 *   on INTERDIT tout, puis on autorise les trois pages publiques. Le reste est
 *   un tableau de bord personnel derrière un mot de passe ; un robot n'y
 *   trouverait que l'écran de connexion, mais l'exclure explicitement évite de
 *   voir apparaître « twaylo-os.vercel.app/journal » dans des résultats.
 *
 * `/api/` est refusé en premier dans les deux cas : ces routes répondent 401,
 * et les faire visiter en boucle réveille des fonctions serverless pour rien.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hote = (await headers()).get("host");

  if (!estHoteOS(hote)) {
    const base = `https://${hote}`;
    return {
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
      sitemap: `${base}/sitemap.xml`,
      host: base,
    };
  }

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
