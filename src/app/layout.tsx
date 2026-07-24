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
};

export const viewport: Viewport = {
  themeColor: "#07121d",
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
