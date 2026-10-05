"use client";

import { useState } from "react";
import {
  BLOCS,
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
import { Bouton, Champ, Etiq, Meta, Puce, formaterJour } from "@/components/p90/ui";

/**
 * UNE LIGNE DE LA TODO, et son éditeur.
 *
 * La ligne montre ce qui se lit d'un coup d'œil : la case, le titre, et une
 * ligne de gris en dessous — objectif, qui, échéance. Tout le reste (impact,
 * bloc, gel, suppression) vit dans le panneau ⋯, qu'on ouvre quand on veut
 * modifier, c'est-à-dire rarement.
 *
 * Le découpage est délibéré : une liste de vingt lignes où chacune affiche sept
 * champs n'est plus une liste, c'est un tableur — et on ne lit pas un tableur
 * le matin en buvant son café.
 *
 * Même règle pour la couleur : elle ne sert qu'au RETARD. Une tâche datée
 * d'aujourd'hui est le cas normal — une todo n'en contient quasiment que ça —
 * et la peindre en rouge rendait l'écran rouge, donc illisible le jour où une
 * ligne est vraiment en retard.
 */

/**
 * L'échéance en clair, ou rien du tout.
 *
 * Rien, pour une tâche sans date : afficher « sans date » sur les lignes qui
 * n'en ont pas, c'est écrire partout qu'il ne se passe rien. L'absence se lit
 * très bien comme une absence.
 */
function texteEcheance(echeance: string | undefined, jours: number | null): string | null {
  if (!echeance) return null;
  if (jours === null) return formaterJour(echeance);
  if (jours < 0) return `${-jours} j de retard`;
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  return formaterJour(echeance);
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

  const jours = joursRestants(tache.meta.echeance, aujourdhui);
  const echeance = texteEcheance(tache.meta.echeance, jours);
  const enRetard = jours !== null && jours < 0;
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
        style={{ background: ouvert ? "var(--p90-haute)" : undefined }}
        onPointerDown={(e) => surPointerDown(e, false)}
      >
        {/* La poignée : la seule zone qui ne défile pas sous le doigt. */}
        <span
          className="poignee flex flex-none select-none items-center justify-center text-[13px] leading-none text-[var(--p90-texte-2)]"
          onPointerDown={(e) => {
            e.stopPropagation();
            surPointerDown(e, true);
          }}
          aria-hidden
        >
          ⠿
        </span>

        <button
          type="button"
          onClick={surBasculer}
          aria-label={tache.faite ? "Décocher" : "Cocher"}
          className="mt-[1px] flex-none cursor-pointer rounded-[5px] transition-all"
          style={{
            width: 17,
            height: 17,
            border: `1px solid ${tache.faite ? "var(--p90-succes)" : "var(--p90-bord)"}`,
            background: tache.faite ? "var(--p90-succes)" : "transparent",
            color: "#0b0b0c",
            fontSize: 11,
            lineHeight: "15px",
            transitionDuration: "var(--p90-vitesse)",
          }}
        >
          {tache.faite ? "✓" : ""}
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

          {/* Le contexte, en gris, sur une seule ligne. */}
          <Meta
            className="mt-[2px]"
            bouts={[
              tache.meta.objectif ? { texte: nomObjectif(tache.meta.objectif) } : null,
              tache.meta.responsables.length > 0 ? { texte: tache.meta.responsables.join(", ") } : null,
              echeance ? { texte: echeance, ton: enRetard ? "danger" : "neutre", fort: enRetard } : null,
              tache.meta.bloque ? { texte: "bloqué", ton: "danger", fort: true } : null,
              tache.enCours ? { texte: "en cours", ton: "accent" } : null,
              tache.gelee ? { texte: "❄", titre: "Revient tous les jours" } : null,
              age && !tache.faite ? { texte: age.texte, ton: "alerte", titre: age.titre } : null,
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => surOuvrir(ouvert ? null : tache.id)}
          aria-label="Modifier la tâche"
          className="modifier-ligne flex-none cursor-pointer rounded-[6px] px-[7px] py-[3px] text-[13px] leading-none text-[var(--p90-texte-2)]"
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
            <Etiq l="w-[72px]">Objectif</Etiq>
            {OBJECTIFS_P90.map((o) => (
              <Puce
                key={o.id}
                actif={tache.meta.objectif === o.id}
                ton={o.id === "momentum" ? "accent" : "neutre"}
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
            <Etiq l="w-[72px]">Qui</Etiq>
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
            <Etiq l="w-[72px]">Bloc</Etiq>
            {BLOCS.map((b) => (
              <Puce
                key={b.id}
                actif={tache.bloc === b.id}
                onClick={() => surModifier({ bloc: b.id })}
                titre={b.plage}
              >
                {b.nom}
              </Puce>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[7px]">
            <Etiq l="w-[72px]">Échéance</Etiq>
            <Champ
              type="date"
              valeur={tache.meta.echeance ?? ""}
              onChange={(v) => majMeta({ echeance: v || undefined })}
              aria="Échéance"
              className="w-[150px]"
            />
            <Etiq l="">Impact</Etiq>
            {([1, 2, 3] as Impact[]).map((i) => (
              <Puce
                key={i}
                actif={tache.meta.impact === i}
                ton={i === 3 ? "alerte" : "neutre"}
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
