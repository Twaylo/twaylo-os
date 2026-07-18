"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";

export function OperateurCard() {
  const { data } = useOs();
  const op = data.operator;

  return (
    <Panel accent="var(--color-mag)" className="col-span-1">
      <Eyebrow color="var(--color-mag-soft)" dot="var(--color-mag)" className="tracking-[0.14em]">
        OPÉRATEUR
      </Eyebrow>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-12 w-12 flex-none rounded-[15px] p-[2px]"
          style={{ background: "linear-gradient(135deg,#ff3d8b,#ffc63d)" }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-[13px] bg-[#0d1a27] text-[21px] font-black">
            {op.name.charAt(0).toUpperCase()}
          </div>
        </div>
        <div>
          <div className="text-[18px] font-black">{op.name}</div>
          <div className="text-[11.5px] text-white/50">{op.role}</div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="stat-box flex-1">
          <div className="text-[10px] text-white/45">Série</div>
          <div
            className="font-mono text-[16px] font-extrabold"
            style={{ color: "var(--color-mag-soft)" }}
          >
            {op.streakDays}
            <span className="text-[10px] text-white/45"> j</span>
          </div>
        </div>
        <div className="stat-box flex-1">
          <div className="text-[10px] text-white/45">Statut</div>
          <div className="mt-[2px] text-[13px] font-extrabold">{op.status}</div>
        </div>
      </div>

      <div
        className="mt-[10px] rounded-[11px] px-[11px] py-[9px]"
        style={{
          background: "rgba(255,61,139,0.08)",
          border: "1px solid rgba(255,61,139,0.18)",
        }}
      >
        <div className="text-[10px] font-extrabold" style={{ color: "var(--color-mag-soft)" }}>
          FOCUS DU JOUR
        </div>
        <div className="mt-[2px] text-[12.5px] font-bold leading-[1.35]">{op.focus}</div>
      </div>
    </Panel>
  );
}
