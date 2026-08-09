"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Eclats } from "@/components/ui";
import {
  fermerRecompense,
  lireFile,
  lireFileServeur,
  surRecompenses,
} from "@/lib/recompenses-store";

/**
 * La fenêtre de récompense — le moment où l'OS félicite.
 *
 * Elle ne s'ouvre que sur du rare : un bonus de journée complète, une montée
 * de niveau, un palier de série, un exploit. Jamais sur une simple coche —
 * une fête à chaque geste n'est plus une fête, c'est une interruption.
 *
 * Montée par un portail vers `body` : le rail du haut porte un
 * `backdrop-filter`, et un `position: fixed` posé à l'intérieur d'un élément
 * filtré se cale sur CE parent au lieu de la fenêtre. La fenêtre se serait
 * ouverte de travers, coincée sous l'en-tête.
 */
export function Recompense() {
  const recompenses = useSyncExternalStore(surRecompenses, lireFile, lireFileServeur);
  const courante = recompenses[0] ?? null;

  // Fermeture automatique : la récompense se regarde, elle ne se gère pas.
  useEffect(() => {
    if (!courante) return;
    const t = setTimeout(fermerRecompense, 6000);
    return () => clearTimeout(t);
  }, [courante]);

  useEffect(() => {
    if (!courante) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") fermerRecompense();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [courante]);

  // Rien dans le HTML du serveur : la file y est toujours vide, et `document`
  // n'y existe pas pour le portail.
  if (typeof document === "undefined" || !courante) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-6"
      style={{ background: "rgba(4,10,17,0.72)" }}
      onClick={fermerRecompense}
      role="dialog"
      aria-live="assertive"
      aria-label={courante.titre}
    >
      <div
        key={courante.cle}
        className="recompense-carte relative w-full max-w-[380px] overflow-hidden rounded-[20px] px-[26px] pb-[22px] pt-[28px] text-center"
        style={{
          background: "linear-gradient(180deg, rgba(15,30,46,0.98), rgba(9,19,31,0.98))",
          border: `1px solid ${courante.couleur}66`,
          boxShadow: `0 0 60px -12px ${courante.couleur}, 0 24px 60px -20px rgba(0,0,0,0.9)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px]"
          style={{ background: `${courante.couleur}44` }}
          aria-hidden
        />

        {/* Les confettis partent du centre de l'emoji. */}
        <div className="pointer-events-none absolute left-1/2 top-[64px]" aria-hidden>
          <Eclats nombre={20} portee={130} />
        </div>

        <div className="recompense-emoji relative text-[54px] leading-[1]">
          {courante.emoji}
        </div>

        <div
          className="relative mt-[14px] text-[19px] font-black leading-[1.2] tracking-[-0.01em]"
          style={{ color: courante.couleur, textShadow: `0 0 22px ${courante.couleur}55` }}
        >
          {courante.titre}
        </div>

        <div className="relative mt-[7px] text-[13px] font-semibold leading-[1.45] text-white/60">
          {courante.texte}
        </div>

        {courante.xp !== undefined && (
          <div
            className="relative mx-auto mt-[14px] inline-block rounded-full px-[14px] py-[5px] font-mono text-[14px] font-black"
            style={{ color: "#07121d", background: courante.couleur }}
          >
            +{courante.xp} XP
          </div>
        )}

        <button
          type="button"
          onClick={fermerRecompense}
          className="relative mt-[18px] w-full cursor-pointer rounded-[11px] py-[9px] text-[12.5px] font-extrabold transition-all hover:brightness-125"
          style={{
            color: "rgba(255,255,255,0.75)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Continuer
        </button>
      </div>
    </div>,
    document.body,
  );
}
