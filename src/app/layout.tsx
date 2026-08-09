import type { Metadata, Viewport } from "next";
import { Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Twaylo OS",
  description: "Le système d'exploitation personnel de Twaylo.",
  applicationName: "Twaylo OS",
  /*
   * Les trois lignes qui font croire à iOS que c'est une application.
   *
   * `capable` retire Safari autour (plus de barre d'adresse, plus de boutons
   * de navigation) une fois l'OS posé sur l'écran d'accueil. `title` fixe le
   * nom sous l'icône. `black-translucent` laisse le contenu passer sous
   * l'heure et la batterie — d'où le rembourrage `safe-area` dans le Shell,
   * sinon le rail du haut se cacherait derrière l'encoche.
   */
  appleWebApp: {
    capable: true,
    title: "Twaylo OS",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#07121d",
  /*
   * `cover` : la page occupe l'écran jusque sous l'encoche, à nous de gérer
   * les marges de sécurité. Sans ça, iOS laisse deux bandes noires en mode
   * application.
   */
  viewportFit: "cover",
  /*
   * Zoom bloqué à 1. Ce n'est pas du confort d'esthète : les champs de l'OS
   * sont en 11-13 px, et Safari zoome d'autorité dès qu'on touche un champ
   * sous 16 px — l'écran partait de travers à chaque saisie et ne revenait
   * jamais tout seul.
   */
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${nunito.variable} ${jetbrains.variable} h-full antialiased`}
      /*
       * Le fond en style en ligne, et pas seulement dans la feuille de style.
       *
       * Il n'était posé que sur `body` : le temps que le navigateur récupère et
       * lise le CSS, il peignait sa toile par défaut — un éclair blanc avant
       * l'OS. Écrit ici, il fait partie du document lui-même et s'applique dès
       * la première ligne, sans attendre aucun fichier.
       */
      style={{ background: "#07121d" }}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
