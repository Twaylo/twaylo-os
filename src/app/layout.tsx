import type { Metadata, Viewport } from "next";

import { SITE } from "@/lib/site";
import { Inter } from "next/font/google";
import { ServiceWorkerLoader } from "@/components/ServiceWorkerLoader";
import "./globals.css";

/**
 * Inter, et une seule police.
 *
 * Il y en avait deux : Nunito pour le texte, JetBrains Mono pour les chiffres.
 * Inter fait les deux — son jeu `tabular-nums` aligne les colonnes de montants
 * aussi bien qu'une chasse fixe, sans la seconde ressource à charger ni le
 * contraste de styles entre une ligne et le chiffre au bout.
 *
 * Les graisses sont énumérées plutôt que variables, et c'est mesuré, pas
 * supposé : l'interface n'utilise que quatre graisses discrètes du
 * sous-ensemble latin, là où l'axe continu d'une police variable embarque tout.
 * `display: swap` est déjà le défaut de next/font.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  /*
   * L'adresse de base, sans laquelle rien de ce qui suit ne fonctionne.
   *
   * Les images de partage et les URL canoniques doivent être ABSOLUES : sans
   * `metadataBase`, Next émet des chemins relatifs, et une image relative est
   * simplement ignorée par les réseaux sociaux — le lien partagé redevient une
   * ligne de texte gris.
   */
  metadataBase: new URL(SITE),
  title: "PROJECT 90 — le cockpit",
  description: "Les 90 jours : la todo, le Kanban, les sponsors et les objectifs.",
  applicationName: "Twaylo OS",
  /*
   * Rien n'est indexé PAR DÉFAUT, et c'est délibéré.
   *
   * Tout le site est un tableau de bord personnel derrière un mot de passe.
   * Les trois pages publiques rouvrent l'indexation chacune de leur côté
   * (`robots: { index: true }` dans leur propre `metadata`) : ouvrir page par
   * page est un geste conscient, l'inverse laisse fuir la première page qu'on
   * oublie de fermer.
   */
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Twaylo OS",
    url: SITE,
    title: "Twaylo OS — ton système d'exploitation personnel",
    description:
      "Ta journée, tes objectifs et ta progression au même endroit. Construit autour de ta vie en deux minutes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Twaylo OS — ton système d'exploitation personnel",
    description:
      "Ta journée, tes objectifs et ta progression au même endroit. Construit autour de ta vie en deux minutes.",
  },
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
    title: "Twaylo OS",
    statusBarStyle: "black-translucent",
  },
  /*
   * La balise « application » que Safari attend, écrite à la main.
   *
   * Vérifié sur le HTML réellement produit : `appleWebApp.capable` n'émet QUE
   * `mobile-web-app-capable`, la balise de Chrome, et ravale au passage toute
   * balise Apple qu'on ajouterait à côté. Or Safari lit
   * `apple-mobile-web-app-capable` : sans elle, l'icône posée sur l'écran
   * d'accueil peut rouvrir un onglet Safari ordinaire, barre d'adresse
   * comprise — exactement ce qu'on cherche à supprimer. On l'écrit donc
   * nous-mêmes, `capable` retiré pour que Next ne s'en mêle plus.
   *
   * Celle de Chrome n'est PAS à écrire ici : Next l'émet de son côté dès que
   * le manifeste est déclaré. L'ajouter la produisait en double.
   */
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
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
      className={`${inter.variable} h-full antialiased`}
      /*
       * Le fond en style en ligne, et pas seulement dans la feuille de style.
       *
       * Il n'était posé que sur `body` : le temps que le navigateur récupère et
       * lise le CSS, il peignait sa toile par défaut — un éclair blanc avant
       * l'OS. Écrit ici, il fait partie du document lui-même et s'applique dès
       * la première ligne, sans attendre aucun fichier.
       */
      style={{ background: "#0b0b0c" }}
    >
      <body className="min-h-full">
        {children}
        <ServiceWorkerLoader />
      </body>
    </html>
  );
}
