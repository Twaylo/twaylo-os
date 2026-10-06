"use client";

import { useEffect, useState } from "react";
import {
  BLOCS,
  couleurObjectif,
  ID_TRANSVERSE,
  NOMS_IMPACT,
  OBJECTIFS_P90,
  RESPONSABLES,
  joursRestants,
  nomObjectif,
  type IdBloc,
  type Impact,
  type MetaTache,
  type Portee,
} from "@/lib/p90";
import { ageEnJours, vieillesse } from "@/lib/age-tache";
import { emojiVisible } from "@/lib/emoji-tache";
import type { TacheVue } from "@/lib/p90-context";
import { Bouton, Champ, Puce, formaterJour } from "@/components/p90/ui";

/**
 * UNE LIGNE DE LA TODO, et son éditeur.
 *
 * La ligne montre ce qui se lit d'un coup d'œil : la case, le titre, et les
 * trois choses qui décident de son rang — objectif, responsable, échéance.
 * Tout le reste (impact, bloc, gel, suppression) vit dans le panneau ⋯, qu'on
 * ouvre quand on veut modifier, c'est-à-dire rarement.
 *
 * Le découpage est délibéré : une liste de vingt lignes où chacune affiche sept
 * champs n'est plus une liste, c'est un tableur — et on ne lit pas un tableur
 * le matin en buvant son café.
 */

/** Le ton d'une échéance : ce qui doit alarmer, et ce qui ne doit pas. */
function tonEcheance(jours: number | null): "neutre" | "accent" | "alerte" | "danger" {
  if (jours === null) return "neutre";
  if (jours < 0) return "danger";
  if (jours === 0) return "danger";
  if (jours <= 2) return "alerte";
  if (jours <= 7) return "accent";
  return "neutre";
}

function texteEcheance(echeance: string | undefined, jours: number | null): string {
  if (!echeance) return "sans date";
  if (jours === null) return formaterJour(echeance);
  if (jours < 0) return `J${jours} · ${formaterJour(echeance)}`;
  if (jours === 0) return `aujourd'hui`;
  if (jours === 1) return `demain`;
  return `J+${jours} · ${formaterJour(echeance)}`;
}

export function LigneTache({
  tache,
  aujourdhui,
  ouvert,
  surOuvrir,
  surBasculer,
  surModifier,
  surSupprimer,
  surGel,
  rowRef,
  surPointerDown,
  tire,
  entree,
}: {
  tache: TacheVue;
  aujourdhui: string;
  ouvert: boolean;
  surOuvrir: (id: string | null) => void;
  surBasculer: () => void;
  surModifier: (patch: { titre?: string; meta?: MetaTache; bloc?: IdBloc }) => void;
  surSupprimer: () => void;
  surGel: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
  surPointerDown: (e: React.PointerEvent, depuisPoignee: boolean) => void;
  tire: boolean;
  entree: boolean;
}) {
  const [renomme, setRenomme] = useState<string | null>(null);

  /* L'animation de validation, armée au clic et désarmée quand elle est jouée. */
  const [fete, setFete] = useState(false);
  useEffect(() => {
    if (!fete) return;
    const t = setTimeout(() => setFete(false), 700);
    return () => clearTimeout(t);
  }, [fete]);

  const jours = joursRestants(tache.meta.echeance, aujourdhui);
  const age = vieillesse(ageEnJours(tache.creeLe, aujourdhui));
  const emoji = emojiVisible(tache.titre);

  const majMeta = (patch: Partial<MetaTache>) => surModifier({ meta: { ...tache.meta, ...patch } });

  return (
    <div
      ref={rowRef}
      className={`${entree ? "entree-ligne" : ""} ${tire ? "opacity-0" : ""}`}
      style={{ transition: "opacity 100ms ease" }}
    >
      <div
        className="group flex items-start gap-[7px] rounded-[8px] px-[4px] py-[5px] transition-colors"
        style={{ background: ouvert ? "rgba(255,255,255,0.05)" : undefined }}
        onPointerDown={(e) => surPointerDown(e, false)}
      >
        {/* La poignée : la seule zone qui ne défile pas sous le doigt. */}
        <span
          className="poignee flex flex-none select-none items-center justify-center text-[13px] leading-none text-[var(--p90-texte-2)] opacity-40 transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => {
            e.stopPropagation();
            surPointerDown(e, true);
          }}
          aria-hidden
        >
          ⠿
        </span>

        {/*
          COCHER DOIT SE VOIR.
          C'est le seul geste de la journée qui dit « c'est fait » — s'il se
          solde par un carré qui change de gris, la todo devient une corvée
          administrative. La case tressaille, le ✓ se trace, une onde part.
          Décocher n'anime rien : on fête l'avancée, pas le retour en arrière.
        */}
        <button
          type="button"
          onClick={() => {
            if (!tache.faite) setFete(true);
            surBasculer();
          }}
          aria-label={tache.faite ? "Décocher" : "Cocher"}
          className={`relative mt-[1px] flex-none cursor-pointer rounded-[6px] transition-all ${fete ? "case-cochee" : ""}`}
          style={{
            width: 18,
            height: 18,
            border: `1px solid ${tache.faite ? "var(--color-ver)" : "rgba(255,255,255,0.16)"}`,
            background: tache.faite ? "var(--color-ver)" : "rgba(255,255,255,0.03)",
            color: "#07121d",
            fontSize: 11,
            lineHeight: "16px",
            fontWeight: 900,
          }}
        >
          {tache.faite ? "✓" : ""}
          {fete && <span className="onde-validation" aria-hidden />}
        </button>

        <div className="min-w-0 flex-1">
          {renomme === null ? (
            <button
              type="button"
              onClick={() => surOuvrir(ouvert ? null : tache.id)}
              className="block w-full cursor-pointer text-left"
            >
              <span
                className={`text-[13px] font-medium leading-[1.35] ${tache.faite ? "line-through opacity-40" : ""}`}
              >
                {emoji && <span className="mr-[5px]">{emoji}</span>}
                {tache.titre}
              </span>
            </button>
          ) : (
            <Champ
              valeur={renomme}
              onChange={setRenomme}
              autoFocus
              className="w-full"
              aria="Renommer la tâche"
              onBlur={() => {
                const propre = renomme.trim();
                if (propre && propre !== tache.titre) surModifier({ titre: propre });
                setRenomme(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenomme(null);
              }}
            />
          )}

          {/* Les trois repères qui décident du rang, et rien d'autre. */}
          <div className="mt-[3px] flex flex-wrap items-center gap-[4px]">
            {tache.meta.objectif && (
              <Puce couleur={couleurObjectif(tache.meta.objectif)}>{nomObjectif(tache.meta.objectif)}</Puce>
            )}
            {tache.meta.responsables.map((r) => (
              <Puce key={r}>{r}</Puce>
            ))}
            <Puce ton={tonEcheance(jours)}>{texteEcheance(tache.meta.echeance, jours)}</Puce>
            {tache.meta.bloque && <Puce ton="danger">bloqué</Puce>}
            {tache.enCours && <Puce ton="accent">en cours</Puce>}
            {tache.gelee && <Puce ton="bleu" titre="Revient tous les jours">❄ quotidien</Puce>}
            {tache.meta.impact === 3 && <Puce ton="corail">impact fort</Puce>}
            {age && !tache.faite && (
              <Puce ton="alerte" titre={age.titre}>
                {age.texte}
              </Puce>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => surOuvrir(ouvert ? null : tache.id)}
          aria-label="Modifier la tâche"
          className="flex-none cursor-pointer rounded-[6px] px-[7px] py-[3px] text-[13px] leading-none text-[var(--p90-texte-2)] opacity-0 transition-opacity group-hover:opacity-100"
        >
          ⋯
        </button>
      </div>

      {/*
        L'ÉDITEUR, déplié sous la ligne et jamais en fenêtre modale.
        Une modale cache la liste : on perd de vue la tâche d'à côté, celle
        dont on voulait justement reprendre la date.
      */}
      {ouvert && !tire && (
        <div className="carte-haute entree-ligne mt-[3px] space-y-[9px] p-[11px]">
          <div className="flex flex-wrap items-center gap-[5px]">
            <span className="w-[72px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">
              Objectif
            </span>
            {OBJECTIFS_P90.map((o) => (
              <Puce
                key={o.id}
                actif={tache.meta.objectif === o.id}
                couleur={o.couleur}
                onClick={() =>
                  majMeta({ objectif: tache.meta.objectif === o.id ? undefined : (o.id as Portee) })
                }
              >
                {o.nom}
              </Puce>
            ))}
            <Puce
              actif={tache.meta.objectif === ID_TRANSVERSE}
              onClick={() =>
                majMeta({
                  objectif: tache.meta.objectif === ID_TRANSVERSE ? undefined : ID_TRANSVERSE,
                })
              }
            >
              Tous
            </Puce>
          </div>

          <div className="flex flex-wrap items-center gap-[5px]">
            <span className="w-[72px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">
              Qui
            </span>
            {RESPONSABLES.map((r) => (
              <Puce
                key={r}
                actif={tache.meta.responsables.includes(r)}
                onClick={() =>
                  majMeta({
                    responsables: tache.meta.responsables.includes(r)
                      ? tache.meta.responsables.filter((x) => x !== r)
                      : [...tache.meta.responsables, r],
                  })
                }
              >
                {r}
              </Puce>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[5px]">
            <span className="w-[72px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">
              Bloc
            </span>
            {BLOCS.map((b) => (
              <Puce
                key={b.id}
                actif={tache.bloc === b.id}
                couleur={b.couleur}
                onClick={() => surModifier({ bloc: b.id })}
                titre={b.plage}
              >
                {b.nom}
              </Puce>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[7px]">
            <span className="w-[72px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">
              Échéance
            </span>
            <Champ
              type="date"
              valeur={tache.meta.echeance ?? ""}
              onChange={(v) => majMeta({ echeance: v || undefined })}
              aria="Échéance"
              className="w-[150px]"
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">
              Impact
            </span>
            {([1, 2, 3] as Impact[]).map((i) => (
              <Puce
                key={i}
                actif={tache.meta.impact === i}
                ton={i === 3 ? "corail" : "neutre"}
                onClick={() => majMeta({ impact: i })}
              >
                {NOMS_IMPACT[i]}
              </Puce>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[6px] border-t pt-[9px]" style={{ borderColor: "var(--p90-bord)" }}>
            <Bouton onClick={() => setRenomme(tache.titre)}>Renommer</Bouton>
            <Bouton onClick={() => majMeta({ bloque: !tache.meta.bloque })}>
              {tache.meta.bloque ? "Débloquer" : "Marquer bloqué"}
            </Bouton>
            <Bouton onClick={surGel} titre="Une tâche gelée revient tous les jours">
              {tache.gelee ? "Dégeler" : "❄ Quotidien"}
            </Bouton>
            <Bouton
              ton="danger"
              onClick={() => {
                surOuvrir(null);
                surSupprimer();
              }}
            >
              Supprimer
            </Bouton>
          </div>
        </div>
      )}
    </div>
  );
}
