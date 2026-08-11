"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useOs } from "@/lib/os-context";
import { useProgression } from "@/lib/progression-context";
import { AMBIANCES, CUSTOM_DEFAUT, type AmbianceId } from "@/lib/custom";
import {
  BLOCS,
  MODULES,
  MODULES_COEUR,
  tousLesBlocs,
  tousLesModules,
} from "@/lib/modules";

/**
 * PERSONNALISER — l'OS aux couleurs de Twaylo.
 *
 * Trois familles de réglages, toutes appliquées à la seconde et enregistrées
 * toutes seules : l'ambiance (dégradé + halos du fond), les onglets (lesquels,
 * dans quel ordre) et l'identité affichée. Le panneau vit au-dessus de tout
 * (avatar → Personnaliser l'OS) pour être réglable depuis n'importe où.
 */
export function Personnaliser({ onClose }: { onClose: () => void }) {
  const { custom, majCustom, identite, demoMode } = useOs();
  /*
   * Le niveau sert à ouvrir les ambiances.
   *
   * Une ambiance verrouillée n'est pas cachée : la voir grisée avec son
   * niveau est ce qui donne envie d'y aller. Une récompense qu'on ne sait pas
   * exister ne récompense rien.
   */
  const { palier, affichable } = useProgression();
  const niveau = affichable ? palier.niveau : 1;

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

  /*
   * Une liste vide veut dire « tout », pas « rien ».
   *
   * C'est ce qui garde l'OS historique intact : personne n'a jamais réglé ses
   * modules, la liste enregistrée est donc vide, et l'OS complet s'affiche.
   * Dès le premier décochage, la liste devient explicite et ne bouge plus
   * toute seule — un module ajouté par une version future ne s'invite pas.
   */
  const modules = custom.modules.length > 0 ? custom.modules : tousLesModules();
  const blocs = custom.blocs.length > 0 ? custom.blocs : tousLesBlocs();

  /** Coche/décoche en gardant l'ordre du catalogue pour ce qu'on rajoute. */
  function basculer(
    liste: string[],
    id: string,
    catalogue: readonly string[],
    ecrire: (v: string[]) => void,
  ) {
    if (liste.includes(id)) {
      ecrire(liste.filter((x) => x !== id));
      return;
    }
    // Réinstallé À SA PLACE, pas à la fin : on retrouve l'OS qu'on connaissait.
    const rang = new Map(catalogue.map((x, i) => [x, i]));
    ecrire([...liste, id].sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0)));
  }

  function deplacer(liste: string[], id: string, sens: -1 | 1, ecrire: (v: string[]) => void) {
    const i = liste.indexOf(id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= liste.length) return;
    const suivant = [...liste];
    [suivant[i], suivant[j]] = [suivant[j], suivant[i]];
    ecrire(suivant);
  }

  const modulesInstalles = new Set(modules);

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
            <p className="mb-[8px] text-[10.5px] leading-[1.4] text-white/35">
              Une couleur unie, ou un dégradé. Cinq se débloquent en montant de niveau.
            </p>
            <div className="grid grid-cols-2 gap-[8px]">
              {(Object.entries(AMBIANCES) as [AmbianceId, (typeof AMBIANCES)[AmbianceId]][]).map(
                ([id, amb]) => {
                  const active = custom.ambiance === id;
                  /*
                   * Une ambiance déjà active reste utilisable même si le
                   * niveau redescendait : on ne reprend pas ce qui a été
                   * donné, et un écran qui change de couleur tout seul serait
                   * incompréhensible.
                   */
                  const verrou = amb.niveau > niveau && !active;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => !verrou && majCustom({ ambiance: id })}
                      disabled={verrou}
                      aria-pressed={active}
                      title={
                        verrou
                          ? `Se débloque au niveau ${amb.niveau}`
                          : `${amb.nom} — ${amb.description}`
                      }
                      className="cursor-pointer rounded-[13px] p-[10px] text-left transition-all hover:brightness-110 disabled:cursor-not-allowed"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                        boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.25)" : "none",
                      }}
                    >
                      <span
                        className="block h-[26px] w-full rounded-[8px]"
                        style={{
                          background: amb.grad,
                          filter: verrou ? "grayscale(0.85) brightness(0.55)" : "none",
                        }}
                        aria-hidden
                      />
                      <span className="mt-[7px] flex items-baseline justify-between gap-2">
                        <span
                          className="text-[12.5px] font-extrabold"
                          style={{ color: verrou ? "rgba(255,255,255,0.4)" : undefined }}
                        >
                          {verrou && "🔒 "}
                          {amb.nom}
                        </span>
                        {active ? (
                          <span className="flex-none text-[9.5px] font-black tracking-[0.08em] text-white/50">
                            ACTIVE
                          </span>
                        ) : (
                          verrou && (
                            <span
                              className="flex-none font-mono text-[9.5px] font-black"
                              style={{ color: "var(--color-amb-soft)" }}
                            >
                              NIV {amb.niveau}
                            </span>
                          )
                        )}
                      </span>
                      <span className="block text-[10.5px] leading-[1.35] text-white/40">
                        {verrou
                          ? `Encore ${amb.niveau - niveau} niveau${amb.niveau - niveau > 1 ? "x" : ""} avant de l'ouvrir.`
                          : amb.description}
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </section>

          {/* ---------------- Modules ---------------- */}
          <section>
            <div className="eyebrow mb-[4px]" style={{ color: "var(--color-amb-soft)" }}>
              <span className="eyebrow-dot" style={{ background: "var(--color-amb)" }} />
              MODULES — LES ONGLETS DE TON OS
            </div>
            <p className="mb-[8px] text-[10.5px] leading-[1.4] text-white/35">
              Installe ce qui te sert, retire le reste. Rien n&apos;est perdu en retirant
              un module : ses données t&apos;attendent si tu le réinstalles.
            </p>
            <Liste
              catalogue={MODULES.map((m) => ({
                id: m.id,
                titre: m.id,
                emoji: m.emoji,
                description: m.description,
                fixe: MODULES_COEUR.includes(m.id),
              }))}
              choisis={modules}
              onBasculer={(id) =>
                basculer(modules, id, tousLesModules(), (v) => majCustom({ modules: v }))
              }
              onDeplacer={(id, sens) =>
                deplacer(modules, id, sens, (v) => majCustom({ modules: v }))
              }
            />
          </section>

          {/* ---------------- Blocs de l'accueil ---------------- */}
          <section>
            <div className="eyebrow mb-[4px]" style={{ color: "var(--color-ver-soft)" }}>
              <span className="eyebrow-dot" style={{ background: "var(--color-ver)" }} />
              BLOCS DE L&apos;ACCUEIL
            </div>
            <p className="mb-[8px] text-[10.5px] leading-[1.4] text-white/35">
              Ce que tu veux voir en ouvrant l&apos;OS, et dans quel ordre. Le premier de
              la liste est le premier à l&apos;écran.
            </p>
            <Liste
              catalogue={BLOCS.map((b) => ({
                id: b.id,
                titre: b.titre,
                emoji: b.emoji,
                description: b.description,
                /*
                 * Un bloc dont le module manque reste cochable, mais on le dit.
                 * Le masquer ferait croire qu'il n'existe pas ; le laisser muet
                 * ferait croire à un bug quand il n'apparaît pas à l'accueil.
                 */
                note:
                  b.module && !modulesInstalles.has(b.module)
                    ? `Demande le module ${b.module}`
                    : undefined,
              }))}
              choisis={blocs}
              onBasculer={(id) =>
                basculer(blocs, id, tousLesBlocs(), (v) => majCustom({ blocs: v }))
              }
              onDeplacer={(id, sens) =>
                deplacer(blocs, id, sens, (v) => majCustom({ blocs: v }))
              }
            />
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
                  placeholder={identite.nom}
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
                  placeholder={identite.role || "Ton rôle"}
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

type Entree = {
  id: string;
  titre: string;
  emoji: string;
  description: string;
  /** Ne se retire pas : sans lui, plus d'OS. */
  fixe?: boolean;
  /** Une réserve à afficher — par exemple un module manquant. */
  note?: string;
};

/**
 * La liste installée / disponible, commune aux modules et aux blocs.
 *
 * Deux zones, et l'ordre entre elles n'est pas cosmétique : ce qui est
 * installé se range à la main (↑↓), ce qui ne l'est pas n'a pas d'ordre — le
 * mélanger dans une seule liste donnait des flèches qui déplacent des lignes
 * invisibles à l'écran. La zone du bas est un catalogue, pas un classement.
 */
function Liste({
  catalogue,
  choisis,
  onBasculer,
  onDeplacer,
}: {
  catalogue: Entree[];
  choisis: string[];
  onBasculer: (id: string) => void;
  onDeplacer: (id: string, sens: -1 | 1) => void;
}) {
  const par = new Map(catalogue.map((e) => [e.id, e]));
  const installes = choisis.map((id) => par.get(id)).filter((e): e is Entree => Boolean(e));
  const dispo = catalogue.filter((e) => !choisis.includes(e.id));

  return (
    <>
      <div className="flex flex-col gap-[5px]">
        {installes.map((e, i) => (
          <div
            key={e.id}
            className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              type="button"
              onClick={() => onBasculer(e.id)}
              disabled={e.fixe}
              aria-pressed
              title={e.fixe ? "Toujours installé" : `Retirer ${e.titre}`}
              className="flex h-[20px] w-[20px] flex-none cursor-pointer items-center justify-center rounded-[6px] text-[11px] font-black text-[#07121d] transition-all disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: "var(--color-ver)", border: "2px solid var(--color-ver)" }}
            >
              ✓
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-extrabold">
                {e.emoji} {e.titre}
                {e.fixe && (
                  <span className="ml-[7px] text-[9px] font-black tracking-[0.08em] text-white/30">
                    TOUJOURS LÀ
                  </span>
                )}
              </span>
              <span className="block truncate text-[10.5px] leading-[1.35] text-white/35">
                {e.note ?? e.description}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onDeplacer(e.id, -1)}
              disabled={i === 0}
              title={`Monter ${e.titre}`}
              aria-label={`Monter ${e.titre}`}
              className="min-h-[30px] cursor-pointer rounded-[6px] px-[8px] text-[11px] font-black text-white/40 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onDeplacer(e.id, 1)}
              disabled={i === installes.length - 1}
              title={`Descendre ${e.titre}`}
              aria-label={`Descendre ${e.titre}`}
              className="min-h-[30px] cursor-pointer rounded-[6px] px-[8px] text-[11px] font-black text-white/40 transition-all hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              ↓
            </button>
          </div>
        ))}
      </div>

      {dispo.length > 0 && (
        <>
          <div className="mt-[10px] text-[9.5px] font-black tracking-[0.1em] text-white/25">
            À AJOUTER
          </div>
          <div className="mt-[5px] flex flex-col gap-[4px]">
            {dispo.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onBasculer(e.id)}
                title={`Ajouter ${e.titre}`}
                className="flex cursor-pointer items-center gap-[9px] rounded-[10px] px-[10px] py-[7px] text-left transition-all hover:brightness-125"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed rgba(255,255,255,0.11)",
                }}
              >
                <span
                  className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-[6px] text-[12px] font-black text-white/40"
                  style={{ border: "2px solid rgba(255,255,255,0.2)" }}
                >
                  +
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-extrabold text-white/60">
                    {e.emoji} {e.titre}
                  </span>
                  <span className="block truncate text-[10.5px] leading-[1.35] text-white/30">
                    {e.note ?? e.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
