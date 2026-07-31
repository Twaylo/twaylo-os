"use client";

import { useEffect, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { EmptyState } from "@/components/ui";
import { useHeure } from "@/lib/use-heure";
import {
  CATEGORIES_BLOC,
  JOURNEES_DEFAUT,
  blocEnCours,
  type BlocJournee,
  type CategorieBloc,
  type JourneesConfig,
  type JourneeType,
} from "@/lib/journees";

/**
 * JOURNÉE TYPE — le déroulé idéal, en plusieurs versions.
 *
 * La journée de Twaylo change avec ses déplacements : un modèle « maison »,
 * un modèle « terrain », et autant d'autres qu'il en faut. Tout s'édite sur
 * place (heures, titres, catégories), se duplique en un geste, et le bloc en
 * cours est surligné en direct — la journée type n'est pas un tableau figé,
 * c'est la boussole du moment.
 */

/**
 * Un identifiant libre : le premier numéro non pris. Déterministe — dérivé de
 * la liste elle-même, pas d'une horloge — donc rejouable sans collision.
 */
function idLibre(prefixe: string, existants: { id: string }[]): string {
  let n = 0;
  while (existants.some((e) => e.id === `${prefixe}${n}`)) n++;
  return `${prefixe}${n}`;
}

export function JourneeTypeView() {
  const { demoMode } = useOs();
  const [config, setConfig] = useState<JourneesConfig | null>(null);
  const [nouvelle, setNouvelle] = useState("");
  const [renommage, setRenommage] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /** Écran tout de suite, base derrière (débouncée) — le geste maison. */
  function appliquer(next: JourneesConfig) {
    // Les blocs restent triés par heure de début : déplacer un bloc, c'est
    // changer son heure.
    next = {
      ...next,
      liste: next.liste.map((j) => ({
        ...j,
        blocs: [...j.blocs].sort((a, b) => a.debut.localeCompare(b.debut)),
      })),
    };
    setConfig(next);
    if (demoMode) return;
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      void fetch("/api/journees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      }).catch((err) => console.error("[journees] enregistrement impossible :", err));
    }, 600);
  }

  if (!config) {
    return (
      <Panel accent="var(--color-ble)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Lecture de tes journées types…
        </div>
      </Panel>
    );
  }

  const active =
    config.liste.find((j) => j.id === config.active) ?? config.liste[0];

  function majJournee(id: string, patch: Partial<JourneeType>) {
    appliquer({
      ...config!,
      liste: config!.liste.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    });
  }

  function ajouterJournee() {
    const nom = nouvelle.trim();
    if (!nom) return;
    const id = idLibre("j", config!.liste);
    appliquer({
      active: id,
      liste: [...config!.liste, { id, nom: nom.slice(0, 40), blocs: [] }],
    });
    setNouvelle("");
  }

  function dupliquerJournee(j: JourneeType) {
    const id = idLibre("j", config!.liste);
    appliquer({
      active: id,
      liste: [
        ...config!.liste,
        {
          id,
          nom: `${j.nom} (copie)`.slice(0, 40),
          blocs: j.blocs.map((b, i) => ({ ...b, id: `${id}-b${i}` })),
        },
      ],
    });
  }

  function supprimerJournee(id: string) {
    if (config!.liste.length <= 1) return;
    const liste = config!.liste.filter((j) => j.id !== id);
    appliquer({ liste, active: liste[0].id });
  }

  const courant = active ? blocEnCours(active.blocs, heure) : null;

  return (
    <div className="flex flex-col gap-[14px]">
      <ViewHeader
        title="Journée type"
        subtitle="Le déroulé idéal — un modèle par contexte, modifiable à mesure que ça bouge."
      />

      {/* Le choix du modèle : maison, déplacement, et tous les autres. */}
      <Panel accent="var(--color-ble)">
        <div className="flex flex-wrap items-center gap-[8px]">
          {config.liste.map((j) => {
            const on = j.id === active?.id;
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => appliquer({ ...config, active: j.id })}
                aria-pressed={on}
                className="cursor-pointer rounded-full px-[13px] py-[6px] text-[12.5px] font-extrabold transition-all hover:brightness-125"
                style={
                  on
                    ? { color: "#07121d", background: "var(--color-ble)" }
                    : {
                        color: "rgba(255,255,255,0.55)",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }
                }
              >
                {j.nom}
              </button>
            );
          })}

          <form
            className="flex items-center gap-[6px]"
            onSubmit={(e) => {
              e.preventDefault();
              ajouterJournee();
            }}
          >
            <input
              value={nouvelle}
              onChange={(e) => setNouvelle(e.target.value)}
              placeholder="+ nouvelle journée type"
              aria-label="Nouvelle journée type"
              className="w-[180px] rounded-full px-[12px] py-[6px] text-[12px] font-semibold text-white outline-none transition-colors focus:border-white/25"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px dashed rgba(255,255,255,0.15)",
              }}
            />
          </form>

          {active && (
            <span className="ml-auto flex items-center gap-[6px]">
              {renommage === active.id ? (
                <input
                  autoFocus
                  defaultValue={active.nom}
                  aria-label="Renommer la journée type"
                  onBlur={(e) => {
                    const nom = e.target.value.trim();
                    if (nom) majJournee(active.id, { nom: nom.slice(0, 40) });
                    setRenommage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenommage(null);
                  }}
                  className="w-[160px] rounded-[8px] px-[9px] py-[5px] text-[12px] font-bold text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                />
              ) : (
                <ActionJournee label="Renommer" onClick={() => setRenommage(active.id)} />
              )}
              <ActionJournee label="Dupliquer" onClick={() => dupliquerJournee(active)} />
              {config.liste.length > 1 && (
                <ActionJournee
                  label="Supprimer"
                  danger
                  onClick={() => supprimerJournee(active.id)}
                />
              )}
            </span>
          )}
        </div>
      </Panel>

      {active && (
        <TimelineJournee
          journee={active}
          heure={heure}
          courant={courant}
          onMaj={(blocs) => majJournee(active.id, { blocs })}
        />
      )}
    </div>
  );
}

function ActionJournee({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-[8px] px-[10px] py-[5px] text-[11px] font-extrabold transition-all hover:brightness-125"
      style={
        danger
          ? {
              color: "var(--color-mag-soft)",
              background: "rgba(255,61,139,0.1)",
              border: "1px solid rgba(255,61,139,0.25)",
            }
          : {
              color: "rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
            }
      }
    >
      {label}
    </button>
  );
}

/* ================================================================== */
/* La frise des blocs — éditable sur place                             */
/* ================================================================== */

function TimelineJournee({
  journee,
  heure,
  courant,
  onMaj,
}: {
  journee: JourneeType;
  heure: string;
  courant: string | null;
  onMaj: (blocs: BlocJournee[]) => void;
}) {
  const [ajout, setAjout] = useState({ debut: "", titre: "", categorie: "creation" as CategorieBloc });

  function majBloc(id: string, patch: Partial<BlocJournee>) {
    onMaj(journee.blocs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function supprimerBloc(id: string) {
    onMaj(journee.blocs.filter((b) => b.id !== id));
  }

  function ajouterBloc() {
    const titre = ajout.titre.trim();
    if (!titre || !ajout.debut) return;
    onMaj([
      ...journee.blocs,
      {
        id: idLibre("b", journee.blocs),
        debut: ajout.debut,
        fin: "",
        titre: titre.slice(0, 80),
        categorie: ajout.categorie,
      },
    ]);
    setAjout((a) => ({ ...a, debut: "", titre: "" }));
  }

  const amplitude =
    journee.blocs.length > 0
      ? `${journee.blocs[0].debut} → ${
          journee.blocs[journee.blocs.length - 1].fin ||
          journee.blocs[journee.blocs.length - 1].debut
        }`
      : "";

  return (
    <Panel accent="var(--color-ble)" size="sm">
      <div className="mb-[10px] flex flex-wrap items-baseline justify-between gap-[8px]">
        <span
          className="text-[10px] font-black tracking-[0.12em]"
          style={{ color: "var(--color-ble-soft)" }}
        >
          {journee.nom.toUpperCase()} <span className="opacity-55">{journee.blocs.length} blocs</span>
        </span>
        {amplitude && (
          <span className="font-mono text-[11px] font-bold text-white/35">
            {amplitude}
            {heure && <span className="ml-[10px]">· il est {heure}</span>}
          </span>
        )}
      </div>

      {journee.blocs.length === 0 ? (
        <EmptyState hint="Ajoute ton premier bloc en dessous — heure, intitulé, catégorie.">
          Cette journée type est vide.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {journee.blocs.map((b) => {
            const cat = CATEGORIES_BLOC[b.categorie];
            const enCours = b.id === courant;
            return (
              <div
                key={b.id}
                className="group flex flex-wrap items-center gap-[8px] rounded-[11px] px-[10px] py-[7px]"
                style={{
                  background: enCours
                    ? `color-mix(in srgb, ${cat.couleur} 8%, rgba(255,255,255,0.03))`
                    : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    enCours
                      ? `color-mix(in srgb, ${cat.couleur} 45%, transparent)`
                      : "rgba(255,255,255,0.07)"
                  }`,
                }}
              >
                <span
                  className="h-[26px] w-[3px] flex-none rounded-full"
                  style={{ background: cat.couleur }}
                  aria-hidden
                />
                <input
                  type="time"
                  value={b.debut}
                  onChange={(e) => e.target.value && majBloc(b.id, { debut: e.target.value })}
                  aria-label="Heure de début"
                  className="rounded-[7px] px-[6px] py-[3px] font-mono text-[12px] font-bold text-white outline-none [color-scheme:dark]"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
                <span className="text-[11px] text-white/25">→</span>
                <input
                  type="time"
                  value={b.fin}
                  onChange={(e) => majBloc(b.id, { fin: e.target.value })}
                  aria-label="Heure de fin (optionnelle)"
                  className="rounded-[7px] px-[6px] py-[3px] font-mono text-[12px] font-bold text-white/70 outline-none [color-scheme:dark]"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <input
                  value={b.titre}
                  onChange={(e) => majBloc(b.id, { titre: e.target.value.slice(0, 80) })}
                  aria-label="Intitulé du bloc"
                  className="min-w-[140px] flex-1 rounded-[7px] px-[8px] py-[4px] text-[12.5px] font-bold text-white outline-none transition-colors focus:border-white/25"
                  style={{ background: "transparent", border: "1px solid transparent" }}
                  onFocus={(e) => (e.target.style.background = "rgba(255,255,255,0.05)")}
                  onBlur={(e) => (e.target.style.background = "transparent")}
                />
                {enCours && (
                  <span
                    className="flex flex-none items-center gap-[5px] rounded-full px-[8px] py-[2px] text-[9px] font-black tracking-[0.08em]"
                    style={{
                      color: cat.couleur,
                      background: `color-mix(in srgb, ${cat.couleur} 14%, transparent)`,
                    }}
                  >
                    <span className="pulse-dot h-[5px] w-[5px] rounded-full" style={{ background: cat.couleur }} />
                    EN CE MOMENT
                  </span>
                )}
                <select
                  value={b.categorie}
                  onChange={(e) => majBloc(b.id, { categorie: e.target.value as CategorieBloc })}
                  aria-label="Catégorie du bloc"
                  className="flex-none cursor-pointer rounded-[7px] px-[6px] py-[3px] text-[10.5px] font-extrabold outline-none [color-scheme:dark]"
                  style={{
                    color: cat.couleur,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {Object.entries(CATEGORIES_BLOC).map(([id, c]) => (
                    <option key={id} value={id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => supprimerBloc(b.id)}
                  title="Retirer ce bloc"
                  aria-label={`Retirer ${b.titre}`}
                  className="cursor-pointer px-[4px] text-[12px] font-black text-white/15 opacity-0 transition-all hover:text-[color:var(--color-mag-soft)] group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* L'ajout d'un bloc : une heure, un intitulé, c'est parti. */}
      <form
        className="mt-[9px] flex flex-wrap items-center gap-[8px]"
        onSubmit={(e) => {
          e.preventDefault();
          ajouterBloc();
        }}
      >
        <input
          type="time"
          value={ajout.debut}
          onChange={(e) => setAjout((a) => ({ ...a, debut: e.target.value }))}
          aria-label="Heure de début du nouveau bloc"
          className="rounded-[8px] px-[7px] py-[5px] font-mono text-[12px] font-bold text-white outline-none [color-scheme:dark]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)" }}
        />
        <input
          value={ajout.titre}
          onChange={(e) => setAjout((a) => ({ ...a, titre: e.target.value }))}
          placeholder="+ nouveau bloc (ex. Écriture shorts)"
          aria-label="Intitulé du nouveau bloc"
          className="min-w-[180px] flex-1 rounded-[8px] px-[9px] py-[6px] text-[12px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.13)" }}
        />
        <select
          value={ajout.categorie}
          onChange={(e) => setAjout((a) => ({ ...a, categorie: e.target.value as CategorieBloc }))}
          aria-label="Catégorie du nouveau bloc"
          className="cursor-pointer rounded-[8px] px-[7px] py-[5px] text-[11px] font-extrabold text-white/70 outline-none [color-scheme:dark]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)" }}
        >
          {Object.entries(CATEGORIES_BLOC).map(([id, c]) => (
            <option key={id} value={id}>
              {c.nom}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!ajout.titre.trim() || !ajout.debut}
          className="cursor-pointer rounded-[8px] px-[12px] py-[6px] text-[12px] font-extrabold transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ color: "#07121d", background: "var(--color-ble)" }}
        >
          Ajouter
        </button>
      </form>
    </Panel>
  );
}
