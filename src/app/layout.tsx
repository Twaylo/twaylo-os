import type { Metadata, Viewport } from "next";

import { SITE } from "@/lib/site";
import { Nunito, JetBrains_Mono } from "next/font/google";
import { EcranLancement } from "@/components/EcranLancement";
import { FinLancement } from "@/components/FinLancement";
import { ImagesLancementIOS } from "@/components/ImagesLancementIOS";
import { ServiceWorkerLoader } from "@/components/ServiceWorkerLoader";
import "./globals.css";

/*
 * Les graisses sont énumérées, et c'est le bon choix — mesuré, pas supposé.
 *
 * J'ai essayé les versions variables (une seule ressource couvrant tout l'axe
 * des graisses au lieu de cinq fichiers statiques) en pensant alléger le
 * chargement. Chargement à froid mesuré : 68,8 Ko de polices avant, 77,8 Ko
 * après. La variable coûte PLUS ici, parce que l'interface n'utilise que cinq
 * graisses discrètes du sous-ensemble latin, là où l'axe continu embarque
 * tout. Et `display: swap` — l'autre motif de la tentative — est déjà le
 * défaut de next/font. La note reste pour qu'on ne refasse pas l'essai.
 */
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
  /*
   * L'adresse de base, sans laquelle rien de ce qui suit ne fonctionne.
   *
   * Les images de partage et les URL canoniques doivent être ABSOLUES : sans
   * `metadataBase`, Next émet des chemins relatifs, et une image relative est
   * simplement ignorée par les réseaux sociaux — le lien partagé redevient une
   * ligne de texte gris.
   */
  metadataBase: new URL(SITE),
  title: "Twaylo OS — ton système d'exploitation personnel",
  description:
    "Un seul endroit qui tient ta journée, tes objectifs et ta progression. Construit autour de ta vie en deux minutes, gratuit.",
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
      <body className="min-h-full">
        {/*
         * Les balises d'image de lancement d'iOS. React 19 les remonte
         * lui-même dans l'en-tête du document ; les métadonnées de Next ne
         * savent produire que des `meta`, pas des `link` à requête média.
         */}
        <ImagesLancementIOS />

        {/*
         * L'écran de lancement AVANT le contenu, et rendu côté serveur : il
         * fait partie du HTML livré, donc il est peint avant qu'une seule
         * ligne de JavaScript n'ait tourné. C'est tout son objet — couvrir
         * précisément le moment où React n'existe pas encore.
         */}
        <EcranLancement />
        {children}
        <FinLancement />
        <ServiceWorkerLoader />
      </body>
    </html>
  );
}
