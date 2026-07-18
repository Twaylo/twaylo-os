"use client";

import { useOs } from "@/lib/os-context";
import { CheckRow, Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HabitudesCard() {
  const { habits, toggleHabit } = useOs();
  const done = habits.filter((h) => h.done).length;
  const pct = habits.length ? Math.round((done / habits.length) * 100) : 0;

  return (
    <Panel accent="var(--color-vio)" className="col-span-1">
      <div className="flex items-center justify-between">
        <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
          HABITUDES
        </Eyebrow>

        <div className="relative h-[46px] w-[46px]">
          <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
            <circle
              cx="23"
              cy="23"
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="5"
            />
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
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[12px] font-black">
            {pct}%
          </div>
        </div>
      </div>

      <div className="mt-[10px] flex flex-col gap-[5px]">
        {habits.map((h, i) => (
          <CheckRow
            key={h.name}
            label={h.name}
            done={h.done}
            accent="var(--color-vio)"
            onToggle={() => toggleHabit(i)}
          />
        ))}
      </div>
    </Panel>
  );
}
