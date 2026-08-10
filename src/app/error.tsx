"use client";

import { useEffect } from "react";

/**
 * Le dernier filet — celui qui attrape ce qui échappe à tous les autres.
 *
 * Le filet posé autour de la vue (components/Filet) garde le rail et les
 * onglets vivants quand un onglet tombe. Reste ce qui casse AVANT lui : le
 * contexte central, la lecture initiale, un fournisseur. Là, il n'y a plus
 * d'OS du tout — et sans cette page, Next affiche un écran blanc muet.
 *
 * Sur un téléphone en mode application, un écran blanc veut dire forcer la
 * fermeture sans savoir ce qui s'est passé. Une phrase et un bouton valent
 * infiniment mieux.
 */
export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[os] plantage général :", error);
  }, [error]);

  return (
    <div
      className="cadre-appli flex items-center justify-center px-6"
      style={{ background: "#07121d", color: "#eef3f8" }}
    >
      <div className="w-full max-w-[420px] text-center">
        <div className="text-[34px]">🩹</div>
        <h1 className="mt-[10px] text-[19px] font-black">L&apos;OS a trébuché.</h1>
        <p className="mt-[8px] text-[13px] font-semibold leading-[1.5] text-white/50">
          Rien n&apos;est perdu — tout ce que tu as coché est en base. Relance, et si ça
          recommence, c&apos;est un bug à me signaler.
        </p>
        <div
          className="mt-[14px] overflow-x-auto rounded-[10px] px-[11px] py-[8px] text-left font-mono text-[10.5px] text-white/35"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          {error.message || "Erreur inconnue"}
          {error.digest ? ` · ${error.digest}` : ""}
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-[16px] w-full cursor-pointer rounded-[12px] py-[11px] text-[13.5px] font-extrabold transition-all hover:brightness-110"
          style={{
            color: "#07121d",
            background: "linear-gradient(90deg,#3ddc84,#22d3ee)",
            border: "none",
          }}
        >
          Relancer l&apos;OS
        </button>
      </div>
    </div>
  );
}
