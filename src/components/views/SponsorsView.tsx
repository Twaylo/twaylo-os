"use client";

import { useOs } from "@/lib/os-context";
import { ColumnHead, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

/** Le CRM « business » : les deals sponsors, par étape de négociation. */
export function SponsorsView() {
  const { data } = useOs();
  const total = data.dealColumns.reduce((n, c) => n + c.deals.length, 0);

  return (
    <>
      <ViewHeader
        title="Sponsors · Deals"
        subtitle={total > 0 ? `${total} deals actifs` : "Aucun deal en cours"}
      />

      <div className="mb-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {data.dealStats.map((s) => (
          <Panel key={s.label} accent={s.color} size="sm" className="px-[17px] py-[15px]">
            <div className="text-[11px] font-bold text-white/45">{s.label}</div>
            <div
              className="mt-[5px] font-mono text-[22px] font-black"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.dealColumns.map((col) => (
          <div
            key={col.name}
            className="subpanel min-h-[280px] rounded-[16px] px-3 py-[13px]"
          >
            <ColumnHead
              name={col.name}
              count={col.deals.length}
              color={col.color}
              size={11}
            />

            {col.deals.length === 0 ? (
              <EmptyState>Vide</EmptyState>
            ) : (
              <div className="mt-[11px] flex flex-col gap-[9px]">
                {col.deals.map((d) => (
                  <button
                    key={d.name}
                    type="button"
                    className="cursor-pointer rounded-xl px-3 py-[11px] text-left transition-colors hover:brightness-125"
                    style={{
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13.5px] font-extrabold">{d.name}</div>
                      <div
                        className="flex-none font-mono text-[12px] font-extrabold"
                        style={{ color: "var(--color-ver-soft)" }}
                      >
                        {d.amount}
                      </div>
                    </div>
                    <div className="mt-1 text-[11.5px] text-white/50">{d.note}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
