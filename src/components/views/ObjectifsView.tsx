"use client";

import { useOs } from "@/lib/os-context";
import { ProgressBar, StepRow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

/**
 * Objectifs — les quatre horizons visibles d'un seul coup d'œil.
 *
 * Une bande de synthèse en haut donne les quatre avancements côte à côte,
 * sans scroller : c'est ce qu'on veut savoir en arrivant. Le détail des
 * sous-étapes vient dessous, pour qui creuse.
 */
export function ObjectifsView() {
  const { data } = useOs();
  const objectifs = data.objectives;

  const moyenne = objectifs.length
    ? Math.round(objectifs.reduce((n, o) => n + o.pct, 0) / objectifs.length)
    : 0;

  return (
    <>
      <ViewHeader
        title="Objectifs"
        subtitle={`La trajectoire Twaylo · ${moyenne} % en moyenne`}
      />

      {/* La bande de synthèse : les quatre horizons d'un seul regard. */}
      <div className="mb-[14px] grid grid-cols-2 gap-[10px] xl:grid-cols-4">
        {objectifs.map((o) => (
          <div
            key={o.period}
            className="rounded-[14px] px-[14px] py-[12px]"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderTop: `2px solid ${o.color}`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[9px] font-black tracking-[0.12em]"
                style={{ color: o.color }}
              >
                {o.period}
              </span>
              <span
                className="font-mono text-[15px] font-black"
                style={{ color: o.color }}
              >
                {o.value}
              </span>
            </div>
            <div className="mt-[5px] truncate text-[12px] font-bold" title={o.label}>
              {o.label}
            </div>
            <div className="mt-[7px]">
              <ProgressBar pct={o.pct} color={o.color} height={5} />
            </div>
          </div>
        ))}
      </div>

      {/* Le détail, pour qui veut savoir ce qui reste à faire. */}
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        {objectifs.map((o) => {
          const faites = o.steps.filter((s) => s.done).length;
          return (
            <Panel key={o.period} accent={o.color} className="rounded-[18px] p-[18px]">
              <div className="flex items-center justify-between gap-3">
                <div
                  className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.1em]"
                  style={{ color: o.color }}
                >
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: o.color }}
                  />
                  {o.period}
                </div>
                <div className="flex-none font-mono text-[11px] text-white/40">
                  {faites}/{o.steps.length} étapes
                </div>
              </div>

              <div className="mt-2 text-[16px] font-extrabold">{o.label}</div>

              <div className="mt-[10px]">
                <ProgressBar pct={o.pct} color={o.color} height={8} />
              </div>

              <div className="mt-[13px] flex flex-col gap-[7px]">
                {o.steps.map((st) => (
                  <StepRow key={st.text} label={st.text} done={st.done} accent={o.color} />
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
