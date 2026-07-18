"use client";

import { useOs } from "@/lib/os-context";
import { ProgressBar, StepRow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

export function ObjectifsView() {
  const { data } = useOs();

  return (
    <>
      <ViewHeader title="Objectifs" subtitle="La trajectoire Twaylo" />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        {data.objectives.map((o) => (
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
              <div
                className="flex-none font-mono text-[14px] font-black"
                style={{ color: o.color }}
              >
                {o.value}
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
        ))}
      </div>
    </>
  );
}
