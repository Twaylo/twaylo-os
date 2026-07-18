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
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
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
                const menu = id !== undefined && menuOuvert === id;

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
                      onClick={() => id && setMenuOuvert(menu ? null : id)}
                      title={id ? "Glisser pour déplacer · cliquer pour les options" : undefined}
                      className="transition-colors hover:brightness-125"
                      style={{
                        background: menu
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.045)",
                        border: `1px solid ${menu ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: compact ? 9 : 11,
                        padding: compact ? "7px 8px" : "10px 11px",
                        cursor: id ? "grab" : "default",
                      }}
                    >
                      {rendre(item)}
                    </div>

                    {menu && id && (
                      <div
                        className="mt-1 rounded-[10px] p-[7px]"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div className="mb-[5px] text-[8px] font-black tracking-[0.1em] text-white/30">
                          DÉPLACER VERS
                        </div>
                        <div className="flex flex-wrap gap-[4px]">
                          {colonnes
                            .filter((c) => c.id !== col.id)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  onDeplacer(id, c.id);
                                  setMenuOuvert(null);
                                }}
                                className="cursor-pointer rounded-[6px] px-[7px] py-[3px] text-[9.5px] font-extrabold transition-all hover:brightness-125"
                                style={{
                                  color: c.couleur,
                                  background: "rgba(255,255,255,0.05)",
                                  border: "1px solid rgba(255,255,255,0.09)",
                                }}
                              >
                                {c.nom}
                              </button>
                            ))}
                        </div>

                        {/*
                          Les actions séparées des destinations par un trait.
                          Mélangées, on cliquait « Renommer » en croyant
                          choisir une étape.
                        */}
                        {(actionsSupplementaires || onSupprimer) && (
                          <div
                            className="mt-[7px] flex flex-wrap gap-[4px] pt-[7px]"
                            style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
                          >
                            {actionsSupplementaires?.(item, () => setMenuOuvert(null))}
                            {onSupprimer && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSupprimer(id);
                                  setMenuOuvert(null);
                                }}
                                className="ml-auto cursor-pointer rounded-[6px] px-[7px] py-[3px] text-[9.5px] font-extrabold transition-all hover:brightness-125"
                                style={{
                                  color: "var(--color-mag-soft)",
                                  background: "rgba(255,61,139,0.1)",
                                  border: "1px solid rgba(255,61,139,0.25)",
                                }}
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
