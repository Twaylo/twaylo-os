"use client";

import { useState } from "react";

import { useOs } from "@/lib/os-context";
import { CheckRow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** Les actions d'une ligne : discrètes au repos, lisibles au survol. */
function BoutonLigne({
  children,
  onClick,
  titre,
  disabled,
  danger,
}: {
  children: string;
  onClick: () => void;
  titre: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titre}
      aria-label={titre}
      className="cursor-pointer rounded-[6px] px-[5px] py-[2px] text-[11px] font-black transition-all hover:brightness-150 disabled:cursor-not-allowed disabled:opacity-20"
      style={{
        color: danger ? "var(--color-mag-soft)" : "rgba(255,255,255,0.5)",
        background: danger ? "rgba(255,61,139,0.12)" : "rgba(255,255,255,0.07)",
      }}
    >
      {children}
    </button>
  );
}

/** La carte prioritaire de l'OS (spec Partie 6) — d'où la bordure appuyée. */
export function TachesCard() {
  const {
    tasks,
    toggleTask,
    ajouterTache,
    supprimerTache,
    renommerTache,
    deplacerTache,
  } = useOs();
  const [nouvelle, setNouvelle] = useState("");
  /** L'identifiant de la tâche en cours de renommage, s'il y en a une. */
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const done = tasks.filter((t) => t.done).length;

  return (
    <Panel
      accent="var(--color-mag)"
      className="col-span-1"
      style={{
        border: "1px solid rgba(255,61,139,0.22)",
        boxShadow: "0 14px 34px -22px rgba(255,61,139,0.45)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="eyebrow tracking-[0.14em]"
          style={{ color: "var(--color-mag-soft)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--color-amb)" }}>
            ★
          </span>
          TÂCHES CLÉS
        </div>
        <div
          className="font-mono text-[11.5px] font-extrabold"
          style={{ color: "var(--color-mag-soft)" }}
        >
          {done}/{tasks.length}
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState hint="Étoile 3 à 5 tâches le matin.">Aucune tâche clé</EmptyState>
      ) : (
        <div className="mt-[11px] flex flex-col gap-[6px]">
          {tasks.map((t, i) => {
            const id = (t as { id?: string }).id;

            // En cours de renommage : le champ remplace la ligne.
            if (id && edition === id) {
              return (
                <form
                  key={id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    renommerTache(id, brouillon);
                    setEdition(null);
                  }}
                >
                  <input
                    autoFocus
                    value={brouillon}
                    onChange={(e) => setBrouillon(e.target.value)}
                    onBlur={() => {
                      renommerTache(id, brouillon);
                      setEdition(null);
                    }}
                    // Échap annule : sans ça, une correction ratée ne se
                    // rattrape qu'en retapant l'ancien texte de mémoire.
                    onKeyDown={(e) => e.key === "Escape" && setEdition(null)}
                    aria-label={`Renommer ${t.text}`}
                    className="w-full rounded-[9px] px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none"
                    style={{
                      background: "rgba(255,61,139,0.10)",
                      border: "1px solid rgba(255,61,139,0.35)",
                    }}
                  />
                </form>
              );
            }

            return (
              <div key={id ?? t.text} className="group relative">
                <CheckRow
                  label={t.text}
                  meta={t.categorie}
                  done={t.done}
                  accent="var(--color-mag)"
                  onToggle={() => toggleTask(i)}
                />
                {id && (
                  <div className="absolute right-[5px] top-1/2 flex -translate-y-1/2 items-center gap-[2px] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <BoutonLigne
                      onClick={() => deplacerTache(i, -1)}
                      disabled={i === 0}
                      titre="Monter"
                    >
                      ↑
                    </BoutonLigne>
                    <BoutonLigne
                      onClick={() => deplacerTache(i, 1)}
                      disabled={i === tasks.length - 1}
                      titre="Descendre"
                    >
                      ↓
                    </BoutonLigne>
                    <BoutonLigne
                      onClick={() => {
                        setBrouillon(t.text);
                        setEdition(id);
                      }}
                      titre="Renommer"
                    >
                      ✎
                    </BoutonLigne>
                    <BoutonLigne
                      onClick={() => supprimerTache(id)}
                      titre="Supprimer"
                      danger
                    >
                      ×
                    </BoutonLigne>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ajouterTache(nouvelle);
          setNouvelle("");
        }}
        className="mt-[8px] flex items-center gap-[6px]"
      >
        <input
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
          placeholder="Ajouter une tâche clé…"
          aria-label="Ajouter une tâche clé"
          className="min-w-0 flex-1 rounded-[9px] px-[10px] py-[6px] text-[12px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <button
          type="submit"
          disabled={nouvelle.trim().length === 0}
          className="flex-none cursor-pointer rounded-[9px] px-[10px] py-[6px] text-[12px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: "var(--color-mag)" }}
        >
          +
        </button>
      </form>
    </Panel>
  );
}
