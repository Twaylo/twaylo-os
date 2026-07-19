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
   * En-têtes de sécurité. Rien ici ne corrige une faille présente — je n'ai
   * trouvé aucune injection HTML dans le projet — c'est du durcissement : un
   * filet si une dépendance était un jour compromise, et de quoi empêcher
   * qu'un dashboard plein de boutons de suppression soit affiché dans une
   * iframe pilotée par un tiers.
   */
  async headers() {
    return [
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
