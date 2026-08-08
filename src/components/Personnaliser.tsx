"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { TABS, useOs, type Tab } from "@/lib/os-context";
import { AMBIANCES, CUSTOM_DEFAUT, ordonnerOnglets, type AmbianceId } from "@/lib/custom";

/**
 * PERSONNALISER — l'OS aux couleurs de Twaylo.
 *
 * Trois familles de réglages, toutes appliquées à la seconde et enregistrées
 * toutes seules : l'ambiance (dégradé + halos du fond), les onglets (lesquels,
 * dans quel ordre) et l'identité affichée. Le panneau vit au-dessus de tout
 * (avatar → Personnaliser l'OS) pour être réglable depuis n'importe où.
 */
export function Personnaliser({ onClose }: { onClose: () => void }) {
  const { custom, majCustom, data, demoMode } = useOs();

  // Fermer sur Échap : un panneau qu'on ne sait pas fermer est une impasse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /*
   * L'identité est saisie au clavier : chaque frappe repeint l'écran tout de
   * suite via l'état local, et l'enregistrement part débouncé — sans ça, un
   * POST partirait à chaque lettre tapée.
   */
  const [ident, setIdent] = useState({ nom: custom.nom, role: custom.role });
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  function majIdent(patch: Partial<typeof ident>) {
    const suivant = { ...ident, ...patch };
    setIdent(suivant);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => majCustom(suivant), 450);
  }

  const ordonnes = ordonnerOnglets(TABS, custom.ordreOnglets);
  const caches = new Set(custom.ongletsCaches);

  function basculerOnglet(t: Tab) {
    if (t === "Accueil") return;
    majCustom({
      ongletsCaches: caches.has(t)
        ? custom.ongletsCaches.filter((o) => o !== t)
        : [...custom.ongletsCaches, t],
    });
  }

  function deplacerOnglet(t: Tab, sens: -1 | 1) {
    const i = ordonnes.indexOf(t);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= ordonnes.length) return;
    const suivant = [...ordonnes];
    [suivant[i], suivant[j]] = [suivant[j], suivant[i]];
    majCustom({ ordreOnglets: suivant });
  }

  /*
   * Le panneau est porté dans <body>, pas là où il est écrit.
   *
   * Il est déclaré depuis l'avatar, donc à l'intérieur du rail supérieur — et
   * ce rail porte un `backdrop-blur`. Or un filtre d'arrière-plan fait de
   * l'élément le référentiel de ses descendants en `position: fixed` : le
   * panneau se centrait sur la bande de 60 px du rail, moitié hors écran, et
   * le voile de fermeture ne couvrait que l'en-tête. Le portail le sort de ce
   * référentiel et le rend au viewport, comme prévu.
   *
   * Rendu seulement côté navigateur : `document` n'existe pas au pré-rendu.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* Cliquer à côté referme — réflexe attendu de tout panneau. */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(4,10,17,0.72)", backdropFilter: "blur(6px)" }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-label="Personnaliser l'OS"
        className="relative z-10 flex max-h-[84vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[20px]"
        style={{
          background: "rgba(11,24,38,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <span className="panel-accent" style={{ background: "var(--grad)" }} aria-hidden />

        <div className="flex items-center justify-between px-[18px] pb-[10px] pt-[16px]">
          <div>
            <div className="text-[17px] font-black tracking-[-0.01em]">
              Personnaliser l&apos;OS
            </div>
            <div className="text-[11px] text-white/40">
              Tout s&apos;enregistre tout seul et te suit sur tous tes appareils.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cursor-pointer rounded-[9px] px-[10px] py-[4px] text-[15px] font-black text-white/40 transition-all hover:text-white"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[16px] overflow-y-auto px-[18px] pb-[18px]">
          {/* ---------------- Ambiance ---------------- */}
          <section>
            <div className="eyebrow mb-[8px]" style={{ color: "var(--color-cya-soft)" }}>
              <span className="eyebrow-dot" style={{ background: "var(--color-cya)" }} />
              AMBIANCE
            </div>
            <div className="grid grid-cols-2 gap-[8px]">
              {(Object.entries(AMBIANCES) as [AmbianceId, (typeof AMBIANCES)[AmbianceId]][]).map(
                ([id, amb]) => {
                  const active = custom.ambiance === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => majCustom({ ambiance: id })}
                      aria-pressed={active}
                      className="cursor-pointer rounded-[13px] p-[10px] text-left transition-all hover:brightness-110"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                        boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.25)" : "none",
                      }}
                    >
                      <span
                        className="block h-[26px] w-full rounded-[8px]"
                        style={{ background: amb.grad }}
                        aria-hidden
                      />
                      <span className="mt-[7px] flex items-baseline justify-between">
                        <span className="text-[12.5px] font-extrabold">{amb.nom}</span>
                        {active && (
                          <span className="text-[9.5px] font-black tracking-[0.08em] text-white/50">
                            ACTIVE
                          </span>
                        )}
                      </span>
                      <span className="block text-[10.5px] leading-[1.35] text-white/40">
                        {amb.description}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </section>

          {/* ---------------- Onglets ---------------- */}
          <section>
            <div className="eyebrow mb-[8px]" style={{ color: "var(--color-amb-soft)" }}>
              <span className="eyebrow-dot" style={{ background: "var(--color-amb)" }} />
              ONGLETS — LESQUELS, DANS QUEL ORDRE
            </div>
            <div className="flex flex-col gap-[5px]">
              {ordonnes.map((t, i) => {
                const cache = caches.has(t);
                const fixe = t === "Accueil";
                return (
                  <div
                    key={t}
                    className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[6px]"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      opacity: cache ? 0.45 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => basculerOnglet(t)}
                      disabled={fixe}
                      aria-pressed={!cache}
                      title={
                        fixe
                          ? "L'accueil reste toujours visible"
                          : cache
                            ? `Réafficher ${t}`
                            : `Masquer ${t}`
                      }
                      className="flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center rounded-[6px] text-[11px] font-black text-[#07121d] transition-all disabled:cursor-not-allowed"
                      style={{
                        background: cache ? "transparent" : "var(--color-ver)",
                        border: `2px solid ${cache ? "rgba(255,255,255,0.25)" : "var(--color-ver)"}`,
                      }}
                    >
                      {!cache && "✓"}
                    </button>
                    <span className="flex-1 text-[12.5px] font-extrabold">
                      {t}
                      {fixe && (
                        <span className="ml-[7px] text-[9px] font-black tracking-[0.08em] text-white/30">
                          TOUJOURS VISIBLE
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => deplacerOnglet(t, -1)}
                      disabled={i === 0}
                      title={`Monter ${t}`}
                      aria-label={`Monter ${t}`}
                      className="cursor-pointer rounded-[6px] px-[7px] text-[11px] font-black text-white/40 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacerOnglet(t, 1)}
                      disabled={i === ordonnes.length - 1}
                      title={`Descendre ${t}`}
                      aria-label={`Descendre ${t}`}
                      className="cursor-pointer rounded-[6px] px-[7px] text-[11px] font-black text-white/40 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      ↓
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- Identité ---------------- */}
          <section>
            <div className="eyebrow mb-[8px]" style={{ color: "var(--color-vio-soft)" }}>
              <span className="eyebrow-dot" style={{ background: "var(--color-vio)" }} />
              IDENTITÉ AFFICHÉE
            </div>
            <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
              <label className="flex flex-col gap-[4px]">
                <span className="text-[9.5px] font-black tracking-[0.1em] text-white/30">
                  NOM
                </span>
                <input
                  value={ident.nom}
                  onChange={(e) => majIdent({ nom: e.target.value })}
                  placeholder={data.operator.name}
                  className="rounded-[9px] px-[10px] py-[7px] text-[13px] font-bold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              </label>
              <label className="flex flex-col gap-[4px]">
                <span className="text-[9.5px] font-black tracking-[0.1em] text-white/30">
                  RÔLE / TITRE
                </span>
                <input
                  value={ident.role}
                  onChange={(e) => majIdent({ role: e.target.value })}
                  placeholder={data.operator.role}
                  className="rounded-[9px] px-[10px] py-[7px] text-[13px] font-bold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              </label>
            </div>
            {demoMode && (
              <div className="mt-[6px] text-[10.5px] text-white/35">
                En mode démo, l&apos;identité d&apos;origine reste affichée — tes réglages
                s&apos;appliqueront au retour sur les vraies données.
              </div>
            )}
          </section>

          {/* ---------------- Remise à zéro ---------------- */}
          <button
            type="button"
            onClick={() => {
              // Le minuteur d'identité en attente écrirait le nom qu'on vient
              // d'effacer, une demi-seconde après la remise à zéro.
              if (minuteur.current) clearTimeout(minuteur.current);
              majCustom(CUSTOM_DEFAUT);
              setIdent({ nom: "", role: "" });
            }}
            className="cursor-pointer self-start rounded-[9px] px-[12px] py-[7px] text-[11.5px] font-extrabold text-white/50 transition-all hover:brightness-125"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Tout remettre d&apos;origine
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
