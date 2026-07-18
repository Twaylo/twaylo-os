"use client";

import { CAPTURE_META } from "@/lib/labels";
import { useOs } from "@/lib/os-context";
import { MicButton } from "@/components/ui";
import { Panel } from "@/components/Panel";

/**
 * La barre de capture. C'est l'entrée du pipeline de la spec Partie 5 :
 * le tri est local pour l'instant, il partira vers /api/capture en étape 3.
 * Seule carte à porter le dégradé signature en accent.
 */
export function CaptureBar() {
  const {
    captureText,
    setCaptureText,
    addCapture,
    capturing,
    captures,
    data,
    uneChose,
    setUneChose,
  } = useOs();

  return (
    <Panel
      accent="var(--grad)"
      hover={false}
      className="col-span-full flex flex-wrap items-center gap-5 px-[18px] py-[15px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex-none">
        <h1 className="text-[21px] font-black tracking-[-0.02em]">
          Salut {data.operator.name}
        </h1>
        <div className="mt-[3px] flex items-center gap-[7px] text-[11px] text-white/45">
          <span
            className="pulse-dot h-[7px] w-[7px] rounded-full"
            style={{ background: "#3fb8cf" }}
          />
          Bot Telegram · vocaux triés auto
        </div>
      </div>

      {/*
        AUJOURD'HUI JE VAIS — le « TODAY I WILL » de Miles.
        Une seule ligne, une seule intention. C'est ce qui transforme un
        tableau de bord en engagement : tout le reste est de l'information,
        celle-ci est une décision.
      */}
      <div className="flex min-w-[240px] flex-[1_1_300px] items-center gap-[9px]">
        <button
          type="button"
          onClick={() => setUneChose((p) => ({ ...p, fait: !p.fait }))}
          aria-pressed={uneChose.fait}
          title="Marquer comme fait"
          className="flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center rounded-[7px] text-[12px] font-black text-[#07121d] transition-all hover:brightness-125"
          style={{
            background: uneChose.fait ? "var(--color-amb)" : "transparent",
            border: `2px solid ${uneChose.fait ? "var(--color-amb)" : "rgba(255,198,61,0.4)"}`,
          }}
        >
          {uneChose.fait ? "✓" : ""}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="text-[8.5px] font-black tracking-[0.14em]"
            style={{ color: "var(--color-amb-soft)" }}
          >
            AUJOURD&apos;HUI JE VAIS
          </div>
          <input
            value={uneChose.texte}
            onChange={(e) => setUneChose((p) => ({ ...p, texte: e.target.value }))}
            placeholder="La seule chose qui compte aujourd'hui…"
            aria-label="L'unique chose du jour"
            className="w-full border-none bg-transparent text-[13.5px] font-bold outline-none"
            style={{
              color: uneChose.fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
              textDecoration: uneChose.fait ? "line-through" : "none",
            }}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addCapture();
        }}
        className="flex min-w-[280px] flex-[1_1_380px] items-center gap-[9px] rounded-[14px] py-[6px] pl-[15px] pr-[6px] transition-colors focus-within:border-white/25"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <input
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          placeholder="Balance une idée, une note, une tâche…"
          aria-label="Capture rapide"
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-semibold text-white outline-none"
        />
        <MicButton
          onTranscript={(t) =>
            setCaptureText((prev) => (prev ? `${prev} ${t}` : t))
          }
        />
        <button
          type="submit"
          disabled={capturing || captureText.trim().length === 0}
          className="cursor-pointer rounded-[11px] border-none px-4 py-[9px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "linear-gradient(90deg,#3ddc84,#22d3ee)" }}
        >
          {capturing ? "Tri…" : "Trier"}
        </button>
      </form>

      {captures.length > 0 ? (
        <ul className="flex flex-[0_1_auto] flex-wrap gap-[7px]">
          {captures.map((c, i) => {
            const meta = CAPTURE_META[c.type];
            return (
              <li
                key={`${c.text}-${i}`}
                className="flex items-center gap-[7px] rounded-full py-1 pl-[5px] pr-[11px]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span
                  className="rounded-full px-2 py-[2px] text-[9.5px] font-black text-[#07121d]"
                  style={{ background: meta.color }}
                >
                  {meta.label}
                </span>
                <span className="max-w-[150px] truncate text-[11.5px] text-white/75">
                  {c.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex-[0_1_auto] text-[11.5px] text-white/25">
          Rien en attente de tri.
        </div>
      )}
    </Panel>
  );
}
