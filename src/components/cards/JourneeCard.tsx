"use client";

import { useState } from "react";

import { useOs } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { Eyebrow, EmptyState } from "@/components/ui";
import { useHeure } from "@/lib/use-heure";
import {
  CATEGORIES_BLOC,
  blocEnCours,
  type BlocJournee,
  type CategorieBloc,
} from "@/lib/journees";

/**
 * La journée type, depuis l'accueil — les immuables de Twaylo.
 *
 * Deux modes sur la même carte. Au quotidien : une checklist — les blocs du
 * modèle actif se cochent au fil de la journée, le bloc « en ce moment » est
 * surligné, et changer de modèle (maison → déplacement) tient en un clic.
 * En mode ✎ : tout se modifie SUR la carte — heures, intitulés, catégories,
 * ajout, suppression — sans passer par l'onglet.
 *
 * Les coches vivent dans l'état central (os-context) : la même liste apparaît
 * dans la carte Tâches clés, et cocher ici coche là-bas. Le modèle, lui, ne se
 * remet jamais à zéro — seules les coches repartent vierges chaque matin.
 */
export function JourneeCard() {
  const { journees, majJournees, blocsFaits, basculerBlocFait } = useOs();
  const [edition, setEdition] = useState(false);
  const [ajout, setAjout] = useState({ debut: "", titre: "" });
  const heure = useHeure();

  const active = journees
    ? (journees.liste.find((j) => j.id === journees.active) ?? journees.liste[0] ?? null)
    : null;
  const courant = active && !edition ? blocEnCours(active.blocs, heure) : null;
  const faits = active
    ? active.blocs.filter((b) => blocsFaits.includes(b.id)).length
    : 0;

  function majBlocs(blocs: BlocJournee[]) {
    if (!journees || !active) return;
    majJournees({
      ...journees,
      liste: journees.liste.map((j) =>
        j.id === active.id
          ? { ...j, blocs: [...blocs].sort((a, b) => a.debut.localeCompare(b.debut)) }
          : j,
      ),
    });
  }

  function majBloc(id: string, patch: Partial<BlocJournee>) {
    if (!active) return;
    majBlocs(active.blocs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function ajouterBloc() {
    if (!active || !ajout.titre.trim() || !ajout.debut) return;
    let n = 0;
    while (active.blocs.some((b) => b.id === `b${n}`)) n++;
    majBlocs([
      ...active.blocs,
      {
        id: `b${n}`,
        debut: ajout.debut,
        fin: "",
        titre: ajout.titre.trim().slice(0, 80),
        categorie: "creation",
        habitude: "",
        habitudeOption: "",
      },
    ]);
    setAjout({ debut: "", titre: "" });
  }

  return (
    <Panel accent="var(--color-ble)" size="sm">
      <div className="mb-[9px] flex items-center justify-between gap-2">
        <Eyebrow color="var(--color-ble-soft)" dot="var(--color-ble)">
          JOURNÉE TYPE
        </Eyebrow>
        <span className="flex items-center gap-[7px]">
          {active && active.blocs.length > 0 && (
            <span
              className="font-mono text-[11px] font-extrabold"
              style={{ color: "var(--color-ble-soft)" }}
            >
              {faits}/{active.blocs.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEdition((v) => !v)}
            aria-pressed={edition}
            title={edition ? "Fin des modifications" : "Modifier la journée type sur place"}
            className="cursor-pointer rounded-[7px] px-[8px] py-[3px] text-[11px] font-extrabold transition-all hover:brightness-125"
            style={
              edition
                ? { color: "#07121d", background: "var(--color-ble)" }
                : {
                    color: "rgba(255,255,255,0.45)",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }
            }
          >
            {edition ? "OK ✓" : "✎"}
          </button>
        </span>
      </div>

      {!journees || !active ? (
        <div className="py-4 text-center text-[11.5px] font-bold text-white/30">
          Lecture de ta journée…
        </div>
      ) : (
        <>
          {/* Le choix du modèle : partir en déplacement = un clic. */}
          <div className="mb-[9px] flex flex-wrap gap-[5px]">
            {journees.liste.map((j) => {
              const on = j.id === active.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => majJournees({ ...journees, active: j.id })}
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

          {active.blocs.length === 0 && !edition ? (
            <EmptyState hint="Passe en ✎ pour construire ta journée.">
              Cette journée type est vide.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-[4px]">
              {active.blocs.map((b) =>
                edition ? (
                  <LigneEdition
                    key={b.id}
                    bloc={b}
                    onMaj={(patch) => majBloc(b.id, patch)}
                    onSupprimer={() => majBlocs(active.blocs.filter((x) => x.id !== b.id))}
                  />
                ) : (
                  <LigneCoche
                    key={b.id}
                    bloc={b}
                    fait={blocsFaits.includes(b.id)}
                    enCours={b.id === courant}
                    onToggle={() => basculerBlocFait(b.id)}
                  />
                ),
              )}
            </div>
          )}

          {edition && (
            <form
              className="mt-[7px] flex items-center gap-[6px]"
              onSubmit={(e) => {
                e.preventDefault();
                ajouterBloc();
              }}
            >
              <input
                type="time"
                value={ajout.debut}
                onChange={(e) => setAjout((a) => ({ ...a, debut: e.target.value }))}
                aria-label="Heure du nouveau bloc"
                className="rounded-[7px] px-[5px] py-[4px] font-mono text-[11px] font-bold text-white outline-none [color-scheme:dark]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)" }}
              />
              <input
                value={ajout.titre}
                onChange={(e) => setAjout((a) => ({ ...a, titre: e.target.value }))}
                placeholder="+ nouveau bloc immuable"
                aria-label="Intitulé du nouveau bloc"
                className="min-w-0 flex-1 rounded-[7px] px-[8px] py-[4px] text-[11.5px] font-semibold text-white outline-none"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.13)" }}
              />
              <button
                type="submit"
                disabled={!ajout.titre.trim() || !ajout.debut}
                className="cursor-pointer rounded-[7px] px-[9px] py-[4px] text-[11px] font-extrabold transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ color: "#07121d", background: "var(--color-ble)" }}
              >
                +
              </button>
            </form>
          )}
        </>
      )}
    </Panel>
  );
}

/** La ligne du quotidien : on coche, comme une habitude qui revient chaque jour. */
function LigneCoche({
  bloc,
  fait,
  enCours,
  onToggle,
}: {
  bloc: BlocJournee;
  fait: boolean;
  enCours: boolean;
  onToggle: () => void;
}) {
  const cat = CATEGORIES_BLOC[bloc.categorie];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={fait}
      className="flex w-full cursor-pointer items-center gap-[8px] rounded-[9px] px-[8px] py-[5px] text-left transition-all hover:brightness-125"
      style={{
        background: enCours
          ? `color-mix(in srgb, ${cat.couleur} 9%, rgba(255,255,255,0.03))`
          : fait
            ? "rgba(255,255,255,0.02)"
            : "rgba(255,255,255,0.035)",
        border: `1px solid ${
          enCours
            ? `color-mix(in srgb, ${cat.couleur} 40%, transparent)`
            : "rgba(255,255,255,0.06)"
        }`,
      }}
    >
      <span
        className="flex h-[16px] w-[16px] flex-none items-center justify-center rounded-[5px] text-[10px] font-black text-[#07121d]"
        style={{
          background: fait ? cat.couleur : "transparent",
          border: `2px solid ${fait ? cat.couleur : "rgba(255,255,255,0.22)"}`,
        }}
      >
        {fait && "✓"}
      </span>
      <span className="w-[36px] flex-none font-mono text-[10px] font-black text-white/40">
        {bloc.debut}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[11.5px] font-bold"
        style={{
          color: fait ? "rgba(255,255,255,0.35)" : "var(--color-fg)",
          textDecoration: fait ? "line-through" : "none",
        }}
      >
        {bloc.titre}
      </span>
      {enCours && !fait && (
        <span
          className="flex flex-none items-center gap-[4px] text-[8.5px] font-black tracking-[0.06em]"
          style={{ color: cat.couleur }}
        >
          <span className="pulse-dot h-[4px] w-[4px] rounded-full" style={{ background: cat.couleur }} />
          MAINTENANT
        </span>
      )}
    </button>
  );
}

/** La ligne du mode ✎ : tout se règle sur place. */
function LigneEdition({
  bloc,
  onMaj,
  onSupprimer,
}: {
  bloc: BlocJournee;
  onMaj: (patch: Partial<BlocJournee>) => void;
  onSupprimer: () => void;
}) {
  const cat = CATEGORIES_BLOC[bloc.categorie];
  return (
    <div
      className="flex items-center gap-[6px] rounded-[9px] px-[7px] py-[4px]"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <input
        type="time"
        value={bloc.debut}
        onChange={(e) => e.target.value && onMaj({ debut: e.target.value })}
        aria-label="Heure du bloc"
        className="rounded-[6px] px-[4px] py-[2px] font-mono text-[10.5px] font-bold text-white outline-none [color-scheme:dark]"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      />
      <input
        value={bloc.titre}
        onChange={(e) => onMaj({ titre: e.target.value.slice(0, 80) })}
        aria-label="Intitulé du bloc"
        className="min-w-0 flex-1 rounded-[6px] px-[6px] py-[3px] text-[11.5px] font-bold text-white outline-none focus:border-white/25"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      />
      <select
        value={bloc.categorie}
        onChange={(e) => onMaj({ categorie: e.target.value as CategorieBloc })}
        aria-label="Catégorie du bloc"
        title={cat.nom}
        className="w-[64px] flex-none cursor-pointer rounded-[6px] px-[3px] py-[2px] text-[10px] font-extrabold outline-none [color-scheme:dark]"
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
        onClick={onSupprimer}
        title={`Retirer ${bloc.titre}`}
        aria-label={`Retirer ${bloc.titre}`}
        className="cursor-pointer px-[3px] text-[12px] font-black text-white/20 transition-colors hover:text-[color:var(--color-mag-soft)]"
      >
        ×
      </button>
    </div>
  );
}
