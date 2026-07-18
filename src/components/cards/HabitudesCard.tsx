"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import type { Habit } from "@/lib/types";

/**
 * HABITUDES — reprend la structure de Miles : groupées par catégorie, avec
 * des compteurs de séances plutôt que de simples cases.
 *
 * « Sport 4/5 » dit quelque chose que « Sport ✓ » ne dit pas : il reste une
 * séance. Un clic incrémente, un clic sur une habitude complète la remet à
 * zéro — pas de bouton moins qui alourdirait la carte.
 */

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function estFaite(h: Habit): boolean {
  return h.cible ? h.fait >= h.cible : h.fait > 0;
}

function LigneHabitude({
  habit,
  onClick,
}: {
  habit: Habit;
  onClick: () => void;
}) {
  const faite = estFaite(habit);
  const pct = habit.cible ? Math.min(100, (habit.fait / habit.cible) * 100) : faite ? 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={faite}
      className="relative w-full cursor-pointer overflow-hidden rounded-[10px] px-[10px] py-[7px] text-left transition-all hover:brightness-125"
      style={{
        background: faite ? "rgba(176,107,255,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${faite ? "rgba(176,107,255,0.30)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      {/* Remplissage proportionnel : la progression se lit sans chiffre. */}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300"
        style={{ width: `${pct}%`, background: "rgba(176,107,255,0.09)" }}
      />
      <span className="relative flex items-center gap-2">
        <span
          className="flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[5px] text-[9px] font-black text-[#07121d]"
          style={{
            background: faite ? "var(--color-vio)" : "transparent",
            border: `2px solid ${faite ? "var(--color-vio)" : "rgba(255,255,255,0.22)"}`,
          }}
        >
          {faite ? "✓" : ""}
        </span>
        <span
          className="flex-1 truncate text-[12px] font-bold"
          style={{ color: faite ? "rgba(255,255,255,0.55)" : "var(--color-fg)" }}
        >
          {habit.name}
        </span>
        {habit.cible && (
          <span
            className="flex-none font-mono text-[10.5px] font-extrabold"
            style={{ color: faite ? "var(--color-vio-soft)" : "rgba(255,255,255,0.4)" }}
          >
            {habit.fait}/{habit.cible}
          </span>
        )}
      </span>
    </button>
  );
}

export function HabitudesCard() {
  const { habits, bumpHabit } = useOs();

  // Le score du jour compte les habitudes atteintes, pas les clics.
  const faites = habits.filter(estFaite).length;
  const pct = habits.length ? Math.round((faites / habits.length) * 100) : 0;

  // Regroupe en préservant l'ordre de déclaration des catégories.
  const categories: { nom: string; items: { h: Habit; i: number }[] }[] = [];
  habits.forEach((h, i) => {
    const existante = categories.find((c) => c.nom === h.categorie);
    if (existante) existante.items.push({ h, i });
    else categories.push({ nom: h.categorie, items: [{ h, i }] });
  });

  return (
    <Panel accent="var(--color-vio)" className="col-span-1">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
            HABITUDES
          </Eyebrow>
          <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
            SCORE DU JOUR · RAZ À MINUIT
          </div>
        </div>

        <div className="relative h-[46px] w-[46px] flex-none">
          <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
            <circle cx="23" cy="23" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="5" />
            <circle
              cx="23"
              cy="23"
              r={RADIUS}
              fill="none"
              stroke="var(--color-vio)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)}
              transform="rotate(-90 23 23)"
              style={{ transition: "stroke-dashoffset .3s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="font-mono text-[11px] font-black">{faites}/{habits.length}</span>
            <span className="mt-[1px] font-mono text-[7.5px] text-white/40">{pct}%</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-[9px]">
        {categories.map((cat) => {
          const atteintes = cat.items.filter(({ h }) => estFaite(h)).length;
          return (
            <div key={cat.nom}>
              <div className="mb-[4px] flex items-center justify-between">
                <span className="text-[8.5px] font-black tracking-[0.12em] text-white/30">
                  {cat.nom.toUpperCase()}
                </span>
                <span className="font-mono text-[9px] font-bold text-white/25">
                  {atteintes}/{cat.items.length}
                </span>
              </div>
              <div className="flex flex-col gap-[4px]">
                {cat.items.map(({ h, i }) => (
                  <LigneHabitude key={h.name} habit={h} onClick={() => bumpHabit(i)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
