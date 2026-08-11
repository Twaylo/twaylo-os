import { ImageResponse } from "next/og";

import { Marque } from "./apple-icon";

/**
 * L'image de partage — ce qu'on voit quand le lien est collé quelque part.
 *
 * Sans elle, un lien partagé sur Discord, WhatsApp ou X apparaît en texte gris
 * sur fond blanc, indistinguable d'un lien de suivi de colis. C'est le premier
 * contact avec le produit dans neuf cas sur dix, et c'est aussi le seul écran
 * qu'on ne peut pas corriger après coup — il est mis en cache par les
 * plateformes pour des semaines.
 *
 * Dessinée plutôt que photographiée : une capture d'écran du tableau de bord
 * serait illisible à 300 px de large dans une conversation, et montrerait au
 * passage les données de quelqu'un.
 */

export const alt = "Twaylo OS — ton système d'exploitation personnel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 84px",
          background: "#07121d",
          position: "relative",
        }}
      >
        {/* Les deux halos du fond, comme dans l'OS. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -160,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: "radial-gradient(circle, rgba(255,61,139,0.30), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -260,
            left: -180,
            width: 640,
            height: 640,
            borderRadius: 640,
            background: "radial-gradient(circle, rgba(34,211,238,0.26), transparent 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* Dimensions explicites : `Marque` se dimensionne en 100 %, et sans
              cadre elle s'étirerait sur toute la largeur. */}
          <div
            style={{
              display: "flex",
              width: 76,
              height: 76,
              borderRadius: 23,
              overflow: "hidden",
            }}
          >
            <Marque taille={76} />
          </div>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              color: "#eef4fb",
              letterSpacing: -1.5,
            }}
          >
            twaylo os
          </div>
        </div>

        <div
          style={{
            marginTop: 34,
            fontSize: 74,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: -3,
            color: "#eef4fb",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Ton système d&apos;exploitation</span>
          <span
            style={{
              background: "linear-gradient(100deg, #ff3d8b, #ffc63d 38%, #3ddc84 68%, #22d3ee)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            personnel
          </span>
        </div>

        <div
          style={{
            marginTop: 26,
            fontSize: 27,
            fontWeight: 700,
            color: "rgba(238,244,251,0.55)",
            maxWidth: 780,
            lineHeight: 1.35,
          }}
        >
          Ta journée, tes objectifs et ta progression au même endroit. Construit
          autour de ta vie en deux minutes.
        </div>

        <div style={{ marginTop: 40, display: "flex", gap: 12 }}>
          {/*
            Sans emoji : le moteur de rendu de `next/og` n'embarque aucune
            police d'emoji et les avale silencieusement, ce qui laissait une
            espace en tête de chaque pastille. Vérifié sur l'image produite.
          */}
          {["Journée type", "Séries", "Compétences", "Quêtes"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 800,
                color: "rgba(238,244,251,0.7)",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
                padding: "10px 20px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
