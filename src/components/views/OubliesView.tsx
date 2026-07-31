"use client";

import { useEffect, useState } from "react";

import { useOs } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { Chip, EmptyState } from "@/components/ui";
import { NIVEAUX, niveauDepuisUrgence } from "@/lib/types";
import type { TacheOubliee } from "@/lib/oublies-db";

/**
 * LES OUBLIÉS — l'archive vivante de ce qui traîne.
 *
 * Une tâche secondaire ou annexe qui passe quatre jours sans être cochée
 * quitte la todo toute seule et atterrit ici, avec son compteur de jours
 * (J5, J6…). La todo respire, et rien n'est jamais perdu : un oublié se
 * reprend en un clic — son compteur repart de zéro — ou se jette pour de
 * bon, mais ça, c'est toujours un geste volontaire.
 */

/** Plus c'est vieux, plus ça chauffe — même échelle que les blocages. */
function couleurAge(jours: number): string {
  if (jours >= 14) return "var(--color-mag)";
  if (jours >= 7) return "var(--color-cor)";
  return "var(--color-amb)";
}

/* Jeu de démonstration, pour filmer sans exposer les vraies traînantes. */
const DEMO: TacheOubliee[] = [
  { id: "o1", titre: "Répondre au mail de la marque de VPN", categorie: "Business", urgence: "semaine", jours: 12 },
  { id: "o2", titre: "Trier le disque dur des rushs 2025", categorie: null, urgence: "un_jour", jours: 9 },
  { id: "o3", titre: "Tester le nouveau plugin de sous-titres", categorie: "Contenu", urgence: "mois", jours: 5 },
];

export function OubliesView() {
  const { demoMode } = useOs();
  const [oubliees, setOubliees] = useState<TacheOubliee[] | null>(null);

  useEffect(() => {
    if (demoMode) {
      setOubliees(DEMO);
      return;
    }
    let annule = false;
    void fetch("/api/oublies")
      .then((r) => r.json())
      .then((d: { oubliees?: TacheOubliee[] }) => {
        if (!annule) setOubliees(Array.isArray(d.oubliees) ? d.oubliees : []);
      })
      .catch((err) => {
        console.error("[oublies] lecture impossible :", err);
        if (!annule) setOubliees([]);
      });
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /** Retour dans la todo — l'oublié disparaît d'ici, son compteur repart. */
  function reprendre(id: string) {
    setOubliees((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    if (demoMode) return;
    void fetch("/api/oublies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch((err) => console.error("[oublies] reprise impossible :", err));
  }

  function jeter(id: string) {
    setOubliees((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    if (demoMode) return;
    void fetch(`/api/oublies?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[oublies] suppression impossible :", err),
    );
  }

  if (oubliees === null) {
    return (
      <Panel accent="var(--color-cor)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Ouverture de l&apos;archive…
        </div>
      </Panel>
    );
  }

  // Les plus anciens d'abord : ce sont eux qui réclament une décision.
  const triees = [...oubliees].sort((a, b) => b.jours - a.jours);

  return (
    <div className="flex flex-col gap-[14px]">
      <ViewHeader
        title="Les Oubliés"
        subtitle="Ce qui a traîné 4 jours sans être coché atterrit ici — rien ne se perd, tout se décide."
      />

      {triees.length === 0 ? (
        <Panel accent="var(--color-ver)">
          <EmptyState hint="Quand une tâche secondaire ou annexe traînera 4 jours, elle glissera ici toute seule.">
            Rien d&apos;oublié — ta liste est saine. 👌
          </EmptyState>
        </Panel>
      ) : (
        <Panel accent="var(--color-cor)">
          <div className="mb-[10px] flex items-baseline justify-between">
            <span
              className="text-[10px] font-black tracking-[0.12em]"
              style={{ color: "var(--color-cor-soft)" }}
            >
              EN ATTENTE D&apos;UNE DÉCISION
            </span>
            <span className="font-mono text-[11.5px] font-extrabold text-white/40">
              {triees.length}
            </span>
          </div>

          <div className="flex flex-col gap-[8px]">
            {triees.map((o) => {
              const c = couleurAge(o.jours);
              const niveau = NIVEAUX[niveauDepuisUrgence(o.urgence)];
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-[11px] rounded-[12px] px-[12px] py-[9px]"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {/* Le compteur de jours — le cœur de l'archive. */}
                  <span
                    className="flex h-[38px] w-[44px] flex-none items-center justify-center rounded-[10px] font-mono text-[14px] font-black"
                    style={{
                      color: c,
                      background: `color-mix(in srgb, ${c} 12%, transparent)`,
                      border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`,
                    }}
                    title={`En attente depuis ${o.jours} jours`}
                  >
                    J{o.jours}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-extrabold leading-[1.35]">{o.titre}</div>
                    <div className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                      <Chip label={niveau.nom} color={niveau.couleur} />
                      {o.categorie && <Chip label={o.categorie} color="rgba(255,255,255,0.5)" subtle />}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => reprendre(o.id)}
                    title="Remettre dans la todo — le compteur repart de zéro"
                    className="flex-none cursor-pointer rounded-[9px] px-[11px] py-[6px] text-[11.5px] font-extrabold transition-all hover:brightness-125"
                    style={{ color: "#07121d", background: "var(--color-ver)" }}
                  >
                    ↩ Reprendre
                  </button>
                  <button
                    type="button"
                    onClick={() => jeter(o.id)}
                    title="Jeter pour de bon"
                    aria-label={`Jeter ${o.titre}`}
                    className="flex-none cursor-pointer rounded-[9px] px-[9px] py-[6px] text-[11.5px] font-extrabold transition-all hover:brightness-125"
                    style={{
                      color: "var(--color-mag-soft)",
                      background: "rgba(255,61,139,0.1)",
                      border: "1px solid rgba(255,61,139,0.25)",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel accent="rgba(255,255,255,0.15)" size="sm" hover={false}>
        <div className="text-[11.5px] leading-[1.5] text-white/40">
          Comment ça marche : une tâche <b>secondaire</b> ou <b>annexe</b> qui reste 4 jours
          sans coche quitte ta todo et arrive ici. Le <b>focus principal</b> n&apos;est jamais
          touché. « Reprendre » la renvoie dans la todo avec un compteur remis à zéro ;
          rien ne s&apos;efface jamais tout seul.
        </div>
      </Panel>
    </div>
  );
}
