import { ImageResponse } from "next/og";

import { Marque } from "../apple-icon";

/**
 * L'image de lancement d'iOS, dessinée à la taille demandée.
 *
 * C'est ce qu'affiche le SYSTÈME entre le doigt sur l'icône et l'apparition de
 * la page — avant même que le navigateur n'existe. Sans elle, iOS peint du
 * blanc : un éclair clair au milieu d'une application sombre, le détail qui
 * fait « site web » plutôt qu'« application ».
 *
 * Une image PAR TAILLE d'iPhone, parce qu'iOS exige une correspondance exacte
 * avec la résolution de l'écran : une image approchante n'est pas redimensionnée,
 * elle est ignorée. D'où la génération à la demande plutôt que dix fichiers
 * versionnés — et le monogramme est celui de l'icône, une seule source pour la
 * marque.
 */

export const contentType = "image/png";

/*
 * Les dimensions sont bornées, et ce n'est pas de la paranoïa.
 *
 * La route est publique (iOS la réclame sans cookie, comme le manifeste) et
 * fabrique une image à partir de deux nombres pris dans l'adresse. Sans borne,
 * `?l=20000&h=20000` ferait fabriquer 400 millions de pixels par une fonction
 * serverless, autant de fois qu'on le demande.
 */
const MIN = 100;
const MAX_LARGEUR = 1500;
const MAX_HAUTEUR = 3000;

function borne(valeur: string | null, max: number): number | null {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < MIN || n > max) return null;
  return n;
}

export function GET(requete: Request) {
  const { searchParams } = new URL(requete.url);
  const largeur = borne(searchParams.get("l"), MAX_LARGEUR);
  const hauteur = borne(searchParams.get("h"), MAX_HAUTEUR);

  if (largeur === null || hauteur === null) {
    return new Response("dimensions invalides", { status: 400 });
  }

  // Le monogramme occupe un quart de la plus petite dimension : assez présent
  // pour être vu, assez sobre pour ne pas paraître étiré sur un grand écran.
  const cote = Math.round(Math.min(largeur, hauteur) * 0.26);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07121d",
        }}
      >
        {/*
          Les dimensions sont posées ICI, en dur.

          `Marque` se dessine en `width: 100%` : sans cadre de taille fixe, le
          conteneur flexible l'étirait sur toute la largeur de l'écran — un
          monogramme carré devenait une bande de dégradé.
        */}
        <div
          style={{
            display: "flex",
            width: cote,
            height: cote,
            borderRadius: cote * 0.23,
            overflow: "hidden",
          }}
        >
          <Marque taille={cote} />
        </div>
      </div>
    ),
    { width: largeur, height: hauteur },
  );
}
