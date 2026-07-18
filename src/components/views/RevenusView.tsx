"use client";

import { useOs } from "@/lib/os-context";
import { Amount, EmptyState, FormatBadge, RevealButton } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

const CHART_HEIGHT = 115;

export function RevenusView() {
  const { revealed, data } = useOs();
  const rev = data.revenue;
  const hidden = !revealed;

  return (
    <>
      <ViewHeader
        title="Revenus"
        subtitle={rev.connected ? undefined : "YouTube Analytics non connecté"}
        action={rev.connected ? <RevealButton large /> : undefined}
      />

      <div className="mb-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {rev.stats.map((s) => (
          <Panel
            key={s.label}
            accent="var(--color-ver)"
            size="sm"
            className="px-[17px] py-[15px]"
          >
            <div className="text-[11px] font-bold text-white/45">{s.label}</div>
            <Amount
              hidden={hidden && s.sensitive && rev.connected}
              className="mt-[5px] block text-[22px] font-black"
            >
              {s.value}
            </Amount>
            <div
              className="mt-[2px] text-[11px] font-extrabold"
              style={{
                color: rev.connected ? "var(--color-ver-soft)" : "rgba(255,255,255,0.25)",
              }}
            >
              {s.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mb-[14px] grid grid-cols-1 gap-[14px] lg:grid-cols-[1.4fr_1fr]">
        <Panel accent="var(--color-ver)" size="sm">
          <div
            className="mb-3 text-[10.5px] font-extrabold tracking-[0.12em]"
            style={{ color: "var(--color-ver-soft)" }}
          >
            6 DERNIERS MOIS
          </div>
          {rev.history.length === 0 ? (
            <EmptyState hint="Un snapshot quotidien alimentera cet historique.">
              Pas encore d&apos;historique
            </EmptyState>
          ) : (
            <div className="flex h-[150px] items-end gap-[14px] px-1">
              {rev.history.map((b, i) => {
                const last = i === rev.history.length - 1;
                return (
                  <div
                    key={b.month}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]"
                  >
                    <Amount
                      hidden={hidden}
                      className="text-[10.5px] font-extrabold text-white/60"
                    >
                      {(b.value / 1000).toFixed(1)}k
                    </Amount>
                    <div
                      className="w-[26px] rounded-t-lg rounded-b-[3px]"
                      style={{
                        height: Math.round((b.value / rev.historyMax) * CHART_HEIGHT),
                        background: last
                          ? "linear-gradient(180deg,#3ddc84,#22d3ee)"
                          : "rgba(61,220,132,0.35)",
                      }}
                    />
                    <div className="text-[11px] font-bold text-white/45">{b.month}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel accent="var(--color-cya)" size="sm">
          <div
            className="mb-3 text-[10.5px] font-extrabold tracking-[0.12em]"
            style={{ color: "var(--color-cya-soft)" }}
          >
            SOURCES
          </div>
          {rev.sources.length === 0 ? (
            <EmptyState hint="AdSense · Sponsors · Membres · Merch">
              Aucune source
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              {rev.sources.map((s) => (
                <div key={s.label}>
                  <div className="mb-[5px] flex justify-between gap-2 text-[12.5px] font-bold">
                    <span>{s.label}</span>
                    <span className="flex-none font-mono text-white/60">{s.pct} %</span>
                  </div>
                  <div className="bar-track" style={{ height: 8 }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.pct}%`, background: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel accent="var(--color-cor)" size="sm">
        <div
          className="mb-[11px] text-[10.5px] font-extrabold tracking-[0.12em]"
          style={{ color: "var(--color-cor-soft)" }}
        >
          TOP VIDÉOS · CE MOIS
        </div>
        {rev.topVideos.length === 0 ? (
          <EmptyState hint="Elles apparaîtront dès la première publication monétisée.">
            Aucune vidéo publiée
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {rev.topVideos.map((v) => (
              <div key={v.title} className="list-row gap-3 px-[13px]">
                <FormatBadge format={v.format} />
                <span className="flex-1 text-[13px] font-bold">{v.title}</span>
                <span className="flex-none font-mono text-[11.5px] text-white/45">
                  {v.views}
                </span>
                <Amount
                  hidden={hidden}
                  className="flex-none text-[13px] font-extrabold"
                  style={{ color: "var(--color-ver-soft)" }}
                >
                  {v.rev}
                </Amount>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
