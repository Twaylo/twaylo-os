"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow, ProgressBar } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** Le résumé de l'accueil. La page Objectifs détaille les sous-étapes. */
export function ObjectifsCard() {
  const { data } = useOs();

  return (
    <Panel accent="var(--color-amb)" className="col-span-1">
      <Eyebrow color="var(--color-amb-soft)" dot="var(--color-amb)">
        OBJECTIFS
      </Eyebrow>

      <div className="mt-3 flex flex-col gap-[11px]">
        {data.objectives.map((o) => (
          <div key={o.period}>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span
                  className="text-[9.5px] font-extrabold"
                  style={{ color: "var(--color-amb-soft)" }}
                >
                  {o.period}
                </span>
                <div className="mt-[1px] text-[12px] font-bold">{o.label}</div>
              </div>
              <div className="flex-none font-mono text-[11.5px] font-extrabold text-white/65">
                {o.value}
              </div>
            </div>
            <div className="mt-[5px]">
              <ProgressBar pct={o.pct} color={o.color} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
