"use client";

import { useOs } from "@/lib/os-context";
import { ColumnHead, FormatBadge } from "@/components/ui";

/**
 * Le kanban de production, 6 colonnes (spec Partie 6).
 * `compact` sert la carte de l'accueil ; la version large sert la page Contenu.
 */
export function PipelineGrid({ compact = false }: { compact?: boolean }) {
  const { data } = useOs();

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      style={{ gap: compact ? 8 : 10 }}
    >
      {data.pipeline.map((col) => (
        <div
          key={col.status}
          className="subpanel"
          style={{
            padding: compact ? "8px 7px" : "10px 9px",
            minHeight: compact ? 120 : 170,
            borderRadius: compact ? 12 : 13,
          }}
        >
          <ColumnHead name={col.name} count={col.videos.length} color={col.color} />
          <div
            className="flex flex-col"
            style={{ gap: compact ? 6 : 8, marginTop: compact ? 8 : 10 }}
          >
            {col.videos.map((v) => (
              <button
                key={v.title}
                type="button"
                className="cursor-pointer text-left transition-colors hover:brightness-125"
                style={{
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: compact ? 9 : 10,
                  padding: compact ? "7px 8px" : "9px 10px",
                }}
              >
                <FormatBadge format={v.format} />
                <div
                  className="font-bold"
                  style={{
                    fontSize: compact ? 11 : 12,
                    marginTop: compact ? 5 : 6,
                    lineHeight: compact ? 1.25 : 1.3,
                  }}
                >
                  {v.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
