"use client";

import { useEffect, useState } from "react";
import {
  OBJECTIFS_DEFAUT,
  estimerRepas,
  kcalDepuisMacros,
  redistribuerMacros,
  totaux,
} from "@/lib/nutrition";
import { useOs } from "@/lib/os-context";
import type { Repas } from "@/lib/types";
import { Eyebrow, MicButton } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** Barre de macro : gramme actuel sur objectif. */
function Macro({
  label,
  valeur,
  cible,
  couleur,
}: {
  label: string;
  valeur: number;
  cible: number;
  couleur: string;
}) {
  const pct = cible > 0 ? Math.min(100, Math.round((valeur / cible) * 100)) : 0;
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[9.5px] font-extrabold tracking-[0.08em] text-white/45">
          {label}
        </span>
        <span className="font-mono text-[10.5px] font-bold text-white/70">
          {valeur}/{cible}g
        </span>
      </div>
      <div className="bar-track mt-[4px]" style={{ height: 4 }}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: couleur }}
        />
      </div>
    </div>
  );
}

export function NutritionCard() {
  // Les repas vivent dans le contexte : ils participent au cycle
  // chargement depuis la base / synchronisation vers elle.
  const { repas, setRepas } = useOs();
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);


  const t = totaux(repas);
  const obj = OBJECTIFS_DEFAUT;
  const restant = obj.kcal - t.kcal;
  const pctKcal = Math.min(100, Math.round((t.kcal / obj.kcal) * 100));

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    const texte = saisie.trim();
    if (!texte) return;

    setSaisie("");
    setEnCours(true);
    try {
      const est = await estimerRepas(texte);
      setRepas((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          t: new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          n: est.n,
          kcal: est.kcal,
          p: est.p,
          c: est.c,
          f: est.f,
          estimated: true,
        },
      ]);
    } catch (err) {
      console.error("[nutrition] ajout impossible :", err);
    } finally {
      setEnCours(false);
    }
  }

  /** Corriger une macro recalcule les kcal par la formule. */
  function majMacro(id: string, champ: "p" | "c" | "f", valeur: number) {
    setRepas((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const maj = { ...r, [champ]: Math.max(0, valeur) };
        return { ...maj, kcal: kcalDepuisMacros(maj.p, maj.c, maj.f), estimated: false };
      }),
    );
  }

  /** Corriger les kcal redistribue les macros à proportion. */
  function majKcal(id: string, kcal: number) {
    setRepas((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, kcal: Math.max(0, kcal), ...redistribuerMacros(r, Math.max(0, kcal)), estimated: false }
          : r,
      ),
    );
  }

  function supprimer(id: string) {
    setRepas((prev) => prev.filter((r) => r.id !== id));
    setOuvert(null);
  }

  return (
    <Panel accent="var(--color-ver)" className="col-span-full md:col-span-2 xl:col-span-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          NUTRITION
        </Eyebrow>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[16px] font-black">{t.kcal}</span>
          <span className="text-[10.5px] text-white/40">/ {obj.kcal} kcal</span>
          <span
            className="font-mono text-[11px] font-extrabold"
            style={{ color: restant >= 0 ? "var(--color-ver-soft)" : "var(--color-mag-soft)" }}
          >
            {restant >= 0 ? `${restant} restant` : `${-restant} dépassé`}
          </span>
        </div>
      </div>

      <div className="bar-track" style={{ height: 6 }}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pctKcal}%`,
            background:
              restant >= 0
                ? "linear-gradient(90deg,#3ddc84,#22d3ee)"
                : "linear-gradient(90deg,#ff7a3d,#ff3d8b)",
          }}
        />
      </div>

      <div className="mt-3 flex gap-3">
        <Macro label="PROTÉINES" valeur={t.p} cible={obj.p} couleur="var(--color-mag)" />
        <Macro label="GLUCIDES" valeur={t.c} cible={obj.c} couleur="var(--color-amb)" />
        <Macro label="LIPIDES" valeur={t.f} cible={obj.f} couleur="var(--color-cya)" />
      </div>

      <form onSubmit={ajouter} className="mt-3 flex items-center gap-2">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Poulet riz brocolis, ou « estime 500 kcal »…"
          aria-label="Ajouter un repas"
          className="min-w-0 flex-1 rounded-[11px] px-3 py-[9px] text-[13px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
        <MicButton onTranscript={(x) => setSaisie((p) => (p ? `${p} ${x}` : x))} />
        <button
          type="submit"
          disabled={enCours || saisie.trim().length === 0}
          className="cursor-pointer rounded-[11px] border-none px-3 py-[9px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "linear-gradient(90deg,#3ddc84,#22d3ee)" }}
        >
          {enCours ? "…" : "Ajouter"}
        </button>
      </form>

      <div className="mt-3 flex flex-col gap-[6px]">
        {repas.length === 0 && (
          <div className="py-3 text-center text-[12px] text-white/30">
            Aucun repas aujourd&apos;hui.
          </div>
        )}

        {repas.map((r) => (
          <div key={r.id}>
            <button
              type="button"
              onClick={() => setOuvert(ouvert === r.id ? null : r.id)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-[8px] text-left transition-colors hover:brightness-125"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span className="flex-none font-mono text-[11px] font-bold text-white/45">
                {r.t}
              </span>
              <span className="flex-1 truncate text-[12.5px] font-bold">{r.n}</span>
              <span className="flex-none font-mono text-[11.5px] font-extrabold">
                {r.kcal}k
              </span>
              <span className="flex-none font-mono text-[11px] text-white/45">
                {r.p}p
              </span>
              {r.estimated && (
                <span
                  className="flex-none text-[9px] font-black"
                  style={{ color: "var(--color-amb)" }}
                  title="Estimé par l'IA — clique pour corriger"
                >
                  ~
                </span>
              )}
            </button>

            {ouvert === r.id && (
              <div
                className="mt-1 flex flex-wrap items-end gap-2 rounded-[10px] px-3 py-[10px]"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {([
                  ["kcal", r.kcal, (v: number) => majKcal(r.id, v)],
                  ["P", r.p, (v: number) => majMacro(r.id, "p", v)],
                  ["C", r.c, (v: number) => majMacro(r.id, "c", v)],
                  ["F", r.f, (v: number) => majMacro(r.id, "f", v)],
                ] as const).map(([label, valeur, set]) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="text-[9px] font-extrabold tracking-[0.08em] text-white/40">
                      {label}
                    </span>
                    <input
                      type="number"
                      value={valeur}
                      onChange={(e) => set(Number(e.target.value))}
                      className="w-[68px] rounded-[8px] px-2 py-[5px] font-mono text-[12px] font-bold text-white outline-none"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => supprimer(r.id)}
                  className="ml-auto cursor-pointer rounded-[8px] px-3 py-[6px] text-[11px] font-extrabold transition-all hover:brightness-125"
                  style={{
                    color: "var(--color-mag-soft)",
                    background: "rgba(255,61,139,0.1)",
                    border: "1px solid rgba(255,61,139,0.25)",
                  }}
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
