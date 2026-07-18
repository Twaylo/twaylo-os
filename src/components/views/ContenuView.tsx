"use client";

import { useOs } from "@/lib/os-context";
import { EmptyState, FormatBadge } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { PipelineGrid } from "@/components/cards/PipelineGrid";
import { ViewHeader } from "@/components/views/ViewHeader";

export function ContenuView() {
  const { data } = useOs();
  const videoCount = data.pipeline.reduce((n, c) => n + c.videos.length, 0);

  return (
    <>
      <ViewHeader
        title="Contenu · Production"
        subtitle={`${videoCount} en cours · ${data.ideas.length} idées en réserve`}
      />

      <Panel accent="var(--color-cya)" className="mb-[14px] rounded-[18px]">
        <div
          className="mb-3 text-[10.5px] font-extrabold tracking-[0.12em]"
          style={{ color: "var(--color-cya-soft)" }}
        >
          PIPELINE
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
