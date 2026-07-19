"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Le tableau à colonnes, réutilisable partout.
 *
 * Écrit une fois pour le pipeline, les contacts et les sponsors — plutôt que
 * trois fois avec trois comportements légèrement différents. Chaque écran qui
 * range des cartes en colonnes se branche dessus et hérite du même geste.
 *
 * Trois façons d'agir, et les trois sont nécessaires :
 *   - glisser-déposer, au bureau ;
 *   - menu au clic, indispensable au doigt (le glisser HTML natif ne
 *     fonctionne pas sur écran tactile) ;
 *   - saisie en pied de colonne pour créer sans quitter la vue.
 */

export type ColonneKanban<T> = {
  id: string;
  nom: string;
  couleur: string;
  items: T[];
};

export function Kanban<T>({
  colonnes,
  cleDe,
  rendre,
  onDeplacer,
  onSupprimer,
  onAjouter,
  placeholderAjout = "Ajouter…",
  hauteurMin = 200,
  compact = false,
  actionsSupplementaires,
}: {
  colonnes: ColonneKanban<T>[];
  cleDe: (item: T) => string | undefined;
  rendre: (item: T) => ReactNode;
  onDeplacer: (id: string, colonneId: string) => void;
  onSupprimer?: (id: string) => void;
  /** Absent = pas de champ de création sur cette colonne. */
  onAjouter?: (colonneId: string, texte: string) => void;
  placeholderAjout?: string;
  hauteurMin?: number;
  compact?: boolean;
  /** Boutons propres à l'écran, ajoutés au menu d'une carte. */
  actionsSupplementaires?: (item: T, fermer: () => void) => ReactNode;
}) {
  const [survolee, setSurvolee] = useState<string | null>(null);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const glissee = useRef<string | null>(null);

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
      style={{ gap: compact ? 8 : 12 }}
    >
      {colonnes.map((col) => {
        const cible = survolee === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              // Sans preventDefault, le navigateur refuse le dépôt.
              e.preventDefault();
              setSurvolee(col.id);
            }}
            onDragLeave={() => setSurvolee((s) => (s === col.id ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSurvolee(null);
              const id = glissee.current ?? e.dataTransfer.getData("text/plain");
              if (id) onDeplacer(id, col.id);
              glissee.current = null;
            }}
            className="subpanel flex flex-col transition-colors"
            style={{
              padding: compact ? "8px 7px" : "11px 10px",
              minHeight: hauteurMin,
              borderRadius: compact ? 12 : 14,
              // La colonne visée s'éclaire : sans repère, on ne sait pas où
              // la carte va atterrir.
              background: cible ? "rgba(255,255,255,0.08)" : undefined,
              borderColor: cible ? col.couleur : undefined,
            }}
          >
            <div
              className="mb-[8px] font-black uppercase tracking-[0.04em]"
              style={{ color: col.couleur, fontSize: compact ? 10.5 : 11 }}
            >
              {col.nom} <span className="opacity-55">{col.items.length}</span>
            </div>

            <div className="flex flex-1 flex-col" style={{ gap: compact ? 6 : 7 }}>
              {col.items.map((item) => {
                const id = cleDe(item);

                return (
                  <div key={id ?? JSON.stringify(item)}>
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
                      title={id ? "Glisser pour déplacer" : undefined}
                      className="group relative transition-colors hover:brightness-125"
                      style={{
                        background: "rgba(255,255,255,0.045)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: compact ? 9 : 11,
                        padding: compact ? "7px 8px" : "10px 11px",
                        cursor: id ? "grab" : "default",
                      }}
                    >
                      {rendre(item)}

                      {/*
                        Les actions sont posées sur la carte, pas cachées dans
                        un menu. Le menu au clic listait « déplacer vers » les
                        six étapes et enterrait « Supprimer » dessous : pour
                        jeter une idée il fallait cliquer, chercher, viser.
                        Le déplacement se fait au glissé, qui est le geste
                        naturel sur un tableau.
                      */}
                      {id && (actionsSupplementaires || onSupprimer) && (
                        <div className="absolute right-[5px] top-[5px] flex items-center gap-[3px] opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {actionsSupplementaires?.(item, () => {})}
                          {onSupprimer && (
                            <button
                              type="button"
                              onClick={(e) => {
                                // Sans ça, le clic remonte à la carte et
                                // démarre un glissé fantôme.
                                e.stopPropagation();
                                onSupprimer(id);
                              }}
                              title="Supprimer"
                              aria-label="Supprimer"
                              className="cursor-pointer rounded-[6px] px-[5px] py-[1px] text-[11px] font-black transition-all hover:brightness-150"
                              style={{
                                color: "var(--color-mag-soft)",
                                background: "rgba(255,61,139,0.16)",
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>

            {onAjouter && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const texte = (saisies[col.id] ?? "").trim();
                  if (!texte) return;
                  onAjouter(col.id, texte);
                  setSaisies((s) => ({ ...s, [col.id]: "" }));
                }}
                className="mt-[8px]"
              >
                <input
                  value={saisies[col.id] ?? ""}
                  onChange={(e) =>
                    setSaisies((s) => ({ ...s, [col.id]: e.target.value }))
                  }
                  placeholder={placeholderAjout}
                  aria-label={`Ajouter dans ${col.nom}`}
                  className="w-full rounded-[8px] px-[9px] py-[6px] text-[11.5px] font-semibold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                />
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
