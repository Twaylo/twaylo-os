import type { MetadataRoute } from "next";

/**
 * Le manifeste : ce qui transforme le site en application.
 *
 * `display: standalone` supprime la barre d'adresse une fois l'OS posé sur
 * l'écran d'accueil — plus de Safari autour, ça s'ouvre comme une vraie appli.
 * Android et le bureau lisent tout ce fichier ; iOS n'en lit que `display` et
 * le nom, le reste passe par les balises Apple posées dans layout.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Twaylo OS",
    short_name: "Twaylo",
    description: "Le système d'exploitation personnel de Twaylo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07121d",
    theme_color: "#07121d",
    lang: "fr",
    categories: ["productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
