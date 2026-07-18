"use client";

import { useState } from "react";
import { useOs } from "@/lib/os-context";
import { ColumnHead, FormatBadge } from "@/components/ui";
import type { PipelineColumn } from "@/lib/types";

/**
 * Le kanban de production, 6 colonnes (spec Partie 6).
 *
 * Le déplacement se fait au clic, pas au glisser-déposer. C'est délibéré :
 * le glisser-déposer demande une bibliothèque, ne marche pas au doigt sans
 * réglages, et Twaylo consultera ce pipeline sur son téléphone en tournage.
 * Un clic ouvre les étapes, un second choisit — utilisable d'une main.
 */
export function PipelineGrid({ compact = false }: { compact?: boolean }) {
  const { data, pipeline, deplacerVideo, supprimerVideo, demoMode } = useOs();
  const [ouvert, setOuvert] = useState<string | null>(null);

  // `pipeline` vient de la base ; tant qu'il n'a pas répondu — ou en démo —
  // on affiche le jeu de données local.
  const colonnes: PipelineColumn[] = (!demoMode && pipeline) || data.pipeline;

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      style={{ gap: compact ? 8 : 10 }}
    >
      {colonnes.map((col) => (
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
            {col.videos.map((v) => {
              const id = (v as { id?: string }).id;
              const actif = id !== undefined && ouvert === id;

              return (
                <div key={id ?? v.title}>
                  <button
                    type="button"
                    onClick={() => id && setOuvert(actif ? null : id)}
                    disabled={!id}
                    title={id ? "Cliquer pour déplacer" : undefined}
                    className="w-full text-left transition-colors hover:brightness-125 disabled:cursor-default"
                    style={{
                      background: actif
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.045)",
                      border: `1px solid ${actif ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
                      borderRadius: compact ? 9 : 10,
                      padding: compact ? "7px 8px" : "9px 10px",
                      cursor: id ? "pointer" : "default",
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

                  {actif && id && (
                    <div
                      className="mt-1 rounded-[9px] p-[6px]"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div className="mb-[5px] text-[8px] font-black tracking-[0.1em] text-white/30">
                        DÉPLACER VERS
                      </div>
                      <div className="flex flex-wrap gap-[3px]">
                        {colonnes
                          .filter((c) => c.status !== col.status)
                          .map((c) => (
                            <button
                              key={c.status}
                              type="button"
                              onClick={() => {
                                deplacerVideo(id, c.status);
                                setOuvert(null);
                              }}
                              className="cursor-pointer rounded-[6px] px-[6px] py-[3px] text-[9px] font-extrabold transition-all hover:brightness-125"
                              style={{
                                color: c.color,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            supprimerVideo(id);
                            setOuvert(null);
                          }}
                          className="ml-auto cursor-pointer rounded-[6px] px-[6px] py-[3px] text-[9px] font-extrabold transition-all hover:brightness-125"
                          style={{
                            color: "var(--color-mag-soft)",
                            background: "rgba(255,61,139,0.1)",
                            border: "1px solid rgba(255,61,139,0.22)",
                          }}
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
