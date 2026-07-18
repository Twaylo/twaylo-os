"use client";

import { useState } from "react";

import { useOs } from "@/lib/os-context";
import { CheckRow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** La carte prioritaire de l'OS (spec Partie 6) — d'où la bordure appuyée. */
export function TachesCard() {
  const { tasks, toggleTask, ajouterTache, supprimerTache } = useOs();
  const [nouvelle, setNouvelle] = useState("");
  const done = tasks.filter((t) => t.done).length;

  return (
    <Panel
      accent="var(--color-mag)"
      className="col-span-1"
      style={{
        border: "1px solid rgba(255,61,139,0.22)",
        boxShadow: "0 14px 34px -22px rgba(255,61,139,0.45)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="eyebrow tracking-[0.14em]"
          style={{ color: "var(--color-mag-soft)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--color-amb)" }}>
            ★
          </span>
          TÂCHES CLÉS
        </div>
        <div
          className="font-mono text-[11.5px] font-extrabold"
          style={{ color: "var(--color-mag-soft)" }}
        >
          {done}/{tasks.length}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState hint="Étoile 3 à 5 tâches le matin.">Aucune tâche clé</EmptyState>
      ) : (
        <div className="mt-[11px] flex flex-col gap-[6px]">
          {tasks.map((t, i) => {
            const id = (t as { id?: string }).id;
            return (
              <div key={id ?? t.text} className="group relative">
                <CheckRow
                  label={t.text}
                  meta={t.categorie}
                  done={t.done}
                  accent="var(--color-mag)"
                  onToggle={() => toggleTask(i)}
                />
                {id && (
                  <button
                    type="button"
                    onClick={() => supprimerTache(id)}
                    title="Supprimer"
                    aria-label={`Supprimer ${t.text}`}
                    className="absolute right-[6px] top-1/2 -translate-y-1/2 cursor-pointer rounded-[6px] px-[6px] py-[2px] text-[11px] font-black opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.12)" }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ajouterTache(nouvelle);
          setNouvelle("");
        }}
        className="mt-[8px] flex items-center gap-[6px]"
      >
        <input
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
          placeholder="Ajouter une tâche clé…"
          aria-label="Ajouter une tâche clé"
          className="min-w-0 flex-1 rounded-[9px] px-[10px] py-[6px] text-[12px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <button
          type="submit"
          disabled={nouvelle.trim().length === 0}
          className="flex-none cursor-pointer rounded-[9px] px-[10px] py-[6px] text-[12px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: "var(--color-mag)" }}
        >
          +
        </button>
      </form>
    </Panel>
  );
}
