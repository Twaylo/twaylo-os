"use client";

import { useEffect, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { NIVEAUX, type Niveau } from "@/lib/types";
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

const ORDRE_NIVEAUX: Niveau[] = ["principal", "secondaire", "annexe"];

/**
 * TÂCHES CLÉS — la carte prioritaire de l'OS (spec Partie 6).
 *
 * Découpée en trois niveaux. Une liste à plat ne dit pas où porter son
 * attention : tout y pèse pareil, et le matin on attaque ce qui est en haut
 * plutôt que ce qui compte. Ici le focus principal est ce qui fait la journée,
 * le secondaire ce qui la soutient, l'annexe ce qui doit sortir de la tête
 * sans l'encombrer. Une tâche passe d'un niveau à l'autre par ⇅.
 */
export function TachesCard() {
  const {
    tasks,
    toggleTask,
    ajouterTache,
    supprimerTache,
    renommerTache,
    echangerTaches,
    changerNiveauTache,
  } = useOs();

  const [nouvelle, setNouvelle] = useState<Record<string, string>>({});
  /** L'identifiant de la tâche en cours de renommage, s'il y en a une. */
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  const done = tasks.filter((t) => t.done).length;

  /*
   * L'intensité de la fête, c'est l'avancement de la journée.
   *
   * On la mesure sur le focus principal et le secondaire seulement : les
   * annexes sont ce qu'on sort de sa tête, pas ce qui fait la journée. Les
   * compter diluerait le signal — vingt annexes en attente empêcheraient
   * d'atteindre le dernier palier même en ayant tout bouclé.
   */
  const compte = tasks.filter((t) => (t.niveau ?? "secondaire") !== "annexe");
  const intensite = compte.length
    ? compte.filter((t) => t.done).length / compte.length
    : 0;
  const toutFait = compte.length > 0 && intensite === 1;

  /*
   * La journée bouclée ne se célèbre qu'une fois, à l'instant où la dernière
   * case tombe. Sans le garde sur l'état précédent, le message reviendrait à
   * chaque rendu tant que tout est coché — et donc au rechargement de la page
   * le lendemain matin, ce qui serait absurde.
   */
  const [celebre, setCelebre] = useState(false);
  const toutFaitAvant = useRef(toutFait);
  useEffect(() => {
    if (toutFait && !toutFaitAvant.current) {
      setCelebre(true);
      const t = setTimeout(() => setCelebre(false), 2200);
      toutFaitAvant.current = toutFait;
      return () => clearTimeout(t);
    }
    toutFaitAvant.current = toutFait;
  }, [toutFait]);

  // L'index d'origine est conservé : `toggleTask` et `deplacerTache`
  // travaillent sur la liste complète, pas sur le sous-ensemble affiché.
  const parNiveau = ORDRE_NIVEAUX.map((niveau) => ({
    niveau,
    meta: NIVEAUX[niveau],
    items: tasks
      .map((t, index) => ({ t, index }))
      .filter(({ t }) => (t.niveau ?? "secondaire") === niveau),
  }));

  return (
    <Panel
      accent="var(--color-mag)"
      className="col-span-1"
      style={{
        border: "1px solid rgba(255,61,139,0.22)",
        boxShadow: "0 14px 34px -22px rgba(255,61,139,0.45)",
      }}
    >
      {celebre && (
        <div className="journee-pliee" aria-live="polite">
          <div
            className="whitespace-nowrap rounded-[18px] px-[26px] py-[16px] text-center"
            style={{
              background: "rgba(11,24,38,0.95)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 24px 70px -20px rgba(0,0,0,0.9)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div
              className="text-[30px] font-black tracking-[-0.02em]"
              style={{
                background: "var(--grad)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Journée pliée
            </div>
            <div className="mt-[3px] text-[12px] font-bold text-white/40">
              {compte.length} tâches — tout est fait
            </div>
          </div>
        </div>
      )}

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

      {tasks.length === 0 && (
        <EmptyState hint="Un focus principal, deux ou trois secondaires.">
          Aucune tâche
        </EmptyState>
      )}

      <div className="mt-[11px] flex flex-col gap-[13px]">
        {parNiveau.map(({ niveau, meta, items }) => {
          const faites = items.filter(({ t }) => t.done).length;

          return (
            <div key={niveau}>
              <div className="mb-[5px] flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[9px] font-black tracking-[0.12em]"
                    style={{ color: meta.couleur }}
                  >
                    {meta.nom}
                  </div>
                  <div className="text-[8px] font-bold tracking-[0.08em] text-white/25">
                    {meta.sousTitre}
                  </div>
                </div>
                {items.length > 0 && (
                  <span className="flex-none font-mono text-[9.5px] font-bold text-white/30">
                    {faites}/{items.length}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-[4px]">
                {items.map(({ t, index }, rang) => {
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

                  // Le niveau suivant dans le cycle : principal → secondaire →
                  // annexe → principal. Un seul bouton suffit ainsi à ranger
                  // une tâche n'importe où.
                  const suivant =
                    ORDRE_NIVEAUX[(ORDRE_NIVEAUX.indexOf(niveau) + 1) % ORDRE_NIVEAUX.length];

                  return (
                    <div key={id ?? t.text} className="group relative">
                      <CheckRow
                        label={t.text}
                        meta={t.categorie}
                        done={t.done}
                        accent={meta.couleur}
                        intensite={intensite}
                        onToggle={() => toggleTask(index)}
                      />
                      {id && (
                        // Fond opaque : la barre se superpose à la ligne, et
                        // sans lui le titre d'une tâche longue passait sous
                        // les boutons.
                        <div
                          className="absolute right-[5px] top-1/2 flex -translate-y-1/2 items-center gap-[2px] rounded-[8px] px-[3px] py-[2px] opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                          style={{ background: "rgba(17,30,44,0.96)" }}
                        >
                          <BoutonLigne
                            onClick={() => echangerTaches(index, items[rang - 1].index)}
                            disabled={rang === 0}
                            titre="Monter"
                          >
                            ↑
                          </BoutonLigne>
                          <BoutonLigne
                            onClick={() => echangerTaches(index, items[rang + 1].index)}
                            disabled={rang === items.length - 1}
                            titre="Descendre"
                          >
                            ↓
                          </BoutonLigne>
                          <BoutonLigne
                            onClick={() => changerNiveauTache(id, suivant)}
                            titre={`Déplacer vers ${NIVEAUX[suivant].nom.toLowerCase()}`}
                          >
                            ⇅
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

              {/* Un champ par niveau : on ajoute directement au bon endroit
                  plutôt que d'ajouter puis déplacer. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ajouterTache(nouvelle[niveau] ?? "", niveau);
                  setNouvelle((p) => ({ ...p, [niveau]: "" }));
                }}
                className="mt-[5px]"
              >
                <input
                  value={nouvelle[niveau] ?? ""}
                  onChange={(e) =>
                    setNouvelle((p) => ({ ...p, [niveau]: e.target.value }))
                  }
                  placeholder={`+ ${meta.nom.toLowerCase()}`}
                  aria-label={`Ajouter une tâche — ${meta.nom.toLowerCase()}`}
                  className="w-full rounded-[8px] px-[9px] py-[5px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                />
              </form>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
