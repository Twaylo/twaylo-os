"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow, MicButton } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** Liste « ce que l'IA a retenu », partagée entre l'accueil et la page Journal. */
export function MemoryList() {
  const { data } = useOs();

  if (data.memories.length === 0) {
    return (
      <div className="text-[12px] leading-[1.4] text-white/30">
        Rien encore. Chaque entrée de journal nourrit cette mémoire.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.memories.map((m) => (
        <li key={m} className="flex gap-[9px]">
          <span
            className="flex-none font-black"
            style={{ color: "var(--color-cor)" }}
            aria-hidden
          >
            ›
          </span>
          <span className="text-[12px] leading-[1.35] text-white/70">{m}</span>
        </li>
      ))}
    </ul>
  );
}

export function JournalCard() {
  const { journalText, setJournalText } = useOs();

  return (
    <Panel
      accent="var(--color-cor)"
      className="col-span-full flex flex-wrap gap-[18px]"
    >
      <div className="min-w-[280px] flex-[1_1_400px]">
        <Eyebrow color="var(--color-cor-soft)" dot="var(--color-cor)">
          JOURNAL DU SOIR
        </Eyebrow>

        <textarea
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          placeholder="Raconte ta journée — ce que tu as vu, ressenti, appris…"
          aria-label="Journal du soir"
          className="mt-[10px] min-h-16 w-full resize-y rounded-[13px] px-[13px] py-[11px] text-[13px] font-semibold leading-[1.5] text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.09)",
          }}
        />

        <div className="mt-[9px] flex flex-wrap items-center gap-[9px]">
          <MicButton
            onTranscript={(t) =>
              setJournalText((prev) => (prev ? `${prev} ${t}` : t))
            }
          />
          <button
            type="button"
            className="cursor-pointer rounded-[11px] border-none px-[17px] py-[9px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110"
            style={{ background: "linear-gradient(90deg,#ff7a3d,#ffc63d)" }}
          >
            Enregistrer
          </button>
          <span className="text-[11.5px] text-white/40">Nourrit la mémoire de ton IA</span>
        </div>
      </div>

      <div className="subpanel min-w-[230px] flex-[1_1_260px] rounded-[14px] px-[15px] py-[13px]">
        <div
          className="text-[10px] font-extrabold tracking-[0.06em]"
          style={{ color: "var(--color-cor-soft)" }}
        >
          CE QUE L&apos;IA A RETENU
        </div>
        <div className="mt-[10px]">
          <MemoryList />
        </div>
      </div>
    </Panel>
  );
}
