/**
 * L'adresse publique du site.
 *
 * Elle sert aux métadonnées de partage, au plan du site et au fichier
 * `robots.txt` — trois endroits qui exigent une URL ABSOLUE. Un chemin relatif
 * y produit une image de partage cassée sur les réseaux et un plan du site que
 * les moteurs refusent.
 *
 * Réglable par variable d'environnement : une préproduction Vercel a sa propre
 * adresse, et lui faire annoncer celle de la production ferait indexer deux
 * copies du même site.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://twaylo-os.vercel.app";

/** Les pages ouvertes à tous — celles qu'un moteur a le droit de lire. */
export const PAGES_PUBLIQUES = ["/bienvenue", "/demarrer", "/login"] as const;
