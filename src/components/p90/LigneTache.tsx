"use client";

import { useEffect, useRef, useState } from "react";
import { estPause, heureEnTete, joursRestants, type IdBloc, type MetaTache } from "@/lib/p90";
import { emojiVisible, sansEmoji } from "@/lib/emoji-tache";
import type { TacheVue } from "@/lib/p90-context";
import { Champ, Coche, Depliant, Eclats, formaterJour } from "@/components/p90/ui";

/**
 * UNE LIGNE DE TODO — et c'est la ligne ENTIÈRE qui coche.
 *
 * C'est le geste le plus fréquent de l'OS, plusieurs dizaines de fois par
 * jour : tout le rectangle répond, l'intitulé compris. Les autres actions ne
 * peuvent pas se confondre avec lui — la poignée ⠿ à gauche range, le bouton
 * ⋯ à droite ouvre le reste.
 *
 * EN VERRE, ET PLUS GRANDE : 52 px de haut, une case ronde de 26 px comme les
 * Rappels d'Apple — la demande « cases plus grandes, plus user friendly ».
 *
 * UNE SEULE INFORMATION À DROITE. Il y en avait jusqu'à quatre (l'âge, l'état,
 * l'objectif, l'échéance), et sur une tâche notée sans date elles se
 * répétaient : « 20j » en rouge et « 20J DE RETARD » en magenta pour la même
 * chose. Il reste le flocon d'une tâche gelée et l'échéance — une VRAIE
 * échéance, posée exprès.
 *
 * DEUX APPUIS RAPPROCHÉS GÈLENT LA TÂCHE. Le premier a déjà coché, et c'est
 * volontaire : retarder la coche de 300 ms pour guetter un second appui
 * rendrait poussif le geste le plus fréquent. Le second annule donc le premier
 * avant de geler.
 */

/** `navigator.vibrate` n'est pas dans tous les typages ; on le décrit ici. */
type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

/**
 * Ce que l'échéance raconte, et sa couleur — ou rien.
 *
 * Une échéance égale au jour de création n'en est pas une : c'est l'ancienne
 * date posée d'office sur toute tâche tapée. Elle faisait passer « en retard »
 * dès le lendemain tout ce qui n'avait pas été fait le jour même, et la liste
 * entière finissait en magenta. On ne parle que des dates choisies.
 */
function echeanceEnClair(
  tache: TacheVue,
  aujourdhui: string,
): { texte: string; couleur: string } | null {
  const e = tache.meta.echeance;
  if (!e || e === tache.creeLe) return null;
  const jours = joursRestants(e, aujourdhui);
  if (jours === null) return null;
  if (jours < 0) return { texte: `${-jours} j de retard`, couleur: "var(--color-mag)" };
  if (jours === 0) return { texte: "Aujourd'hui", couleur: "var(--color-amb)" };
  if (jours === 1) return { texte: "Demain", couleur: "var(--color-amb)" };
  return { texte: formaterJour(e), couleur: "rgba(255,255,255,0.6)" };
}

export function LigneTache({
  tache,
  aujourdhui,
  couleur,
  autreListe,
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
  rang = 0,
  intensite = 0,
}: {
  tache: TacheVue;
  aujourdhui: string;
  /** La couleur de la liste : c'est elle qui remplit la case cochée. */
  couleur: string;
  /** L'autre liste, pour le bouton « Passer en … » du panneau. */
  autreListe: { nom: string; bloc: IdBloc };
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
  /** Son rang dans la colonne — il règle le retard de l'animation d'entrée. */
  rang?: number;
  /** Proportion de la journée déjà faite, 0 à 1. Elle règle la démesure. */
  intensite?: number;
}) {
  const [renomme, setRenomme] = useState<string | null>(null);

  /*
   * L'animation de validation, en quatre paliers calés sur la proportion de
   * tâches faites : discrète au réveil, spectaculaire quand la journée est
   * pliée. Une explosion à chaque case deviendrait une punition.
   */
  const palier = intensite >= 0.85 ? 3 : intensite >= 0.6 ? 2 : intensite >= 0.3 ? 1 : 0;
  const [anime, setAnime] = useState(false);
  const precedent = useRef(tache.faite);

  useEffect(() => {
    // On n'anime qu'au passage de non-fait à fait, et jamais au premier rendu
    // (sinon toute la liste s'agite au chargement de la page).
    if (tache.faite && !precedent.current) {
      setAnime(true);
      const t = setTimeout(() => setAnime(false), 700 + palier * 250);
      precedent.current = tache.faite;
      return () => clearTimeout(t);
    }
    precedent.current = tache.faite;
  }, [tache.faite, palier]);

  /** Le dernier appui, pour reconnaître le double. */
  const dernierTap = useRef(0);

  /*
   * L'INTITULÉ, découpé pour l'affichage seulement.
   *
   * L'emoji choisi est rangé EN TÊTE du titre : l'afficher devant le titre
   * complet le montrait deux fois (« 🎬 🎬 Tourner »). On l'ôte du texte, et
   * l'heure tapée devant (« 14h : lire ») part dans sa bulle.
   */
  const emoji = emojiVisible(tache.titre);
  const { heure, reste } = heureEnTete(sansEmoji(tache.titre));
  const echeance = echeanceEnClair(tache, aujourdhui);

  const clic = () => {
    const maintenant = Date.now();
    const suite = maintenant - dernierTap.current < 380;
    if (suite) {
      dernierTap.current = 0;
      surBasculer();
      surGel();
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        (navigator as NavVibr).vibrate?.([10, 40, 10]);
      }
      return;
    }
    dernierTap.current = maintenant;
    surBasculer();
  };

  return (
    <div
      ref={rowRef}
      // La clé que suit le glissement de la liste (voir `use-flip.ts`).
      data-cle={tache.cle ?? tache.id}
      className={`rangee ${entree ? "tache-entree" : ""}`}
      style={entree ? ({ "--retard": `${Math.min(rang, 10) * 35}ms` } as React.CSSProperties) : undefined}
    >
      <div
        className={`group relative flex items-stretch gap-[4px] ${tache.gelee ? "tache-gelee" : ""} ${
          estPause(tache.titre) ? "ligne-pause" : ""
        } ${
          tire ? "opacity-0" : ""
        }`}
        onPointerDown={(e) => surPointerDown(e, false)}
      >
        {/*
          La poignée. Toujours visible — le survol n'existe pas au doigt — et
          seule prise qui porte `touch-action: none` : c'est d'elle que part un
          rangement sans que le navigateur confisque le geste pour défiler.
        */}
        <button
          type="button"
          aria-label={`Déplacer ${tache.titre}`}
          title="Glisser pour ranger, ou pour changer de liste"
          onPointerDown={(e) => {
            e.stopPropagation();
            surPointerDown(e, true);
          }}
          className="poignee poignee-tache flex flex-none items-center justify-center text-[13px] leading-none text-white/30 transition-colors hover:text-white/70"
          style={{ cursor: tire ? "grabbing" : "grab" }}
        >
          ⠿
        </button>

        <div className="ligne-tache relative min-w-0 flex-1">
          {renomme === null ? (
            <button
              type="button"
              onClick={clic}
              aria-pressed={tache.faite}
              // Plus de boîte par ligne : une rangée de liste groupée, séparée
              // de la précédente par un filet (voir `.rangee` dans globals.css).
              className={`check-row relative ${anime ? `ligne-validee niveau-${palier}` : ""}`}
            >
              {anime && (
                <>
                  <span
                    className="onde-validation"
                    aria-hidden
                    style={{
                      boxShadow: `0 0 0 ${1 + palier}px ${couleur}, 0 0 ${18 + palier * 14}px ${
                        2 + palier * 3
                      }px ${couleur}`,
                    }}
                  />
                  {/* Des éclats seulement quand la journée se plie, et sans
                      le balayage blanc : la fête reste, la kermesse part. */}
                  {palier >= 2 && (
                    <Eclats nombre={palier === 2 ? 8 : 12} portee={palier === 2 ? 40 : 58} couleur={couleur} />
                  )}
                </>
              )}

              <span
                className={`case-ronde ${anime ? "case-cochee" : ""}`}
                style={
                  tache.faite
                    ? { background: couleur, borderColor: couleur }
                    : undefined
                }
              >
                {tache.faite && <Coche trace={anime} taille={12} />}
              </span>

              {heure && <span className="bulle-heure">{heure}</span>}

              {/*
                L'intitulé, et l'échéance SOUS lui — comme dans les Rappels
                d'Apple. Posée à droite, elle mangeait la largeur : sur 390 px,
                « Doublages BN et EN du doc » se coupait sur trois lignes.
              */}
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[14px] font-medium leading-[1.3]"
                  style={{
                    color: tache.faite ? "rgba(255,255,255,0.38)" : "var(--color-fg)",
                    textDecoration: tache.faite ? "line-through" : "none",
                  }}
                >
                  {emoji && <span className="mr-[6px]">{emoji}</span>}
                  {reste || (heure ? "" : sansEmoji(tache.titre))}
                </span>
                {echeance && !tache.faite && (
                  <span
                    className="nombres mt-[1px] block text-[12px] font-medium leading-[1.2]"
                    style={{ color: echeance.couleur }}
                  >
                    {echeance.texte}
                  </span>
                )}
              </span>

              {tache.gelee && (
                <span title="Gelée : elle revient tous les jours" className="flex-none text-[12px] leading-none">
                  ❄️
                </span>
              )}

            </button>
          ) : (
            // Sélectionner du texte dans le champ ne doit pas armer un
            // glissement de la ligne : le geste s'arrête ici.
            <div onPointerDown={(e) => e.stopPropagation()}>
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
            </div>
          )}

          {renomme === null && (
            <button
              type="button"
              // La ligne entière arme un déplacement : sans cette coupure,
              // viser le bouton en bougeant un peu le doigt partirait en
              // glissement.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => surOuvrir(ouvert ? null : tache.id)}
              aria-expanded={ouvert}
              aria-label={`Actions sur ${tache.titre}`}
              title="Geler, échéance, changer de liste, renommer, supprimer"
              className="bouton-ligne absolute right-[4px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-[16px] font-bold leading-none text-white/70 transition-all hover:bg-white/10 hover:text-white"
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/*
        LE PANNEAU ⋯, RÉDUIT À CINQ GESTES.

        Il en portait une quarantaine — objectif, responsables, une palette de
        trente-trois emojis, quatre blocs, l'impact, « bloqué » — et Twaylo l'a
        dit sans détour : « trop d'infos, tej des options ». Restent les gestes
        qu'on fait vraiment. Les données des réglages retirés restent en base,
        intactes : rien n'est perdu, c'est l'écran qui s'allège.
      */}
      {/* Il se DÉPLIE au lieu d'apparaître d'un coup (voir `Depliant`). */}
      <Depliant ouvert={ouvert && !tire}>
        <div
          className="sas-in mb-[6px] ml-[22px] mt-[2px] flex flex-wrap items-center gap-[6px] rounded-[14px] p-[8px]"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            type="button"
            onClick={surGel}
            className="capsule"
            style={
              tache.gelee
                ? { color: "var(--color-cya-soft)", background: "rgba(100,210,255,0.14)", borderColor: "transparent" }
                : undefined
            }
            title="Une tâche gelée revient chaque jour et survit à la clôture (raccourci : double-appui sur la ligne)"
          >
            ❄️ {tache.gelee ? "Dégeler" : "Geler"}
          </button>

          <label className="capsule cursor-pointer" title="Échéance">
            <span aria-hidden>📅</span>
            <input
              type="date"
              value={tache.meta.echeance ?? ""}
              onChange={(e) => surModifier({ meta: { ...tache.meta, echeance: e.target.value || undefined } })}
              aria-label="Échéance"
              className="cursor-pointer bg-transparent text-[13px] font-medium outline-none"
              style={{ colorScheme: "dark", color: tache.meta.echeance ? "var(--color-fg)" : "rgba(255,255,255,0.5)" }}
            />
            {tache.meta.echeance && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Retirer l'échéance"
                onClick={(e) => {
                  e.preventDefault();
                  surModifier({ meta: { ...tache.meta, echeance: undefined } });
                }}
                className="ml-[2px] text-[15px] font-bold text-white/45 hover:text-white"
              >
                ×
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={() => {
              surModifier({ bloc: autreListe.bloc });
              surOuvrir(null);
            }}
            className="capsule"
          >
            → {autreListe.nom}
          </button>

          <button
            type="button"
            onClick={() => {
              setRenomme(tache.titre);
              surOuvrir(null);
            }}
            className="capsule"
          >
            ✎ Renommer
          </button>

          <button
            type="button"
            onClick={() => {
              // En sursis : la barre « Annuler » décide de la suite.
              surOuvrir(null);
              surSupprimer();
            }}
            className="capsule"
            style={{ color: "var(--color-mag-soft)", background: "rgba(255,55,95,0.12)", borderColor: "transparent" }}
          >
            Supprimer
          </button>
        </div>
      </Depliant>
    </div>
  );
}
