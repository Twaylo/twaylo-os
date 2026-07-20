"use client";

import { useState } from "react";

import { useOs } from "@/lib/os-context";
import { EmptyState, FormatBadge } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { PipelineGrid } from "@/components/cards/PipelineGrid";
import { ViewHeader } from "@/components/views/ViewHeader";

export function ContenuView() {
  const { data, pipeline, ajouterVideo, demoMode } = useOs();
  const [nouvelleVideo, setNouvelleVideo] = useState("");
  const [format, setFormat] = useState<"short" | "long">("long");
  const colonnes = (!demoMode && pipeline) || data.pipeline;
  const videoCount = colonnes.reduce((n, c) => n + c.videos.length, 0);

  return (
    <>
      <ViewHeader
        title="Contenu · Production"
        subtitle={`${videoCount} en cours · ${data.ideas.length} idées en réserve`}
      />

      <Panel accent="var(--color-cya)" className="mb-[14px] rounded-[18px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span
            className="text-[10.5px] font-extrabold tracking-[0.12em]"
            style={{ color: "var(--color-cya-soft)" }}
          >
            PIPELINE
          </span>

          {/* Une idée qui vient doit pouvoir entrer sans quitter la page. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const idee = nouvelleVideo.trim();
              if (!idee) return;
              // On ne vide le champ qu'une fois l'ajout confirmé : en cas
              // d'échec, l'idée reste tapée pour pouvoir réessayer.
              void ajouterVideo(idee, format).then((ok) => {
                if (ok) setNouvelleVideo("");
              });
            }}
            className="flex flex-1 items-center justify-end gap-2"
          >
            <input
              value={nouvelleVideo}
              onChange={(e) => setNouvelleVideo(e.target.value)}
              placeholder="Nouvelle idée de vidéo…"
              aria-label="Nouvelle idée de vidéo"
              className="min-w-0 max-w-[320px] flex-1 rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold text-white outline-none transition-colors focus:border-white/25"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <button
              type="button"
              onClick={() => setFormat((f) => (f === "long" ? "short" : "long"))}
              title="Basculer le format"
              className="flex-none cursor-pointer rounded-[8px] px-[9px] py-[6px] text-[10px] font-black transition-all hover:brightness-125"
              style={{
                color: format === "short" ? "#07121d" : "#8fe8f5",
                background:
                  format === "short" ? "var(--color-amb)" : "rgba(34,211,238,0.14)",
                border:
                  format === "short" ? "none" : "1px solid rgba(34,211,238,0.35)",
              }}
            >
              {format === "short" ? "Short" : "Long"}
            </button>
            <button
              type="submit"
              disabled={nouvelleVideo.trim().length === 0}
              className="flex-none cursor-pointer rounded-[10px] border-none px-3 py-[7px] text-[12.5px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "linear-gradient(90deg,#3ddc84,#22d3ee)" }}
            >
              Ajouter
            </button>
          </form>
        </div>
        <PipelineGrid />
      </Panel>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        <Panel accent="var(--color-vio)" size="sm">
          <div
            className="mb-[11px] text-[10.5px] font-extrabold tracking-[0.12em]"
            style={{ color: "var(--color-vio-soft)" }}
          >
            RÉSERVE D&apos;IDÉES
          </div>
          {data.ideas.length === 0 ? (
            <EmptyState hint="Les vocaux Telegram atterriront ici.">
              Aucune idée en réserve
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {data.ideas.map((i) => (
                <div key={i.title} className="list-row gap-[10px]">
                  <FormatBadge format={i.format} />
                  <span className="flex-1 text-[13px] font-bold">{i.title}</span>
                  <span className="flex-none text-[11px] text-white/40">{i.src}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel accent="var(--color-ble)" size="sm">
          <div
            className="mb-[11px] text-[10.5px] font-extrabold tracking-[0.12em]"
            style={{ color: "var(--color-ble-soft)" }}
          >
            PROCHAINES PUBLICATIONS
          </div>
          {data.schedule.length === 0 ? (
            <EmptyState hint="Donne une date cible à une vidéo du pipeline.">
              Rien de programmé
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {data.schedule.map((p) => (
                <div key={p.title} className="list-row gap-3">
                  <span
                    className="flex-none font-mono text-[11.5px] font-extrabold"
                    style={{ color: "var(--color-ble-soft)", flexBasis: 54 }}
                  >
                    {p.date}
                  </span>
                  <span className="flex-1 text-[13px] font-bold">{p.title}</span>
                  <FormatBadge format={p.format} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
