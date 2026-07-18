"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";

export function OperateurCard() {
  const { data, uneChose, setUneChose } = useOs();
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
        <div
          className="stat-box flex-1"
          title="Jours d'affilée avec au moins une habitude cochée ou une entrée de journal"
        >
          {/* « Série » tout court ne disait pas de quoi. */}
          <div className="text-[10px] leading-[1.2] text-white/45">Jours d&apos;affilée</div>
          <div
            className="font-mono text-[16px] font-extrabold"
            style={{ color: "var(--color-mag-soft)" }}
          >
            {op.streakDays}
            <span className="text-[10px] text-white/45"> j</span>
          </div>
        </div>
        <div className="stat-box flex-1">
          <div className="text-[10px] leading-[1.2] text-white/45">Statut</div>
          <div className="mt-[2px] text-[13px] font-extrabold">{op.status}</div>
        </div>
      </div>

      {/*
        Le focus était un texte figé dans le code : impossible à changer, donc
        faux dès le lendemain. Il pointe maintenant sur « l'unique chose » du
        jour — la même donnée que la barre de capture, modifiable des deux
        côtés et enregistrée avec la journée.
      */}
      <label
        className="mt-[10px] block cursor-text rounded-[11px] px-[11px] py-[9px] transition-colors focus-within:border-[rgba(255,61,139,0.45)]"
        style={{
          background: "rgba(255,61,139,0.08)",
          border: "1px solid rgba(255,61,139,0.18)",
        }}
      >
        <span
          className="block text-[10px] font-extrabold"
          style={{ color: "var(--color-mag-soft)" }}
        >
          FOCUS DU JOUR
        </span>
        <input
          value={uneChose.texte}
          onChange={(e) => setUneChose((p) => ({ ...p, texte: e.target.value }))}
          placeholder="Sur quoi tu te concentres aujourd'hui ?"
          className="mt-[2px] w-full border-none bg-transparent text-[12.5px] font-bold leading-[1.35] outline-none placeholder:text-white/25"
          style={{
            color: uneChose.fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
            textDecoration: uneChose.fait ? "line-through" : "none",
          }}
        />
      </label>
    </Panel>
  );
}
