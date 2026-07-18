"use client";

import { useOs } from "@/lib/os-context";
import { CheckRow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** La carte prioritaire de l'OS (spec Partie 6) — d'où la bordure appuyée. */
export function TachesCard() {
  const { tasks, toggleTask } = useOs();
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
          {tasks.map((t, i) => (
            <CheckRow
              key={t.text}
              label={t.text}
              meta={t.categorie}
              done={t.done}
              accent="var(--color-mag)"
              onToggle={() => toggleTask(i)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
