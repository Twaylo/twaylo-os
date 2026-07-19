"use client";

import { useEffect, useState } from "react";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

/**
 * HISTORIQUE DES HABITUDES — le calendrier et ce qu'il raconte.
 *
 * Un taux global ne sert à rien : savoir qu'on est à 46 % ne dit pas quoi
 * corriger. Cette vue cherche donc autre chose — les séries qui tiennent, les
 * pentes des deux dernières semaines, les creux de plusieurs jours, et le jour
 * de la semaine où ça lâche systématiquement. C'est ce niveau-là qui se
 * corrige.
 *
 * Rien de tout ça n'a demandé de nouvelle table : chaque journée écrivait déjà
 * ses habitudes cochées. La matière était là, elle n'avait jamais été relue en
 * travers.
 */

type JourStat = { jour: string; faites: number; total: number; ratio: number };

type HabitudeStat = {
  id: string;
  nom: string;
  categorie: string;
  serie: number;
  meilleureSerie: number;
  taux7: number;
  taux30: number;
  tendance: number;
  dernierJour: string | null;
  variantes: { nom: string; fois: number }[];
};

type Stats = {
  connecte: boolean;
  jours: JourStat[];
  habitudes: HabitudeStat[];
  creux: { debut: string; fin: string; jours: number; ratioMoyen: number }[];
  parJourSemaine: { jour: number; taux: number; jours: number }[];
  jourFaible: number | null;
  premierJourSuivi: string | null;
  tauxGlobal: number;
};

const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** 0 = lundi. Calculé en UTC pour ne pas glisser d'un jour aux changements d'heure. */
function indexJourSemaine(jour: string): number {
  return (new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function dateCourte(jour: string): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Cinq paliers plutôt qu'un dégradé continu : l'œil distingue mal 3 % d'écart,
 * mais lit immédiatement une case vide d'une case pleine.
 */
function couleurCase(ratio: number, aucuneDonnee: boolean): string {
  if (aucuneDonnee) return "rgba(255,255,255,0.03)";
  if (ratio === 0) return "rgba(255,255,255,0.06)";
  if (ratio < 0.25) return "rgba(176,107,255,0.22)";
  if (ratio < 0.5) return "rgba(176,107,255,0.42)";
  if (ratio < 0.75) return "rgba(176,107,255,0.65)";
  return "var(--color-vio)";
}

/** Découpe la suite de jours en semaines, chaque semaine étant une colonne. */
function enSemaines(jours: JourStat[]): (JourStat | null)[][] {
  if (jours.length === 0) return [];
  const semaines: (JourStat | null)[][] = [];
  // La première semaine est complétée par des vides jusqu'au premier jour
  // suivi, pour que les lignes restent alignées sur les jours de la semaine.
  let courante: (JourStat | null)[] = Array(indexJourSemaine(jours[0].jour)).fill(null);

  for (const j of jours) {
    courante.push(j);
    if (courante.length === 7) {
      semaines.push(courante);
      courante = [];
    }
  }
  if (courante.length) {
    semaines.push([...courante, ...Array(7 - courante.length).fill(null)]);
  }
  return semaines;
}

function Pourcent({ valeur, taille = 13 }: { valeur: number; taille?: number }) {
  return (
    <span className="font-mono font-extrabold" style={{ fontSize: taille }}>
      {Math.round(valeur * 100)}
      <span className="text-white/35" style={{ fontSize: taille - 3 }}>
        %
      </span>
    </span>
  );
}

export function HabitudesView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void fetch("/api/habitudes/stats?jours=120")
      .then((r) => r.json())
      .then((d) => {
        if (!annule) setStats(d);
      })
      .catch((err) => {
        console.error("[habitudes] stats illisibles :", err);
        if (!annule) setErreur("Impossible de lire l'historique.");
      });
    return () => {
      annule = true;
    };
  }, []);

  if (erreur) {
    return (
      <Panel accent="var(--color-vio)">
        <EmptyState hint={erreur}>Historique indisponible</EmptyState>
      </Panel>
    );
  }

  if (!stats) {
    return (
      <Panel accent="var(--color-vio)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Lecture de l&apos;historique…
        </div>
      </Panel>
    );
  }

  if (!stats.premierJourSuivi || stats.jours.length === 0) {
    return (
      <Panel accent="var(--color-vio)">
        <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
          HISTORIQUE
        </Eyebrow>
        <EmptyState hint="Coche tes premières habitudes sur l'accueil — le calendrier se remplira tout seul.">
          Rien à montrer encore
        </EmptyState>
      </Panel>
    );
  }

  const semaines = enSemaines(stats.jours);
  const enBaisse = stats.habitudes.filter((h) => h.tendance <= -15);
  const jamais = stats.habitudes.filter((h) => h.dernierJour === null);
  const creuxRecent = stats.creux[0];

  return (
    <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-3">
      {/* ---------- Calendrier ---------- */}
      <Panel accent="var(--color-vio)" className="col-span-full xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
              CALENDRIER
            </Eyebrow>
            <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
              DEPUIS LE {dateCourte(stats.premierJourSuivi).toUpperCase()} — {stats.jours.length} JOURS
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black tracking-[0.1em] text-white/30">
              MOYENNE
            </div>
            <div style={{ color: "var(--color-vio-soft)" }}>
              <Pourcent valeur={stats.tauxGlobal} taille={20} />
            </div>
          </div>
        </div>

        <div className="mt-[14px] flex gap-[6px] overflow-x-auto pb-2">
          {/* Les initiales des jours, en regard des lignes. */}
          <div className="flex flex-none flex-col gap-[3px] pt-[1px]">
            {JOURS_COURTS.map((j, i) => (
              <div
                key={i}
                className="flex h-[15px] items-center text-[8.5px] font-black text-white/25"
                style={{ width: 10 }}
              >
                {j}
              </div>
            ))}
          </div>

          {semaines.map((semaine, s) => (
            <div key={s} className="flex flex-none flex-col gap-[3px]">
              {semaine.map((jour, i) => (
                <div
                  key={i}
                  title={
                    jour
                      ? `${dateCourte(jour.jour)} — ${jour.faites}/${jour.total} habitudes`
                      : undefined
                  }
                  className="h-[15px] w-[15px] rounded-[4px] transition-transform hover:scale-125"
                  style={{
                    background: couleurCase(jour?.ratio ?? 0, !jour),
                    border: jour ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-[6px] flex items-center gap-[7px] text-[9px] font-bold text-white/25">
          <span>Rien</span>
          {[0, 0.2, 0.4, 0.6, 1].map((r) => (
            <span
              key={r}
              className="h-[11px] w-[11px] rounded-[3px]"
              style={{ background: couleurCase(r, false) }}
            />
          ))}
          <span>Tout</span>
        </div>
      </Panel>

      {/* ---------- Ce qui décroche ---------- */}
      <Panel accent="var(--color-mag)" className="col-span-full xl:col-span-1">
        <Eyebrow color="var(--color-mag-soft)" dot="var(--color-mag)">
          CE QUI DÉCROCHE
        </Eyebrow>
        <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
          LES MOMENTS DE BAS, ET LEUR CAUSE
        </div>

        <div className="mt-[12px] flex flex-col gap-[8px]">
          {stats.jourFaible !== null && (
            <Constat
              couleur="var(--color-amb)"
              titre={`Tu lâches le ${JOURS_LONGS[stats.jourFaible]}`}
              detail={`${Math.round(
                (stats.parJourSemaine[stats.jourFaible]?.taux ?? 0) * 100,
              )} % ce jour-là, contre ${Math.round(stats.tauxGlobal * 100)} % en moyenne.`}
            />
          )}

          {creuxRecent && (
            <Constat
              couleur="var(--color-mag)"
              titre={`Creux de ${creuxRecent.jours} jours`}
              detail={`Du ${dateCourte(creuxRecent.debut)} au ${dateCourte(
                creuxRecent.fin,
              )}, à ${Math.round(creuxRecent.ratioMoyen * 100)} %. Relis ton journal de ces jours-là.`}
            />
          )}

          {enBaisse.map((h) => (
            <Constat
              key={h.id}
              couleur="var(--color-cor)"
              titre={`${h.nom} recule`}
              detail={`${h.tendance} points en une semaine — ${Math.round(
                h.taux7 * 100,
              )} % sur les 7 derniers jours.`}
            />
          ))}

          {jamais.map((h) => (
            <Constat
              key={h.id}
              couleur="rgba(255,255,255,0.3)"
              titre={`${h.nom} : jamais cochée`}
              detail="Soit elle ne te correspond pas, soit tu l'as oubliée. Les deux se règlent."
            />
          ))}

          {stats.jourFaible === null &&
            !creuxRecent &&
            enBaisse.length === 0 &&
            jamais.length === 0 && (
              <div
                className="rounded-[10px] px-[11px] py-[10px] text-[11.5px] leading-[1.45] text-white/40"
                style={{
                  background: "rgba(61,220,132,0.07)",
                  border: "1px solid rgba(61,220,132,0.2)",
                }}
              >
                Rien ne décroche. Pas de creux, pas de jour faible, aucune habitude
                en recul.
              </div>
            )}
        </div>

        {/* Le rythme de la semaine, en barres. */}
        <div className="mt-[14px]">
          <div className="mb-[6px] text-[8.5px] font-black tracking-[0.12em] text-white/30">
            RYTHME DE LA SEMAINE
          </div>
          <div className="flex items-end gap-[5px]" style={{ height: 54 }}>
            {stats.parJourSemaine.map((p) => (
              <div key={p.jour} className="flex flex-1 flex-col items-center gap-[4px]">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-[3px] transition-all"
                    title={`${JOURS_LONGS[p.jour]} — ${Math.round(p.taux * 100)} %`}
                    style={{
                      // Une barre à 0 % reste visible : un jour sans donnée et
                      // un jour à zéro ne doivent pas se confondre.
                      height: `${Math.max(p.taux * 100, 3)}%`,
                      background:
                        p.jour === stats.jourFaible
                          ? "var(--color-mag)"
                          : "var(--color-vio)",
                      opacity: p.jours === 0 ? 0.15 : 1,
                    }}
                  />
                </div>
                <div className="text-[8.5px] font-black text-white/30">
                  {JOURS_COURTS[p.jour]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ---------- Détail par habitude ---------- */}
      <Panel accent="var(--color-ver)" className="col-span-full">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          PAR HABITUDE
        </Eyebrow>

        <div className="mt-[12px] flex flex-col gap-[6px]">
          {stats.habitudes.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] rounded-[11px] px-[12px] py-[10px]"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="min-w-[150px] flex-1">
                <div className="text-[13px] font-extrabold">{h.nom}</div>
                <div className="text-[9px] font-black tracking-[0.1em] text-white/25">
                  {h.categorie.toUpperCase()}
                </div>
              </div>

              <Metrique
                label="SÉRIE"
                valeur={`${h.serie} j`}
                sous={`record ${h.meilleureSerie}`}
                couleur={h.serie > 0 ? "var(--color-ver)" : "rgba(255,255,255,0.3)"}
              />

              <div className="min-w-[54px]">
                <div className="text-[8.5px] font-black tracking-[0.1em] text-white/25">
                  7 JOURS
                </div>
                <Pourcent valeur={h.taux7} />
              </div>

              <div className="min-w-[54px]">
                <div className="text-[8.5px] font-black tracking-[0.1em] text-white/25">
                  30 JOURS
                </div>
                <Pourcent valeur={h.taux30} />
              </div>

              <div className="min-w-[62px]">
                <div className="text-[8.5px] font-black tracking-[0.1em] text-white/25">
                  TENDANCE
                </div>
                <span
                  className="font-mono text-[13px] font-extrabold"
                  style={{
                    color:
                      h.tendance > 5
                        ? "var(--color-ver)"
                        : h.tendance < -5
                          ? "var(--color-mag-soft)"
                          : "rgba(255,255,255,0.35)",
                  }}
                >
                  {h.tendance > 0 ? "+" : ""}
                  {h.tendance}
                </span>
              </div>

              {h.variantes.length > 0 && (
                <div className="flex flex-wrap items-center gap-[4px]">
                  {h.variantes.slice(0, 3).map((v) => (
                    <span
                      key={v.nom}
                      className="rounded-full px-[8px] py-[2px] text-[10px] font-bold"
                      style={{
                        color: "var(--color-vio-soft)",
                        background: "rgba(176,107,255,0.12)",
                      }}
                    >
                      {v.nom} · {v.fois}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Constat({
  couleur,
  titre,
  detail,
}: {
  couleur: string;
  titre: string;
  detail: string;
}) {
  return (
    <div
      className="rounded-[10px] px-[11px] py-[9px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: `2px solid ${couleur}`,
      }}
    >
      <div className="text-[12px] font-extrabold">{titre}</div>
      <div className="mt-[2px] text-[10.5px] leading-[1.4] text-white/45">{detail}</div>
    </div>
  );
}

function Metrique({
  label,
  valeur,
  sous,
  couleur,
}: {
  label: string;
  valeur: string;
  sous: string;
  couleur: string;
}) {
  return (
    <div className="min-w-[64px]">
      <div className="text-[8.5px] font-black tracking-[0.1em] text-white/25">{label}</div>
      <div className="font-mono text-[13px] font-extrabold" style={{ color: couleur }}>
        {valeur}
      </div>
      <div className="text-[8.5px] font-bold text-white/25">{sous}</div>
    </div>
  );
}
