"use client";

import { useState } from "react";
import { useOs } from "@/lib/os-context";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import type { Blocage } from "@/lib/types";

/**
 * ÇA COINCE — l'équivalent des KEY BLOCKERS de Miles.
 *
 * Elle ne montre pas ce qu'il faut faire, mais **ce qui est arrêté et chez
 * qui**. Le nombre de jours est ce qui pique : une relance oubliée depuis
 * trois semaines devient impossible à ignorer.
 *
 * Le titre disait « BLOCAGES », ce qui ne disait rien à qui n'a pas lu la
 * spec. Le sous-titre l'énonce maintenant en clair, et l'état vide explique à
 * quoi sert la carte au lieu de se contenter de « rien de bloqué ».
 */

const CHALEUR: Record<Blocage["chaleur"], { label: string; couleur: string }> = {
  chaud: { label: "+2 SEM.", couleur: "var(--color-mag)" },
  tiede: { label: "+1 SEM.", couleur: "var(--color-amb)" },
  froid: { label: "RÉCENT", couleur: "var(--color-ble)" },
};

/** Au-delà d'une semaine, le compteur de jours passe en alerte. */
function couleurJours(jours: number): string {
  if (jours >= 14) return "var(--color-mag)";
  if (jours >= 7) return "var(--color-cor)";
  return "rgba(255,255,255,0.45)";
}

const APERCU = 4;

export function BlocagesCard() {
  const { blocages, ajouterBlocage, leverBlocage } = useOs();
  const [tout, setTout] = useState(false);
  const [saisie, setSaisie] = useState("");

  const visibles = tout ? blocages : blocages.slice(0, APERCU);
  const restants = blocages.length - visibles.length;

  return (
    <Panel accent="var(--color-mag)" className="col-span-1">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Eyebrow color="var(--color-mag-soft)" dot="var(--color-mag)">
            ÇA COINCE
          </Eyebrow>
          <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
            CE QUI EST ARRÊTÉ, ET CHEZ QUI
          </div>
        </div>
        {blocages.length > 0 && (
          <span
            className="flex-none font-mono text-[11px] font-extrabold"
            style={{ color: "var(--color-mag-soft)" }}
          >
            {blocages.length}
          </span>
        )}
      </div>

      {blocages.length === 0 ? (
        <div className="mt-3 rounded-[10px] px-[11px] py-[10px] text-[11px] leading-[1.45] text-white/35"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.09)" }}
        >
          Rien de bloqué. Note ici ce qui attend quelqu&apos;un — un devis sans
          réponse, un montage chez ton monteur — pour voir depuis combien de
          jours ça traîne.
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-[7px]">
            {visibles.map((b) => {
              const chaleur = CHALEUR[b.chaleur];
              return (
                <div
                  key={b.id ?? b.texte}
                  className="group relative rounded-[10px] px-[10px] py-[8px]"
                  style={{
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderLeft: `2px solid ${chaleur.couleur}`,
                  }}
                >
                  <div className="pr-[18px] text-[12px] font-bold leading-[1.3]">{b.texte}</div>
                  <div className="mt-[5px] flex items-center gap-2 text-[10px]">
                    <span className="text-white/40">
                      chez <span className="font-bold text-white/60">{b.proprietaire}</span>
                    </span>
                    <span
                      className="font-mono font-extrabold"
                      style={{ color: couleurJours(b.depuisJours) }}
                    >
                      {b.depuisJours} j
                    </span>
                    <span
                      className="ml-auto flex-none text-[8.5px] font-black tracking-[0.08em]"
                      style={{ color: chaleur.couleur }}
                    >
                      {chaleur.label}
                    </span>
                  </div>

                  {b.id && (
                    <button
                      type="button"
                      onClick={() => leverBlocage(b.id!)}
                      title="C'est débloqué"
                      aria-label={`Marquer « ${b.texte} » comme débloqué`}
                      className="absolute right-[7px] top-[7px] cursor-pointer rounded-[5px] px-[4px] text-[11px] font-black text-white/25 transition-colors hover:text-[color:var(--color-ver)]"
                    >
                      ✓
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {(restants > 0 || tout) && (
            <button
              type="button"
              onClick={() => setTout((v) => !v)}
              className="mt-[9px] w-full cursor-pointer rounded-[9px] py-[6px] text-[10.5px] font-extrabold tracking-[0.06em] transition-all hover:brightness-125"
              style={{
                color: "rgba(255,255,255,0.45)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {tout ? "RÉDUIRE" : `+ ${restants} DE PLUS`}
            </button>
          )}
        </>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ajouterBlocage(saisie);
          setSaisie("");
        }}
        className="mt-[9px]"
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Ce qui bloque · chez qui"
          aria-label="Ajouter un blocage"
          className="w-full rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px dashed rgba(255,255,255,0.14)",
          }}
        />
      </form>
    </Panel>
  );
}
