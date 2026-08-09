import { ImageResponse } from "next/og";

import { Marque } from "./apple-icon";

/**
 * La grande icône : celle du manifeste (installation Android / bureau) et de
 * l'onglet quand le navigateur préfère un PNG au favicon.ico.
 *
 * Même monogramme que l'icône Apple — une seule source de vérité pour la
 * marque, exportée depuis apple-icon.tsx.
 */

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Marque taille={512} />, { ...size });
}
