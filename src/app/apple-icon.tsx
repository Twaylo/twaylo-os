import { ImageResponse } from "next/og";

/**
 * L'icône que pose iOS sur l'écran d'accueil quand Twaylo ajoute l'OS
 * depuis Safari (« Sur l'écran d'accueil »). 180 px, le format que réclame
 * Apple pour les écrans Retina récents.
 *
 * Dessinée en code plutôt que livrée en fichier : pas de police à charger,
 * pas d'image binaire à versionner, et le dégradé reste celui de l'OS — si la
 * signature change, l'icône suit.
 *
 * iOS n'accepte pas la transparence sur ces icônes (il compose sur du noir) et
 * découpe lui-même les coins arrondis : le fond est donc plein bord à bord, et
 * le « T » tient dans les 70 % centraux pour survivre au masque.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<Marque taille={180} />, { ...size });
}

/** Le monogramme : deux barres sombres sur le dégradé signature. */
export function Marque({ taille }: { taille: number }) {
  const u = taille / 180; // tout est exprimé en unités de l'icône 180
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(140deg, #ff3d8b, #ffc63d 38%, #3ddc84 68%, #22d3ee)",
      }}
    >
      {/* La barre du haut du T */}
      <div
        style={{
          width: 104 * u,
          height: 25 * u,
          background: "#07121d",
          borderRadius: 7 * u,
        }}
      />
      {/* Le pied du T, collé sous la barre */}
      <div
        style={{
          width: 27 * u,
          height: 62 * u,
          background: "#07121d",
          borderRadius: 7 * u,
        }}
      />
    </div>
  );
}
