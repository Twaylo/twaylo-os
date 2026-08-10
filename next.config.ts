import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * `node-ical` doit rester tel quel, hors du bundle.
   *
   * Transpilé par Turbopack, il partait en « e.BigInt is not a function » à
   * l'exécution : la bibliothèque manipule des globales Node d'une manière que
   * le bundler ne préserve pas. Déclarée externe, elle est chargée par Node
   * directement depuis node_modules.
   */
  serverExternalPackages: ["node-ical"],

  /*
   * La version, gravée dans la page au moment de la construction.
   *
   * Sans elle, impossible de trancher la question qui bloque tout dépannage :
   * « est-ce que tu as bien la dernière version ? » Un téléphone garde parfois
   * l'ancienne en mémoire, et on cherche alors un défaut déjà corrigé. Elle
   * s'affiche dans le panneau du compte : une ligne à lire, et on sait.
   *
   * `VERCEL_GIT_COMMIT_SHA` n'existe qu'à la construction sur Vercel ; en
   * local, la mention « local » évite de faire croire à une vraie version.
   */
  env: {
    NEXT_PUBLIC_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    NEXT_PUBLIC_VERSION_DATE: new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date()),
  },

  /*
   * En-têtes de sécurité. Rien ici ne corrige une faille présente — je n'ai
   * trouvé aucune injection HTML dans le projet — c'est du durcissement : un
   * filet si une dépendance était un jour compromise, et de quoi empêcher
   * qu'un dashboard plein de boutons de suppression soit affiché dans une
   * iframe pilotée par un tiers.
   */
  /*
   * La carte des attaques de pirates est un site statique complet, posé dans
   * `public/piraterie/`. Cette réécriture lui donne une adresse propre :
   * « /piraterie » plutôt que « /piraterie/index.html » — ça part dans la
   * description d'une vidéo, ça doit se lire.
   *
   * Les réécritures rendues sous forme de tableau sont examinées APRÈS les
   * fichiers : rien de ce qui existe déjà n'est détourné, seule l'adresse
   * sans fichier correspondant tombe ici.
   */
  async rewrites() {
    return [{ source: "/piraterie", destination: "/piraterie/index.html" }];
  },

  async headers() {
    return [
      {
        /*
         * Le dossier `public` est servi par défaut en `max-age=0` : chaque
         * visite retéléchargerait MapLibre, le fond de carte et les données —
         * près d'un mégaoctet. Sur un lien posé en commentaire épinglé d'une
         * vidéo, c'est le pire moment pour ne pas savoir garder en cache.
         *
         * Dix minutes chez le visiteur, un jour sur le CDN, et une semaine de
         * tolérance pendant laquelle une version périmée est servie
         * immédiatement puis rafraîchie en fond. Une mise à jour des données
         * se propage donc en une journée au plus, sans jamais faire attendre
         * personne.
         */
        source: "/piraterie/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=600, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        /*
         * Le service worker ne doit jamais être servi depuis le cache HTTP :
         * c'est lui qui décide de tout le reste, une version périmée gèlerait
         * l'application sur un ancien déploiement.
         */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next injecte du script et du CSS en ligne : 'unsafe-inline'
              // est ici une contrainte du framework, pas un choix.
              "script-src 'self' 'unsafe-inline'",
              // MapLibre lance un worker pour découper ses données. Il est
              // servi depuis notre domaine — pas un blob — donc 'self' suffit.
              // Écrit explicitement plutôt que laissé à la chaîne de repli de
              // la spécification, que les navigateurs n'appliquent pas tous
              // de la même façon.
              "worker-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
