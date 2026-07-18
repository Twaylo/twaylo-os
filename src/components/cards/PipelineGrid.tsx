"use client";

import { useRef, useState } from "react";
import { useOs } from "@/lib/os-context";
import { ColumnHead, FormatBadge } from "@/components/ui";
import type { PipelineColumn } from "@/lib/types";

/**
 * Le kanban de production, 6 colonnes (spec Partie 6).
 *
 * Deux façons de déplacer une vidéo, et les deux sont nécessaires :
 *
 *   - Le glisser-déposer, au bureau. C'est le geste attendu.
 *   - Le clic, qui ouvre la liste des étapes. Indispensable : l'API de
 *     glisser-déposer HTML ne fonctionne pas au doigt sur téléphone, et
 *     Twaylo consulte ce pipeline en tournage. Retirer le clic casserait
 *     l'usage mobile.
 *
 * Double-clic pour renommer sur place.
 */
export function PipelineGrid({ compact = false }: { compact?: boolean }) {
  const {
    data,
    pipeline,
    deplacerVideo,
    supprimerVideo,
    renommerVideo,
    demoMode,
  } = useOs();

  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [survolee, setSurvolee] = useState<string | null>(null);
  const glissee = useRef<string | null>(null);

  const colonnes: PipelineColumn[] = (!demoMode && pipeline) || data.pipeline;

  function validerRenommage(id: string) {
    if (brouillon.trim()) renommerVideo(id, brouillon);
    setEnEdition(null);
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      style={{ gap: compact ? 8 : 10 }}
    >
      {colonnes.map((col) => {
        const cible = survolee === col.status;

        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              // Sans preventDefault, le navigateur refuse le dépôt.
              e.preventDefault();
              setSurvolee(col.status);
            }}
            onDragLeave={() => setSurvolee((s) => (s === col.status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSurvolee(null);
              const id = glissee.current ?? e.dataTransfer.getData("text/plain");
              if (id) deplacerVideo(id, col.status);
              glissee.current = null;
            }}
            className="subpanel transition-colors"
            style={{
              padding: compact ? "8px 7px" : "10px 9px",
              minHeight: compact ? 120 : 170,
              borderRadius: compact ? 12 : 13,
              // La colonne survolée s'éclaire : sans repère visuel, on ne sait
              // pas où le dépôt va atterrir.
              background: cible ? "rgba(255,255,255,0.07)" : undefined,
              borderColor: cible ? col.color : undefined,
            }}
          >
            <ColumnHead name={col.name} count={col.videos.length} color={col.color} />

            <div
              className="flex flex-col"
              style={{ gap: compact ? 6 : 8, marginTop: compact ? 8 : 10 }}
            >
              {col.videos.map((v) => {
                const id = (v as { id?: string }).id;
                const menu = id !== undefined && menuOuvert === id;
                const edite = id !== undefined && enEdition === id;

                if (edite && id) {
                  return (
                    <input
                      key={id}
                      autoFocus
                      value={brouillon}
                      onChange={(e) => setBrouillon(e.target.value)}
                      onBlur={() => validerRenommage(id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") validerRenommage(id);
                        if (e.key === "Escape") setEnEdition(null);
                      }}
                      aria-label="Renommer la vidéo"
                      className="w-full font-bold text-white outline-none"
                      style={{
                        fontSize: compact ? 11 : 12,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        borderRadius: compact ? 9 : 10,
                        padding: compact ? "7px 8px" : "9px 10px",
                      }}
                    />
                  );
                }

                return (
                  <div key={id ?? v.title}>
                    <div
                      draggable={!!id}
                      onDragStart={(e) => {
                        if (!id) return;
                        glissee.current = id;
                        e.dataTransfer.setData("text/plain", id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        glissee.current = null;
                        setSurvolee(null);
                      }}
                      onClick={() => id && setMenuOuvert(menu ? null : id)}
                      onDoubleClick={() => {
                        if (!id) return;
                        setMenuOuvert(null);
                        setBrouillon(v.title);
                        setEnEdition(id);
                      }}
                      title={id ? "Glisser pour déplacer · double-clic pour renommer" : undefined}
                      className="transition-colors hover:brightness-125"
                      style={{
                        background: menu
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.045)",
                        border: `1px solid ${menu ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
                        borderRadius: compact ? 9 : 10,
                        padding: compact ? "7px 8px" : "9px 10px",
                        cursor: id ? "grab" : "default",
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
                    </div>

                    {menu && id && (
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
                                  setMenuOuvert(null);
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
                        </div>
                        <div className="mt-[5px] flex gap-[3px]">
                          <button
                            type="button"
                            onClick={() => {
                              setBrouillon(v.title);
                              setEnEdition(id);
                              setMenuOuvert(null);
                            }}
                            className="cursor-pointer rounded-[6px] px-[6px] py-[3px] text-[9px] font-extrabold text-white/50 transition-all hover:brightness-125"
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            Renommer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              supprimerVideo(id);
                              setMenuOuvert(null);
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
        );
      })}
    </div>
  );
}
