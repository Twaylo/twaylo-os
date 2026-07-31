"use client";

import { useEffect, useState } from "react";

import { useOs } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { Eyebrow, EmptyState } from "@/components/ui";
import { useHeure } from "@/lib/use-heure";
import {
  CATEGORIES_BLOC,
  JOURNEES_DEFAUT,
  blocEnCours,
  type JourneesConfig,
} from "@/lib/journees";

/**
 * La journée type, vue depuis l'accueil : le déroulé du modèle actif avec le
 * bloc « en ce moment » en évidence. Changer de modèle se fait ici même —
 * arriver en déplacement et basculer sa journée doit tenir en un clic —
 * mais l'édition des blocs vit dans l'onglet dédié.
 */
export function JourneeCard() {
  const { demoMode, setActiveTab } = useOs();
  const [config, setConfig] = useState<JourneesConfig | null>(null);
  const heure = useHeure();

  useEffect(() => {
    if (demoMode) {
      setConfig(JOURNEES_DEFAUT);
      return;
    }
    let annule = false;
    void fetch("/api/journees")
      .then((r) => r.json())
      .then((d: { journees?: JourneesConfig }) => {
        if (!annule) setConfig(d.journees ?? JOURNEES_DEFAUT);
      })
      .catch((err) => {
        console.error("[journees] lecture impossible :", err);
        if (!annule) setConfig(JOURNEES_DEFAUT);
      });
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /** Bascule le modèle actif — écran d'abord, base ensuite. */
  function changerModele(id: string) {
    if (!config) return;
    const suivant = { ...config, active: id };
    setConfig(suivant);
    if (demoMode) return;
    void fetch("/api/journees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(suivant),
    }).catch((err) => console.error("[journees] bascule impossible :", err));
  }

  const active = config
    ? (config.liste.find((j) => j.id === config.active) ?? config.liste[0] ?? null)
    : null;
  const courant = active ? blocEnCours(active.blocs, heure) : null;

  return (
    <Panel accent="var(--color-ble)" size="sm">
      <div className="mb-[10px] flex items-center justify-between gap-2">
        <Eyebrow color="var(--color-ble-soft)" dot="var(--color-ble)">
          JOURNÉE TYPE
        </Eyebrow>
        <button
          type="button"
          onClick={() => setActiveTab("Journée type")}
          title="Ouvrir l'onglet Journée type"
          className="cursor-pointer rounded-[7px] px-[8px] py-[3px] text-[10px] font-extrabold text-white/45 transition-all hover:brightness-125"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Modifier →
        </button>
      </div>

      {!config || !active ? (
        <div className="py-4 text-center text-[11.5px] font-bold text-white/30">
          Lecture de ta journée…
        </div>
      ) : (
        <>
          {/* Le choix du modèle : un clic pour passer en mode déplacement. */}
          {config.liste.length > 1 && (
            <div className="mb-[9px] flex flex-wrap gap-[5px]">
              {config.liste.map((j) => {
                const on = j.id === active.id;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => changerModele(j.id)}
                    aria-pressed={on}
                    className="cursor-pointer rounded-full px-[9px] py-[3px] text-[10px] font-extrabold transition-all hover:brightness-125"
                    style={
                      on
                        ? { color: "#07121d", background: "var(--color-ble)" }
                        : {
                            color: "rgba(255,255,255,0.45)",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                          }
                    }
                  >
                    {j.nom}
                  </button>
                );
              })}
            </div>
          )}

          {active.blocs.length === 0 ? (
            <EmptyState hint="Construis-la dans l'onglet Journée type.">
              Cette journée type est vide.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-[4px]">
              {active.blocs.map((b) => {
                const cat = CATEGORIES_BLOC[b.categorie];
                const enCours = b.id === courant;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-[8px] rounded-[9px] px-[8px] py-[5px]"
                    style={{
                      background: enCours
                        ? `color-mix(in srgb, ${cat.couleur} 9%, rgba(255,255,255,0.03))`
                        : "transparent",
                      border: `1px solid ${
                        enCours
                          ? `color-mix(in srgb, ${cat.couleur} 40%, transparent)`
                          : "transparent"
                      }`,
                    }}
                  >
                    <span
                      className="h-[6px] w-[6px] flex-none rounded-full"
                      style={{ background: cat.couleur }}
                      aria-hidden
                    />
                    <span className="w-[38px] flex-none font-mono text-[10.5px] font-black text-white/45">
                      {b.debut}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[11.5px] font-bold"
                      style={{ color: enCours ? "var(--color-fg)" : "rgba(255,255,255,0.7)" }}
                    >
                      {b.titre}
                    </span>
                    {enCours && (
                      <span
                        className="flex flex-none items-center gap-[4px] text-[8.5px] font-black tracking-[0.06em]"
                        style={{ color: cat.couleur }}
                      >
                        <span
                          className="pulse-dot h-[4px] w-[4px] rounded-full"
                          style={{ background: cat.couleur }}
                        />
                        EN CE MOMENT
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
