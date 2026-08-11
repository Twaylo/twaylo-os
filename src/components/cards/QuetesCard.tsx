"use client";

import { Panel } from "@/components/Panel";
import { Eyebrow } from "@/components/ui";
import { useOs } from "@/lib/os-context";
import { useProgression } from "@/lib/progression-context";

/**
 * Les quêtes du jour.
 *
 * Trois objectifs qui changent chaque matin. La différence avec les bonus
 * permanents tient en un mot : la surprise. « Journée type pliée » est la même
 * tous les jours et cesse d'être lue ; « boucler 7 tâches », tiré ce matin-là,
 * se regarde.
 *
 * La barre d'avancement est le cœur de la carte. Un objectif binaire (fait /
 * pas fait) ne donne aucune envie de s'y remettre le soir ; « 5 / 7 » si.
 */
export function QuetesCard() {
  const { demoMode } = useOs();
  const { quetes, gels, serie } = useProgression();

  if (demoMode) {
    return (
      <Panel accent="var(--color-cya)" size="sm">
        <Eyebrow color="var(--color-cya-soft)" dot="var(--color-cya)">
          QUÊTES DU JOUR
        </Eyebrow>
        <div className="py-6 text-center text-[12px] font-bold text-white/30">
          Masquées en mode démo.
        </div>
      </Panel>
    );
  }

  const faites = quetes.filter((q) => q.fait).length;
  const gain = quetes.reduce((n, q) => n + (q.fait ? 0 : q.quete.xp), 0);

  return (
    <Panel accent="var(--color-cya)" size="sm">
      <div className="mb-[9px] flex items-center justify-between gap-2">
        <Eyebrow color="var(--color-cya-soft)" dot="var(--color-cya)">
          QUÊTES DU JOUR
        </Eyebrow>
        <span className="flex flex-none items-center gap-[6px]">
          {/*
            Les gels ne sont visibles QUE s'il y en a. Un « 🧊 0 » permanent
            n'apprend rien et occupe la seule ligne qui doit rester lisible.
          */}
          {gels > 0 && (
            <span
              className="rounded-full px-[7px] py-[3px] font-mono text-[10px] font-black"
              style={{ color: "#8fd7ff", background: "rgba(143,215,255,0.12)" }}
              title={`${gels} gel${gels > 1 ? "s" : ""} de série en réserve : un jour manqué ne cassera pas ta série.`}
            >
              🧊 {gels}
            </span>
          )}
          <span
            className="font-mono text-[11px] font-black"
            style={{ color: "var(--color-cya-soft)" }}
          >
            {faites}/{quetes.length}
          </span>
        </span>
      </div>

      {quetes.length === 0 ? (
        <div className="py-4 text-center text-[11.5px] font-bold text-white/30">
          Tirage du jour en cours…
        </div>
      ) : (
        <div className="flex flex-col gap-[7px]">
          {quetes.map(({ quete, valeur, fait }) => (
            <div
              key={quete.id}
              className="rounded-[10px] px-[9px] py-[7px]"
              style={{
                background: fait ? "rgba(61,220,132,0.09)" : "rgba(255,255,255,0.035)",
                border: `1px solid ${fait ? "rgba(61,220,132,0.3)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div className="flex items-baseline gap-[7px]">
                <span className="flex-none text-[12px]">{quete.emoji}</span>
                <span
                  className="min-w-0 flex-1 text-[11.5px] font-bold leading-[1.3]"
                  style={{
                    color: fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
                    textDecoration: fait ? "line-through" : "none",
                  }}
                >
                  {quete.titre}
                </span>
                <span
                  className="flex-none font-mono text-[10.5px] font-black"
                  style={{ color: fait ? "var(--color-ver)" : "rgba(255,255,255,0.35)" }}
                >
                  {fait ? "✓" : `+${quete.xp}`}
                </span>
              </div>

              {!fait && quete.cible > 1 && (
                <div className="mt-[5px] flex items-center gap-[7px]">
                  <div
                    className="h-[4px] flex-1 overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.round((valeur / quete.cible) * 100)}%`,
                        background: "var(--color-cya)",
                      }}
                    />
                  </div>
                  <span className="flex-none font-mono text-[9.5px] font-bold text-white/35">
                    {valeur}/{quete.cible}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-[9px] text-[10.5px] font-semibold leading-[1.35] text-white/35">
        {faites === quetes.length && quetes.length > 0 ? (
          <>Les trois sont tombées. Nouveau tirage demain matin.</>
        ) : (
          <>
            Encore <span className="font-mono text-white/60">+{gain} XP</span> à prendre
            avant minuit.
            {serie > 0 && gels === 0 && serie < 7 && (
              <> Au 7ᵉ jour de série, tu gagnes un gel.</>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
