"use client";

import { useState } from "react";
import { useOs } from "@/lib/os-context";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import type { Habit } from "@/lib/types";

/**
 * HABITUDES — cochables, dépliables, et modifiables.
 *
 * La version précédente demandait de cliquer cinq fois sur « Sport » pour
 * afficher « 5/5 ». Ça ne disait rien : cinq quoi ? Ici un clic déplie les
 * variantes réellement pratiquées — Gym, Étirements, Vélo — et on coche ce
 * qu'on a fait. Le relevé devient exploitable au lieu d'être un compteur.
 *
 * Les habitudes elles-mêmes s'ajoutent, se renomment et se suppriment : une
 * liste imposée par le code ne survit pas au premier changement de routine.
 */

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ligne({
  habit,
  faites,
  deplie,
  onDeplier,
  onBasculer,
  onCocherOption,
}: {
  habit: Habit;
  faites: string[];
  deplie: boolean;
  onDeplier: () => void;
  onBasculer: () => void;
  onCocherOption: (option: string) => void;
}) {
  const faite = faites.length > 0;
  const aOptions = habit.options.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={aOptions ? onDeplier : onBasculer}
        aria-pressed={faite}
        aria-expanded={aOptions ? deplie : undefined}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-[10px] py-[7px] text-left transition-all hover:brightness-125"
        style={{
          background: faite ? "rgba(176,107,255,0.10)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${faite ? "rgba(176,107,255,0.30)" : "rgba(255,255,255,0.07)"}`,
        }}
      >
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
          style={{ color: faite ? "rgba(255,255,255,0.6)" : "var(--color-fg)" }}
        >
          {habit.nom}
        </span>

        {/* Ce qui a été fait, plutôt qu'un compteur muet. */}
        {faite && aOptions && (
          <span className="flex-none truncate text-[9.5px] font-bold text-[color:var(--color-vio-soft)]">
            {faites.join(" · ")}
          </span>
        )}

        {aOptions && (
          <span
            className="flex-none text-[8px] text-white/30 transition-transform"
            style={{ transform: deplie ? "rotate(90deg)" : "none" }}
          >
            ▶
          </span>
        )}
      </button>

      {deplie && aOptions && (
        <div className="mt-1 flex flex-wrap gap-[4px] pl-[26px]">
          {habit.options.map((o) => {
            const coche = faites.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onCocherOption(o)}
                aria-pressed={coche}
                className="cursor-pointer rounded-[7px] px-[8px] py-[4px] text-[10.5px] font-extrabold transition-all hover:brightness-125"
                style={{
                  color: coche ? "#07121d" : "rgba(255,255,255,0.55)",
                  background: coche ? "var(--color-vio)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${coche ? "var(--color-vio)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HabitudesCard() {
  const {
    habits,
    faitesDuJour,
    cocherOption,
    basculerHabitude,
    ajouterHabitude,
    supprimerHabitude,
  } = useOs();

  const [deplie, setDeplie] = useState<string | null>(null);
  const [reglage, setReglage] = useState(false);
  const [nouvelle, setNouvelle] = useState("");

  const faites = habits.filter((h) => (faitesDuJour[h.id] ?? []).length > 0).length;
  const pct = habits.length ? Math.round((faites / habits.length) * 100) : 0;

  // Regroupe en préservant l'ordre de déclaration des catégories.
  const categories: { nom: string; items: Habit[] }[] = [];
  for (const h of habits) {
    const existante = categories.find((c) => c.nom === h.categorie);
    if (existante) existante.items.push(h);
    else categories.push({ nom: h.categorie, items: [h] });
  }

  return (
    <Panel accent="var(--color-vio)" className="col-span-1">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
            HABITUDES
          </Eyebrow>
          <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
            REPART À ZÉRO À MINUIT
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReglage((v) => !v)}
            title="Modifier mes habitudes"
            aria-label="Modifier mes habitudes"
            className="flex-none cursor-pointer rounded-[7px] px-[7px] py-[4px] text-[10px] font-black transition-all hover:brightness-125"
            style={{
              color: reglage ? "#07121d" : "rgba(255,255,255,0.4)",
              background: reglage ? "var(--color-vio)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            ⚙
          </button>

          <div className="relative h-[44px] w-[44px] flex-none">
            <svg width="44" height="44" viewBox="0 0 46 46" aria-hidden>
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
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-black">
              {faites}/{habits.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-[9px]">
        {categories.map((cat) => (
          <div key={cat.nom}>
            <div className="mb-[4px] text-[8.5px] font-black tracking-[0.12em] text-white/30">
              {cat.nom.toUpperCase()}
            </div>
            <div className="flex flex-col gap-[4px]">
              {cat.items.map((h) => (
                <div key={h.id} className="group relative">
                  <Ligne
                    habit={h}
                    faites={faitesDuJour[h.id] ?? []}
                    deplie={deplie === h.id}
                    onDeplier={() => setDeplie(deplie === h.id ? null : h.id)}
                    onBasculer={() => basculerHabitude(h.id)}
                    onCocherOption={(o) => cocherOption(h.id, o)}
                  />
                  {reglage && (
                    <button
                      type="button"
                      onClick={() => supprimerHabitude(h.id)}
                      title={`Supprimer ${h.nom}`}
                      aria-label={`Supprimer ${h.nom}`}
                      className="absolute right-[8px] top-[7px] cursor-pointer rounded-[5px] px-[5px] text-[11px] font-black"
                      style={{
                        color: "var(--color-mag-soft)",
                        background: "rgba(255,61,139,0.14)",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {reglage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ajouterHabitude(nouvelle);
            setNouvelle("");
          }}
          className="mt-[9px]"
        >
          <input
            value={nouvelle}
            onChange={(e) => setNouvelle(e.target.value)}
            placeholder="Nouvelle habitude · Catégorie · Option1, Option2"
            aria-label="Ajouter une habitude"
            className="w-full rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px dashed rgba(255,255,255,0.14)",
            }}
          />
          <div className="mt-[5px] text-[9px] leading-[1.35] text-white/25">
            Exemple : <span className="text-white/40">Course · Corps · 5 km, 10 km</span>
            {" — "}la catégorie et les options sont facultatives.
          </div>
        </form>
      )}
    </Panel>
  );
}
