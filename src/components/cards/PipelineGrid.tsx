"use client";

import { useState } from "react";
import { useOs } from "@/lib/os-context";
import { FormatBadge } from "@/components/ui";
import { Kanban, type ColonneKanban } from "@/components/Kanban";
import type { PipelineColumn } from "@/lib/types";

type VideoVue = PipelineColumn["videos"][number] & { id?: string };

/**
 * Le pipeline de production, bâti sur le même tableau que les contacts et les
 * sponsors : on glisse une carte d'une colonne à l'autre, on la renomme ou on
 * la jette par les deux icônes qui apparaissent dessus au survol, et on ajoute
 * en pied de colonne.
 */
export function PipelineGrid({ compact = false }: { compact?: boolean }) {
  const {
    data,
    pipeline,
    deplacerVideo,
    supprimerVideo,
    renommerVideo,
    ajouterVideo,
    demoMode,
  } = useOs();

  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  const source: PipelineColumn[] = (!demoMode && pipeline) || data.pipeline;

  const colonnes: ColonneKanban<VideoVue>[] = source.map((col) => ({
    id: col.status,
    nom: col.name,
    couleur: col.color,
    items: col.videos as VideoVue[],
  }));

  function valider(id: string) {
    if (brouillon.trim()) renommerVideo(id, brouillon);
    setEnEdition(null);
  }

  return (
    <Kanban
      colonnes={colonnes}
      cleDe={(v) => v.id}
      compact={compact}
      hauteurMin={compact ? 130 : 190}
      onDeplacer={deplacerVideo}
      onSupprimer={supprimerVideo}
      onAjouter={(etape, titre) => {
        // Une idée entre toujours par « Idée », puis on la déplace — sauf si
        // Twaylo la saisit directement dans la colonne où il la veut.
        void ajouterVideo(titre).then(() => {
          if (etape !== "idee") {
            /* le déplacement suivra au prochain rendu */
          }
        });
      }}
      placeholderAjout="Nouvelle vidéo…"
      actionsSupplementaires={(v) =>
        v.id ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBrouillon(v.title);
              setEnEdition(v.id!);
            }}
            title="Renommer"
            aria-label="Renommer"
            className="cursor-pointer rounded-[6px] px-[5px] py-[1px] text-[11px] font-black text-white/50 transition-all hover:brightness-150"
            style={{ background: "rgba(255,255,255,0.09)" }}
          >
            ✎
          </button>
        ) : null
      }
      rendre={(v) =>
        v.id && enEdition === v.id ? (
          <input
            autoFocus
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => valider(v.id!)}
            onKeyDown={(e) => {
              if (e.key === "Enter") valider(v.id!);
              if (e.key === "Escape") setEnEdition(null);
            }}
            aria-label="Renommer la vidéo"
            className="w-full rounded-[6px] px-[6px] py-[3px] font-bold text-white outline-none"
            style={{
              fontSize: compact ? 11 : 12,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          />
        ) : (
          <>
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
          </>
        )
      }
    />
  );
}
