"use client";

import { useEffect, useMemo, useState } from "react";
import { readJSON, writeJSON } from "@/lib/storage";
import { localDateKey } from "@/lib/local-date";
import { REVUE_VIDE, type Revue } from "@/lib/types";
import { useOs } from "@/lib/os-context";
import { MicButton } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

/**
 * REVUE — la page WEEKLY REVIEW de Miles, adaptée au métier de Twaylo.
 *
 * C'est la carte qui fait la différence entre un tableau de bord et un
 * système : une fois par semaine, on arrête d'exécuter et on regarde ce qui
 * s'est passé. « Sceller » la semaine la fige en lecture seule — la revue
 * devient un document d'archive, pas un brouillon qu'on réécrit.
 */

/** Numéro de semaine ISO — la clé de rangement d'une revue. */
function semaineISO(d: Date): { annee: number; semaine: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Jeudi de la même semaine : c'est lui qui détermine l'année ISO.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const debutAnnee = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((t.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return { annee: t.getUTCFullYear(), semaine };
}

function bornesSemaine(d: Date): { du: string; au: string; lundiISO: string } {
  const offset = (d.getDay() + 6) % 7;
  const lundi = new Date(d);
  lundi.setDate(d.getDate() - offset);
  const dimanche = new Date(lundi);
  dimanche.setDate(lundi.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return { du: fmt(lundi), au: fmt(dimanche), lundiISO: localDateKey(lundi) };
}

type Section = { titre: string; couleur: string; champs: Champ[] };

type Champ = {
  cle: keyof Omit<Revue, "scelle">;
  titre: string;
  aide: string;
  couleur: string;
  hauteur: number;
};

const CHAMPS: Champ[] = [
  {
    cle: "gains",
    titre: "CE QUE J'AI GAGNÉ",
    aide: "Ce qui a avancé, même petit.",
    couleur: "var(--color-ver-soft)",
    hauteur: 96,
  },
  {
    cle: "contenuPublie",
    titre: "CONTENU PUBLIÉ",
    aide: "Vidéos sorties, formats testés.",
    couleur: "var(--color-cya-soft)",
    hauteur: 96,
  },
  {
    cle: "ceQuiADerape",
    titre: "CE QUI A DÉRAPÉ",
    aide: "Sans se juger — juste le constat.",
    couleur: "var(--color-mag-soft)",
    hauteur: 96,
  },
  {
    cle: "bouclesOuvertes",
    titre: "BOUCLES OUVERTES",
    aide: "Ce qui traîne et qu'il faut fermer.",
    couleur: "var(--color-amb-soft)",
    hauteur: 96,
  },
  {
    cle: "personnesARelancer",
    titre: "PERSONNES À RELANCER",
    aide: "Qui attend une réponse de toi.",
    couleur: "var(--color-vio-soft)",
    hauteur: 72,
  },
  {
    cle: "patternSante",
    titre: "CORPS ET ÉNERGIE",
    aide: "Sommeil, sport, ce que tu as senti.",
    couleur: "var(--color-cor-soft)",
    hauteur: 72,
  },
];

/**
 * Les champs regroupés par nature. Une revue de sept zones de texte à la
 * suite décourage ; trois sections repliables se remplissent l'une après
 * l'autre. La première est ouverte, les autres attendent leur tour.
 */
const SECTIONS: Section[] = [
  {
    titre: "CETTE SEMAINE",
    couleur: "var(--color-ver-soft)",
    champs: CHAMPS.filter((c) =>
      ["gains", "contenuPublie", "ceQuiADerape"].includes(c.cle),
    ),
  },
  {
    titre: "CE QUI RESTE OUVERT",
    couleur: "var(--color-amb-soft)",
    champs: CHAMPS.filter((c) =>
      ["bouclesOuvertes", "personnesARelancer"].includes(c.cle),
    ),
  },
  {
    titre: "CORPS ET ÉNERGIE",
    couleur: "var(--color-cor-soft)",
    champs: CHAMPS.filter((c) => c.cle === "patternSante"),
  },
];

export function RevueView() {
  const { demoMode } = useOs();
  const [revue, setRevue] = useState<Revue>(REVUE_VIDE);
  const [hydrate, setHydrate] = useState(false);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set([SECTIONS[0].titre]));
  const [meta, setMeta] = useState<{
    semaine: number;
    du: string;
    au: string;
    lundiISO: string;
  } | null>(null);

  // La date locale n'est connue qu'après montage (hydratation).
  const cle = useMemo(
    () => (meta ? `twaylo-revue-${meta.semaine}` : null),
    [meta],
  );

  useEffect(() => {
    const now = new Date();
    const { semaine } = semaineISO(now);
    const { du, au, lundiISO } = bornesSemaine(now);
    setMeta({ semaine, du, au, lundiISO });
    setRevue(readJSON<Revue>(`twaylo-revue-${semaine}`, REVUE_VIDE));
    setHydrate(true);

    // La base corrige ensuite le cache local — même ordre que le dashboard :
    // afficher tout de suite, rectifier après.
    void fetch(`/api/revue?lundi=${lundiISO}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connecte && d.revue) setRevue(d.revue);
      })
      .catch((err) => console.error("[revue] chargement impossible :", err));
  }, []);

  useEffect(() => {
    if (!hydrate || !cle || demoMode || !meta) return;
    writeJSON(cle, revue);

    // Une seconde après la dernière frappe : écrire à chaque lettre
    // enverrait une requête par caractère.
    const minuteur = setTimeout(() => {
      void fetch("/api/revue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lundi: meta.lundiISO, revue }),
      }).catch((err) => console.error("[revue] écriture impossible :", err));
    }, 1000);
    return () => clearTimeout(minuteur);
  }, [revue, hydrate, cle, demoMode, meta]);

  const rempli = CHAMPS.filter((c) => revue[c.cle].trim().length > 0).length;

  function set(cle: Champ["cle"], valeur: string) {
    if (revue.scelle) return;
    setRevue((r) => ({ ...r, [cle]: valeur }));
  }

  return (
    <>
      <ViewHeader
        title={meta ? `Revue · semaine ${meta.semaine}` : "Revue"}
        subtitle={meta ? `du ${meta.du} au ${meta.au}` : undefined}
        action={
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11.5px] text-white/40">
              {rempli}/{CHAMPS.length} rempli{rempli > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => setRevue((r) => ({ ...r, scelle: !r.scelle }))}
              className="cursor-pointer rounded-[10px] px-[14px] py-[8px] text-[13px] font-extrabold transition-all hover:brightness-110"
              style={
                revue.scelle
                  ? {
                      color: "var(--color-amb-soft)",
                      background: "rgba(255,198,61,0.1)",
                      border: "1px solid rgba(255,198,61,0.3)",
                    }
                  : {
                      color: "#07121d",
                      background: "var(--grad)",
                      border: "none",
                    }
              }
            >
              {revue.scelle ? "🔒 Scellée — rouvrir" : "Sceller la semaine"}
            </button>
          </div>
        }
      />

      {revue.scelle && (
        <div
          className="mb-[14px] rounded-[12px] px-4 py-[10px] text-[12.5px] font-bold"
          style={{
            color: "var(--color-amb-soft)",
            background: "rgba(255,198,61,0.07)",
            border: "1px solid rgba(255,198,61,0.2)",
          }}
        >
          Semaine scellée. Elle est archivée telle quelle — rouvre-la pour corriger.
        </div>
      )}

      <div className="flex flex-col gap-[10px]">
        {SECTIONS.map((section) => {
          const ouverte = ouvertes.has(section.titre);
          const remplis = section.champs.filter(
            (c) => revue[c.cle].trim().length > 0,
          ).length;

          return (
            <div key={section.titre}>
              <button
                type="button"
                onClick={() =>
                  setOuvertes((prev) => {
                    const suivant = new Set(prev);
                    if (suivant.has(section.titre)) suivant.delete(section.titre);
                    else suivant.add(section.titre);
                    return suivant;
                  })
                }
                aria-expanded={ouverte}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-4 py-[11px] text-left transition-all hover:brightness-125"
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderLeft: `2px solid ${section.couleur}`,
                }}
              >
                <span
                  className="flex-none text-[11px] transition-transform"
                  style={{
                    color: section.couleur,
                    transform: ouverte ? "rotate(90deg)" : "none",
                  }}
                >
                  ▶
                </span>
                <span
                  className="flex-1 text-[11px] font-extrabold tracking-[0.12em]"
                  style={{ color: section.couleur }}
                >
                  {section.titre}
                </span>
                <span className="flex-none font-mono text-[10.5px] text-white/35">
                  {remplis}/{section.champs.length}
                </span>
              </button>

              {ouverte && (
                <div className="mt-[10px] grid grid-cols-1 gap-[10px] lg:grid-cols-2">
                  {section.champs.map((champ) => (
                    <Panel key={champ.cle} accent={champ.couleur} size="sm">
                      <div className="mb-[8px] flex items-baseline justify-between gap-2">
                        <span
                          className="text-[10.5px] font-extrabold tracking-[0.12em]"
                          style={{ color: champ.couleur }}
                        >
                          {champ.titre}
                        </span>
                        <span className="flex-none text-[10px] text-white/25">
                          {champ.aide}
                        </span>
                      </div>

                      <textarea
                        value={revue[champ.cle]}
                        onChange={(e) => set(champ.cle, e.target.value)}
                        readOnly={revue.scelle}
                        aria-label={champ.titre}
                        className="w-full resize-y rounded-[12px] px-[13px] py-[11px] text-[13px] font-semibold leading-[1.5] text-white outline-none transition-colors focus:border-white/25 read-only:opacity-60"
                        style={{
                          minHeight: champ.hauteur,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}
                      />

                      {!revue.scelle && (
                        <div className="mt-[8px]">
                          <MicButton
                            onTranscript={(t) =>
                              set(
                                champ.cle,
                                revue[champ.cle] ? `${revue[champ.cle]} ${t}` : t,
                              )
                            }
                          />
                        </div>
                      )}
                    </Panel>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Le top 3 occupe toute la largeur : c'est la sortie de la revue. */}
        <Panel accent="var(--grad)" size="sm" className="lg:col-span-2">
          <div className="mb-[8px] flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-extrabold tracking-[0.12em] text-white/70">
              LA SEMAINE PROCHAINE — TOP 3
            </span>
            <span className="flex-none text-[10px] text-white/25">
              Trois choses. Pas quatre.
            </span>
          </div>
          <textarea
            value={revue.top3}
            onChange={(e) => set("top3", e.target.value)}
            readOnly={revue.scelle}
            placeholder={"1) …\n2) …\n3) …"}
            aria-label="Top 3 de la semaine prochaine"
            className="min-h-[104px] w-full resize-y rounded-[12px] px-[13px] py-[11px] text-[13px] font-semibold leading-[1.6] text-white outline-none transition-colors focus:border-white/25 read-only:opacity-60"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          />
        </Panel>
      </div>
    </>
  );
}
