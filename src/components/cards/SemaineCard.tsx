"use client";

import { useOs } from "@/lib/os-context";
import { useCurrentWeek } from "@/lib/use-week";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

export function SemaineCard() {
  const { data } = useOs();
  const week = useCurrentWeek();
  const connected = data.events.length > 0;

  return (
    <Panel accent="var(--color-ble)" className="col-span-full md:col-span-2 xl:col-span-1">
      <div className="mb-[11px] flex items-center justify-between gap-3">
        <Eyebrow color="var(--color-ble-soft)" dot="var(--color-ble)">
          SEMAINE
        </Eyebrow>
        <div
          className="flex flex-none items-center gap-[6px] rounded-full px-[10px] py-1 text-[10.5px] font-bold"
          style={{
            color: connected ? "var(--color-ble-soft)" : "rgba(255,255,255,0.35)",
            background: connected ? "rgba(79,156,255,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${connected ? "rgba(79,156,255,0.25)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{
              background: connected ? "var(--color-ver)" : "rgba(255,255,255,0.25)",
            }}
          />
          Google Agenda
        </div>
      </div>

      {/* Réserve la hauteur pendant le premier rendu, avant que la date locale
          soit connue — évite un saut de mise en page. */}
      <div className="grid min-h-[62px] grid-cols-7 gap-[6px]">
        {week?.map((d) => (
          <div
            key={d.index}
            className="rounded-xl px-[3px] pb-[7px] pt-[9px] text-center"
            style={{
              background: d.isToday
                ? "rgba(79,156,255,0.16)"
                : "rgba(255,255,255,0.035)",
              border: `1px solid ${d.isToday ? "rgba(79,156,255,0.5)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div className="text-[9.5px] font-extrabold opacity-70">{d.label}</div>
            <div className="mt-[1px] font-mono text-[16px] font-black">{d.num}</div>
            <div
              className="mx-auto mt-1 h-[5px] w-[5px] rounded-full"
              style={{ background: data.busyDays[d.index] ?? "transparent" }}
            />
          </div>
        ))}
      </div>

      {connected ? (
        <ul className="mt-[11px] flex flex-col gap-[6px]">
          {data.events.map((e) => (
            <li
              key={e.title}
              className="flex items-center gap-[11px] rounded-[10px] px-3 py-[7px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span
                className="flex-none font-mono text-[11.5px] font-extrabold"
                style={{ color: "var(--color-ble-soft)", flexBasis: 42 }}
              >
                {e.time}
              </span>
              <span
                className="h-[6px] w-[6px] flex-none rounded-full"
                style={{ background: e.color }}
              />
              <span className="text-[12.5px] font-bold">{e.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState hint="L'agenda se branchera via l'URL iCal secrète.">
          Aucun événement
        </EmptyState>
      )}
    </Panel>
  );
}
