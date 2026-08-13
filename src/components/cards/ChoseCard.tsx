"use client";

import { Panel } from "@/components/Panel";
import { useSaisie } from "@/lib/os-context";

/**
 * AUJOURD'HUI JE VAIS — la seule chose qui compte.
 *
 * Une ligne, une case. C'est le seul bloc que Twaylo a demandé à garder du
 * pavé « Opérateur », et il avait raison : le reste (avatar, statut, série)
 * décrivait l'OS, celui-ci décide de la journée.
 *
 * Il est posé AU-DESSUS de la todo, pas dedans. La todo répond à « qu'est-ce
 * qu'il y a à faire » ; cette ligne-ci répond à « et si je ne fais qu'une
 * seule chose, laquelle ». Les mélanger ferait de la seconde une tâche parmi
 * douze, ce qu'elle n'est justement pas.
 */
export function ChoseCard() {
  const { uneChose, setUneChose } = useSaisie();
  const fait = uneChose.fait;

  return (
    <Panel
      accent="var(--color-mag)"
      size="sm"
      style={{
        border: `1px solid ${fait ? "rgba(61,220,132,0.3)" : "rgba(255,61,139,0.24)"}`,
        background: fait
          ? "linear-gradient(160deg, rgba(61,220,132,0.08), rgba(255,255,255,0.02))"
          : "linear-gradient(160deg, rgba(255,61,139,0.08), rgba(255,255,255,0.02))",
      }}
    >
      <div className="flex items-center gap-[12px]">
        {/*
          La case fait 40 px : c'est la coche la plus importante de la
          journée, elle ne doit pas être la plus petite de l'écran.
        */}
        <button
          type="button"
          onClick={() => setUneChose((p) => ({ ...p, fait: !p.fait }))}
          aria-pressed={fait}
          aria-label="Marquer la chose du jour comme faite"
          className="chose-case flex h-[40px] w-[40px] flex-none cursor-pointer items-center justify-center rounded-[13px] text-[19px] font-black text-[#07121d] transition-all hover:brightness-110"
          style={{
            background: fait ? "var(--color-ver)" : "transparent",
            border: `2.5px solid ${fait ? "var(--color-ver)" : "rgba(255,61,139,0.5)"}`,
          }}
        >
          {fait && "✓"}
        </button>

        <label className="min-w-0 flex-1 cursor-text">
          <span
            className="block text-[9.5px] font-black tracking-[0.12em]"
            style={{ color: fait ? "var(--color-ver-soft)" : "var(--color-mag-soft)" }}
          >
            AUJOURD&apos;HUI JE VAIS
          </span>
          <input
            value={uneChose.texte}
            onChange={(e) => setUneChose((p) => ({ ...p, texte: e.target.value }))}
            placeholder="…quoi, aujourd'hui ?"
            className="mt-[1px] w-full border-none bg-transparent text-[15.5px] font-black leading-[1.25] outline-none placeholder:font-bold placeholder:text-white/22"
            style={{
              color: fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
              textDecoration: fait ? "line-through" : "none",
            }}
          />
        </label>
      </div>
    </Panel>
  );
}
