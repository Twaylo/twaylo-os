"use client";

import { useEffect, useRef, useState } from "react";
import {
  BLOCS,
  ID_TRANSVERSE,
  NOMS_IMPACT,
  OBJECTIFS_P90,
  RESPONSABLES,
  couleurObjectif,
  joursRestants,
  nomObjectif,
  type IdBloc,
  type Impact,
  type MetaTache,
  type Portee,
} from "@/lib/p90";
import { ageEnJours, vieillesse } from "@/lib/age-tache";
import { PALETTE, avecEmoji, emojiDeTete, emojiVisible } from "@/lib/emoji-tache";
import type { TacheVue } from "@/lib/p90-context";
import { Champ, Eclats, Puce } from "@/components/p90/ui";

/**
 * UNE LIGNE DE TODO — et c'est la ligne ENTIÈRE qui coche.
 *
 * C'est le geste le plus fréquent de l'OS, plusieurs dizaines de fois par
 * jour. Viser un carré de dix-huit pixels à côté du texte, c'est le rater une
 * fois sur trois au pouce ; ici tout le rectangle répond, l'intitulé compris.
 * Les autres actions ne peuvent pas se confondre avec lui : la poignée ⠿ à
 * gauche range, le bouton ⋯ à droite ouvre le reste.
 *
 * DEUX APPUIS RAPPROCHÉS GÈLENT LA TÂCHE. Le premier a déjà coché, et c'est
 * volontaire : retarder la coche de 300 ms pour voir si un second appui arrive
 * rendrait poussif le geste le plus fréquent. Le second annule donc le premier
 * avant de geler — la case revient où elle était et la ligne prend son flocon.
 * Le raccourci ne se devine pas : le bouton « ❄️ Geler » du panneau l'apprend.
 *
 * Une tâche gelée revient tous les jours et survit à la clôture. Elle se
 * reconnaît sans lire, à son liseré froid sur le bord gauche — là où l'œil
 * descend la colonne.
 */

/** `navigator.vibrate` n'est pas dans tous les typages ; on le décrit ici. */
type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

/** Ce que l'échéance raconte, et la couleur qui va avec. */
function echeanceEnClair(
  echeance: string | undefined,
  jours: number | null,
): { texte: string; couleur: string } | null {
  if (!echeance || jours === null) return null;
  if (jours < 0) return { texte: `${-jours}J DE RETARD`, couleur: "var(--color-mag)" };
  if (jours === 0) return { texte: "AUJOURD'HUI", couleur: "var(--color-amb)" };
  if (jours === 1) return { texte: "DEMAIN", couleur: "var(--color-amb)" };
  if (jours <= 7) return { texte: `J+${jours}`, couleur: "rgba(255,255,255,0.35)" };
  return { texte: `J+${jours}`, couleur: "rgba(255,255,255,0.25)" };
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
  rang = 0,
  intensite = 0,
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
  /** Son rang dans la colonne — il règle le retard de l'animation d'entrée. */
  rang?: number;
  /** Proportion de la journée déjà faite, 0 à 1. Elle règle la démesure. */
  intensite?: number;
}) {
  const [renomme, setRenomme] = useState<string | null>(null);

  /*
   * L'animation de validation.
   *
   * Quatre paliers, calés sur la proportion de tâches faites : discret au
   * réveil, spectaculaire quand la journée est pliée. Le dernier ne s'atteint
   * qu'en fin de journée — exactement le moment où une récompense appuyée a du
   * sens, et une explosion à chaque case deviendrait une punition.
   */
  const palier = intensite >= 0.85 ? 3 : intensite >= 0.6 ? 2 : intensite >= 0.3 ? 1 : 0;
  const [anime, setAnime] = useState(false);
  const precedent = useRef(tache.faite);

  useEffect(() => {
    // On n'anime qu'au passage de non-fait à fait, et jamais au premier rendu
    // (sinon toute la liste s'agite au chargement de la page).
    if (tache.faite && !precedent.current) {
      setAnime(true);
      // Les éclats du dernier palier durent près d'une seconde : retirer les
      // éléments à 600 ms les couperait en plein vol.
      const t = setTimeout(() => setAnime(false), 700 + palier * 250);
      precedent.current = tache.faite;
      return () => clearTimeout(t);
    }
    precedent.current = tache.faite;
  }, [tache.faite, palier]);

  /** Le dernier appui, pour reconnaître le double. */
  const dernierTap = useRef(0);

  const jours = joursRestants(tache.meta.echeance, aujourdhui);
  const echeance = echeanceEnClair(tache.meta.echeance, jours);
  const age = vieillesse(ageEnJours(tache.creeLe, aujourdhui));
  const emoji = emojiVisible(tache.titre);
  const accent = couleurObjectif(tache.meta.objectif);

  const majMeta = (patch: Partial<MetaTache>) => surModifier({ meta: { ...tache.meta, ...patch } });

  /*
   * Le badge de droite : le flocon, ou l'âge.
   *
   * Jamais d'âge sur une tâche gelée : elle est vieille par nature. « Poster
   * sur Snap » date du jour où on l'a écrite et ne bougera plus — la marquer
   * « 12j » serait un reproche adressé à une corvée faite tous les jours.
   */
  const badge = tache.gelee
    ? { texte: "❄️", couleur: "var(--color-cya)", titre: "Gelée : elle revient tous les jours" }
    : age;

  const clic = () => {
    /*
     * Le clic part au relâchement, donc APRÈS un déplacement : sans cette
     * garde, ranger une tâche la cocherait dans la foulée. Elle se désarme en
     * la consommant — sinon tout clic qui ne passe pas par un glissement
     * (clavier, barre d'actions) resterait avalé en silence.
     */
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
      className={entree ? "tache-entree" : undefined}
      style={entree ? ({ "--retard": `${Math.min(rang, 10) * 35}ms` } as React.CSSProperties) : undefined}
    >
      <div
        className={`group relative flex items-stretch gap-[5px] ${tache.gelee ? "tache-gelee" : ""} ${
          tire ? "opacity-0" : ""
        }`}
        onPointerDown={(e) => surPointerDown(e, false)}
      >
        {/*
          La poignée. Toujours visible — le survol n'existe pas au doigt — et
          dimensionnée dans `globals.css` : 40 px au doigt, 22 px à la souris.
          Elle est la seule prise qui porte `touch-action: none`, donc la seule
          à partir de laquelle le navigateur ne confisque pas le geste.
        */}
        <button
          type="button"
          aria-label={`Déplacer ${tache.titre}`}
          title="Glisser pour ranger"
          onPointerDown={(e) => {
            e.stopPropagation();
            surPointerDown(e, true);
          }}
          className="poignee poignee-tache flex flex-none items-center justify-center text-[13px] leading-none text-white/25 transition-colors hover:text-white/60"
          style={{ cursor: tire ? "grabbing" : "grab" }}
        >
          ⠿
        </button>

        <div className="ligne-tache relative flex-1">
          {renomme === null ? (
            <button
              type="button"
              onClick={clic}
              aria-pressed={tache.faite}
              className={`check-row relative hover:brightness-125 ${anime ? `ligne-validee niveau-${palier}` : ""}`}
              style={{
                background: tache.faite ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)",
                border: `1px solid ${tache.faite ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {anime && (
                <>
                  <span
                    className="onde-validation"
                    aria-hidden
                    style={{
                      boxShadow: `0 0 0 ${1 + palier}px ${accent}, 0 0 ${18 + palier * 14}px ${
                        2 + palier * 3
                      }px ${accent}`,
                    }}
                  />
                  {palier >= 1 && (
                    <Eclats
                      nombre={palier === 1 ? 6 : palier === 2 ? 12 : 20}
                      portee={palier === 1 ? 34 : palier === 2 ? 58 : 88}
                    />
                  )}
                  {palier >= 2 && <span className="balayage-validation" aria-hidden />}
                </>
              )}

              <span
                className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] text-[11px] font-black text-[#07121d] ${
                  anime ? "case-cochee" : ""
                }`}
                style={{
                  background: tache.faite ? accent : "transparent",
                  border: `2px solid ${tache.faite ? accent : "rgba(255,255,255,0.22)"}`,
                }}
              >
                {tache.faite && <span className={anime ? "case-marque" : ""}>✓</span>}
              </span>

              <span
                className="flex-1 text-[12.5px] font-bold leading-[1.3]"
                style={{
                  color: tache.faite ? "rgba(255,255,255,0.38)" : "var(--color-fg)",
                  textDecoration: tache.faite ? "line-through" : "none",
                }}
              >
                {`${emoji} ${tache.titre}`.trim()}
              </span>

              {tache.meta.bloque && !tache.faite && (
                <span
                  title="Bloqué"
                  className="flex-none rounded-[6px] px-[5px] py-[2px] text-[9.5px] font-black leading-none"
                  style={{
                    color: "var(--color-mag)",
                    background: "rgba(255,61,139,0.12)",
                    border: "1px solid var(--color-mag)",
                  }}
                >
                  BLOQUÉ
                </span>
              )}

              {badge && !tache.faite && (
                <span
                  title={badge.titre}
                  className="nombres flex-none rounded-[6px] px-[5px] py-[2px] text-[9.5px] font-black leading-none"
                  style={{
                    color: badge.couleur,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${badge.couleur}`,
                  }}
                >
                  {badge.texte}
                </span>
              )}

              {/*
                L'étiquette de droite s'efface au survol : la barre d'actions
                vient se placer exactement ici, et les deux se chevauchaient.
                Elle disparaît aussi sur téléphone (voir `globals.css`), où la
                largeur appartient à l'intitulé.
              */}
              <span className="etiquette-meta flex flex-none items-center gap-[6px] text-[9.5px] font-extrabold uppercase tracking-[0.06em] transition-opacity group-hover:opacity-0">
                {tache.enCours && <span style={{ color: "var(--color-cya)" }}>EN COURS</span>}
                {tache.meta.objectif && <span style={{ color: accent }}>{nomObjectif(tache.meta.objectif)}</span>}
                {echeance && <span style={{ color: echeance.couleur }}>{echeance.texte}</span>}
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
              title="Objectif, qui, bloc, échéance, geler, renommer, supprimer"
              className="bouton-ligne absolute right-[3px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-[9px] text-[15px] font-black leading-none text-white/35 transition-all hover:text-white"
              style={{ background: "rgba(17,30,44,0.96)" }}
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/*
        LES ACTIONS, DÉPLIÉES SOUS LA LIGNE — pas en bulle.

        Une bulle se fait rogner par la carte, ou sort de l'écran sur la
        dernière ligne. Ici tout est nommé et fait 44 px de haut : il y avait
        trois boutons de dix-huit pixels collés les uns aux autres au bord
        droit, visibles au survol seulement, et viser « déplacer » sans toucher
        « supprimer » relevait de la chance.
      */}
      {ouvert && !tire && (
        <div
          className="sas-in mt-[5px] flex flex-col gap-[6px] rounded-[12px] p-[8px]"
          onPointerDown={(e) => e.stopPropagation()}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <Titre>Objectif</Titre>
          <div className="flex flex-wrap gap-[4px]">
            {OBJECTIFS_P90.map((o) => (
              <Puce
                key={o.id}
                actif={tache.meta.objectif === o.id}
                couleur={o.couleur}
                onClick={() => majMeta({ objectif: tache.meta.objectif === o.id ? undefined : (o.id as Portee) })}
              >
                {o.nom}
              </Puce>
            ))}
            <Puce
              actif={tache.meta.objectif === ID_TRANSVERSE}
              onClick={() =>
                majMeta({ objectif: tache.meta.objectif === ID_TRANSVERSE ? undefined : ID_TRANSVERSE })
              }
            >
              Tous
            </Puce>
          </div>

          <Titre>Qui</Titre>
          <div className="flex flex-wrap gap-[4px]">
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

          {/*
            CHOISIR L'EMOJI — et donc le groupe.

            La déduction se trompe forcément parfois : aucun mot de « Vérité
            #12 » ne dit que c'est une vidéo. Plutôt que d'ajouter des règles à
            l'infini pour deviner un vocabulaire qui n'est qu'à lui, on laisse
            trancher en un geste. Une palette de familles, pas le clavier
            d'emojis : une tâche pastèque ne se regrouperait avec rien.
          */}
          <Titre>Emoji</Titre>
          <div className="flex flex-wrap gap-[4px]">
            {(() => {
              const pose = emojiDeTete(tache.titre);
              return (
                <>
                  <button
                    type="button"
                    onClick={() => surModifier({ titre: avecEmoji(tache.titre, null) })}
                    title="Laisser l'OS choisir d'après l'intitulé"
                    className="flex h-[36px] cursor-pointer items-center justify-center rounded-[9px] px-[9px] text-[10px] font-black transition-all hover:brightness-125"
                    style={
                      pose
                        ? { color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)" }
                        : {
                            color: "var(--color-mag-soft)",
                            background: "rgba(255,61,139,0.14)",
                            border: "1.5px solid var(--color-mag)",
                          }
                    }
                  >
                    {emoji} AUTO
                  </button>
                  {PALETTE.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => surModifier({ titre: avecEmoji(tache.titre, f.emoji) })}
                      title={f.nom}
                      aria-label={f.nom}
                      aria-pressed={pose === f.emoji}
                      className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-[9px] text-[15px] leading-none transition-all hover:brightness-125"
                      style={
                        pose === f.emoji
                          ? { background: "rgba(255,61,139,0.16)", border: "1.5px solid var(--color-mag)" }
                          : { background: "rgba(255,255,255,0.05)" }
                      }
                    >
                      {f.emoji}
                    </button>
                  ))}
                </>
              );
            })()}
          </div>

          <Titre>Déplacer vers</Titre>
          <div className="flex flex-wrap gap-[5px]">
            {BLOCS.map((b) => {
              const ici = tache.bloc === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={ici}
                  onClick={() => {
                    surModifier({ bloc: b.id });
                    surOuvrir(null);
                  }}
                  title={b.plage}
                  className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] px-[6px] text-[11px] font-black leading-[1.15] transition-all hover:brightness-125 disabled:cursor-default"
                  style={
                    ici
                      ? { color: b.couleur, background: "rgba(255,255,255,0.05)", border: `1.5px solid ${b.couleur}` }
                      : {
                          color: "rgba(255,255,255,0.75)",
                          background: "rgba(255,255,255,0.05)",
                          border: "1.5px solid rgba(255,255,255,0.1)",
                        }
                  }
                >
                  {b.nom}
                  {ici && (
                    <span className="mt-[2px] block text-[8.5px] font-black tracking-[0.08em] opacity-70">ICI</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-[3px] flex flex-wrap items-center gap-[7px]">
            <Titre>Échéance</Titre>
            <Champ
              type="date"
              valeur={tache.meta.echeance ?? ""}
              onChange={(v) => majMeta({ echeance: v || undefined })}
              aria="Échéance"
              className="w-[150px]"
            />
            <Titre>Impact</Titre>
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

          {/*
            GELER — le même geste que le double-appui, mais nommé. Le raccourci
            ne se devine pas ; ce bouton l'apprend, et sert à qui préfère viser.
          */}
          <button
            type="button"
            onClick={surGel}
            className="mt-[2px] min-h-[44px] cursor-pointer rounded-[10px] px-[10px] text-left text-[11px] font-extrabold leading-[1.3] transition-all hover:brightness-125"
            style={
              tache.gelee
                ? {
                    color: "var(--color-cya)",
                    background: "rgba(34,211,238,0.12)",
                    border: "1.5px solid var(--color-cya)",
                  }
                : { color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.05)" }
            }
          >
            {tache.gelee
              ? "❄️ Gelée — elle revient chaque jour. Appuyer pour dégeler"
              : "❄️ Geler — la garder tous les jours (ou double-appui sur la ligne)"}
          </button>

          <div className="mt-[2px] flex gap-[5px]">
            <button
              type="button"
              onClick={() => majMeta({ bloque: !tache.meta.bloque })}
              className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] text-[12px] font-extrabold transition-all hover:brightness-125"
              style={
                tache.meta.bloque
                  ? {
                      color: "var(--color-mag)",
                      background: "rgba(255,61,139,0.12)",
                      border: "1.5px solid var(--color-mag)",
                    }
                  : { color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.05)" }
              }
            >
              {tache.meta.bloque ? "Débloquer" : "Marquer bloqué"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenomme(tache.titre);
                surOuvrir(null);
              }}
              className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] text-[12px] font-extrabold text-white/70 transition-all hover:brightness-125"
              style={{ background: "rgba(255,255,255,0.05)" }}
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
              className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] text-[12px] font-extrabold transition-all hover:brightness-125"
              style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.12)" }}
            >
              × Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** L'intertitre d'une rangée de réglages du panneau. */
function Titre({ children }: { children: React.ReactNode }) {
  return <div className="px-[3px] text-[9.5px] font-black tracking-[0.1em] text-white/30">{children}</div>;
}
