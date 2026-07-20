"use client";

import { useEffect, useState } from "react";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { HabitudesView } from "@/components/views/HabitudesView";

/**
 * BILAN — comment ça se passe dans le temps.
 *
 * Deux calendriers : les tâches bouclées, puis les habitudes. Le premier est
 * neuf ; le second existait déjà sous l'onglet « Habitudes », que ce bilan
 * remplace.
 *
 * L'historique des tâches ne pouvait pas exister avant : la liste était
 * remise à neuf chaque matin, et rien ne figeait ce qui avait été fait la
 * veille. Chaque journée écrit désormais son instantané ; le calendrier se
 * remplit donc à partir d'aujourd'hui, jour après jour.
 */

type JourTache = {
  jour: string;
  total: number;
  faites: number;
  ratio: number;
  principalTotal: number;
  principalFaites: number;
  boucle: boolean;
};

type StatsTaches = {
  connecte: boolean;
  jours: JourTache[];
  serie: number;
  meilleureSerie: number;
  tauxGlobal: number;
  parJourSemaine: { jour: number; taux: number; jours: number }[];
  jourFaible: number | null;
  premierJourSuivi: string | null;
  error?: string;
};

const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

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

/** Cinq paliers de rose : l'œil lit une case vide d'une case pleine, pas 3 %. */
function couleurCase(ratio: number, vide: boolean): string {
  if (vide) return "rgba(255,255,255,0.03)";
  if (ratio === 0) return "rgba(255,255,255,0.06)";
  if (ratio < 0.25) return "rgba(255,61,139,0.25)";
  if (ratio < 0.5) return "rgba(255,61,139,0.45)";
  if (ratio < 0.75) return "rgba(255,61,139,0.68)";
  return "var(--color-mag)";
}

function enSemaines(jours: JourTache[]): (JourTache | null)[][] {
  if (jours.length === 0) return [];
  const semaines: (JourTache | null)[][] = [];
  let courante: (JourTache | null)[] = Array(indexJourSemaine(jours[0].jour)).fill(null);
  for (const j of jours) {
    courante.push(j);
    if (courante.length === 7) {
      semaines.push(courante);
      courante = [];
    }
  }
  if (courante.length) semaines.push([...courante, ...Array(7 - courante.length).fill(null)]);
  return semaines;
}

function TachesBilan() {
  const [stats, setStats] = useState<StatsTaches | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void fetch("/api/taches/stats?jours=120")
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (d?.error || d?.connecte === false) {
          setErreur(d?.error ?? "La base ne répond pas.");
          return;
        }
        setStats(d);
      })
      .catch((err) => {
        console.error("[bilan] tâches illisibles :", err);
        if (!annule) setErreur("Impossible de lire l'historique des tâches.");
      });
    return () => {
      annule = true;
    };
  }, []);

  if (erreur) {
    return (
      <Panel accent="var(--color-mag)">
        <EmptyState hint={erreur}>Bilan des tâches indisponible</EmptyState>
      </Panel>
    );
  }

  if (!stats) {
    return (
      <Panel accent="var(--color-mag)">
        <div className="py-6 text-center text-[13px] font-bold text-white/30">
          Lecture du bilan…
        </div>
      </Panel>
    );
  }

  if (!stats.premierJourSuivi || stats.jours.length === 0) {
    return (
      <Panel accent="var(--color-mag)">
        <Eyebrow color="var(--color-mag-soft)" dot="var(--color-mag)">
          TÂCHES BOUCLÉES
        </Eyebrow>
        <EmptyState hint="Coche tes tâches sur l'accueil — le calendrier se remplit à partir d'aujourd'hui, jour après jour.">
          Rien à montrer encore
        </EmptyState>
      </Panel>
    );
  }

  const semaines = enSemaines(stats.jours);

  return (
    <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-3">
      {/* ---------- Calendrier ---------- */}
      <Panel accent="var(--color-mag)" className="col-span-full xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow color="var(--color-mag-soft)" dot="var(--color-mag)">
              TÂCHES BOUCLÉES
            </Eyebrow>
            <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
              DEPUIS LE {dateCourte(stats.premierJourSuivi).toUpperCase()} — {stats.jours.length} JOURS
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-black tracking-[0.1em] text-white/30">MOYENNE</div>
            <div className="font-mono text-[20px] font-black" style={{ color: "var(--color-mag-soft)" }}>
              {Math.round(stats.tauxGlobal * 100)}
              <span className="text-[13px] text-white/35">%</span>
            </div>
          </div>
        </div>

        <div className="mt-[14px] flex gap-[6px] overflow-x-auto pb-2">
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
                      ? `${dateCourte(jour.jour)} — ${jour.faites}/${jour.total} tâches${jour.boucle ? " · focus bouclé" : ""}`
                      : undefined
                  }
                  className="h-[15px] w-[15px] rounded-[4px] transition-transform hover:scale-125"
                  style={{
                    background: couleurCase(jour?.ratio ?? 0, !jour),
                    // Une couronne dorée marque les jours où le focus a été bouclé.
                    border: jour?.boucle
                      ? "1px solid var(--color-amb)"
                      : jour
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-[6px] flex items-center gap-[7px] text-[9px] font-bold text-white/25">
          <span>0 %</span>
          {[0, 0.2, 0.4, 0.6, 1].map((r) => (
            <span
              key={r}
              className="h-[11px] w-[11px] rounded-[3px]"
              style={{ background: couleurCase(r, false) }}
            />
          ))}
          <span>100 %</span>
          <span className="ml-3 h-[11px] w-[11px] rounded-[3px]" style={{ border: "1px solid var(--color-amb)" }} />
          <span>focus bouclé</span>
        </div>
      </Panel>

      {/* ---------- Séries et rythme ---------- */}
      <Panel accent="var(--color-amb)" className="col-span-full xl:col-span-1">
        <Eyebrow color="var(--color-amb-soft)" dot="var(--color-amb)">
          SÉRIES
        </Eyebrow>

        <div className="mt-[12px] flex gap-[8px]">
          <div className="stat-box flex-1">
            <div className="text-[9px] leading-[1.2] text-white/40">EN COURS</div>
            <div
              className="font-mono text-[20px] font-black"
              style={{ color: stats.serie > 0 ? "var(--color-amb)" : "rgba(255,255,255,0.3)" }}
            >
              {stats.serie}
              <span className="text-[11px] text-white/40"> j</span>
            </div>
          </div>
          <div className="stat-box flex-1">
            <div className="text-[9px] leading-[1.2] text-white/40">RECORD</div>
            <div className="font-mono text-[20px] font-black text-white/70">
              {stats.meilleureSerie}
              <span className="text-[11px] text-white/40"> j</span>
            </div>
          </div>
        </div>
        <div className="mt-[6px] text-[10px] leading-[1.4] text-white/30">
          Un jour compte quand tu boucles ton focus principal.
        </div>

        {stats.jourFaible !== null && (
          <div
            className="mt-[10px] rounded-[10px] px-[11px] py-[9px]"
            style={{
              background: "rgba(255,61,139,0.08)",
              border: "1px solid rgba(255,61,139,0.2)",
            }}
          >
            <div className="text-[12px] font-extrabold">Tu lâches le {JOURS_LONGS[stats.jourFaible]}</div>
            <div className="mt-[2px] text-[10.5px] text-white/45">
              {Math.round((stats.parJourSemaine[stats.jourFaible]?.taux ?? 0) * 100)} % ce jour-là,
              contre {Math.round(stats.tauxGlobal * 100)} % en moyenne.
            </div>
          </div>
        )}

        <div className="mt-[14px]">
          <div className="mb-[6px] text-[8.5px] font-black tracking-[0.12em] text-white/30">
            RYTHME DE LA SEMAINE
          </div>
          <div className="flex items-end gap-[5px]" style={{ height: 50 }}>
            {stats.parJourSemaine.map((p) => (
              <div key={p.jour} className="flex flex-1 flex-col items-center gap-[4px]">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-[3px] transition-all"
                    title={`${JOURS_LONGS[p.jour]} — ${Math.round(p.taux * 100)} %`}
                    style={{
                      height: `${Math.max(p.taux * 100, 3)}%`,
                      background: p.jour === stats.jourFaible ? "var(--color-cor)" : "var(--color-mag)",
                      opacity: p.jours === 0 ? 0.15 : 1,
                    }}
                  />
                </div>
                <div className="text-[8.5px] font-black text-white/30">{JOURS_COURTS[p.jour]}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrition                                                           */
/* ------------------------------------------------------------------ */

type JourNutrition = {
  jour: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  mange: boolean;
};

type StatsNutrition = {
  connecte: boolean;
  jours: JourNutrition[];
  moyenne: { kcal: number; p: number; c: number; f: number };
  joursSuivis: number;
  serieProteines: number;
  objectifs: { kcal: number; p: number; c: number; f: number };
  premierJourSuivi: string | null;
  error?: string;
};

function NutritionBilan() {
  const [stats, setStats] = useState<StatsNutrition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void fetch("/api/nutrition/stats?jours=60")
      .then((r) => r.json())
      .then((d) => {
        if (annule) return;
        if (d?.error || d?.connecte === false) {
          setErreur(d?.error ?? "La base ne répond pas.");
          return;
        }
        setStats(d);
      })
      .catch((err) => {
        console.error("[bilan] nutrition illisible :", err);
        if (!annule) setErreur("Impossible de lire l'historique nutrition.");
      });
    return () => {
      annule = true;
    };
  }, []);

  if (erreur) {
    return (
      <Panel accent="var(--color-ver)">
        <EmptyState hint={erreur}>Bilan nutrition indisponible</EmptyState>
      </Panel>
    );
  }

  if (!stats) {
    return (
      <Panel accent="var(--color-ver)">
        <div className="py-6 text-center text-[13px] font-bold text-white/30">
          Lecture de la nutrition…
        </div>
      </Panel>
    );
  }

  if (!stats.premierJourSuivi || stats.joursSuivis === 0) {
    return (
      <Panel accent="var(--color-ver)">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          NUTRITION
        </Eyebrow>
        <EmptyState hint="Note tes repas sur l'accueil — les moyennes et les tendances se calculent toutes seules.">
          Rien à montrer encore
        </EmptyState>
      </Panel>
    );
  }

  // Les derniers jours suivis, du plus ancien au plus récent, pour la frise.
  const derniers = stats.jours.slice(-28);
  const maxKcal = Math.max(stats.objectifs.kcal, ...derniers.map((j) => j.kcal), 1);

  const MOYENNES: { label: string; valeur: number; cible: number; unite: string }[] = [
    { label: "KCAL", valeur: stats.moyenne.kcal, cible: stats.objectifs.kcal, unite: "" },
    { label: "PROTÉINES", valeur: stats.moyenne.p, cible: stats.objectifs.p, unite: "g" },
    { label: "GLUCIDES", valeur: stats.moyenne.c, cible: stats.objectifs.c, unite: "g" },
    { label: "LIPIDES", valeur: stats.moyenne.f, cible: stats.objectifs.f, unite: "g" },
  ];

  return (
    <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-3">
      {/* ---------- Moyennes ---------- */}
      <Panel accent="var(--color-ver)" className="col-span-full xl:col-span-1">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
            NUTRITION
          </Eyebrow>
          <span className="flex-none text-[9.5px] font-bold text-white/30">
            {stats.joursSuivis} jour{stats.joursSuivis > 1 ? "s" : ""} suivi
            {stats.joursSuivis > 1 ? "s" : ""}
          </span>
        </div>
        <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
          MOYENNE PAR JOUR
        </div>

        <div className="mt-[12px] flex flex-col gap-[10px]">
          {MOYENNES.map((m) => {
            const pct = m.cible ? Math.min(100, Math.round((m.valeur / m.cible) * 100)) : 0;
            return (
              <div key={m.label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[9.5px] font-extrabold tracking-[0.08em] text-white/45">
                    {m.label}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-white/70">
                    {m.valeur}
                    {m.unite} <span className="text-white/30">/ {m.cible}{m.unite}</span>
                  </span>
                </div>
                <div className="bar-track mt-[4px]" style={{ height: 5 }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: "var(--color-ver)" }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="mt-[13px] flex items-center justify-between rounded-[10px] px-[11px] py-[9px]"
          style={{ background: "rgba(61,220,132,0.08)", border: "1px solid rgba(61,220,132,0.2)" }}
        >
          <div>
            <div className="text-[9px] font-black tracking-[0.1em] text-white/40">
              SÉRIE PROTÉINES
            </div>
            <div className="text-[10px] text-white/35">objectif {stats.objectifs.p} g atteint</div>
          </div>
          <div
            className="font-mono text-[20px] font-black"
            style={{ color: stats.serieProteines > 0 ? "var(--color-ver)" : "rgba(255,255,255,0.3)" }}
          >
            {stats.serieProteines}
            <span className="text-[11px] text-white/40"> j</span>
          </div>
        </div>
      </Panel>

      {/* ---------- Frise des calories ---------- */}
      <Panel accent="var(--color-ver)" className="col-span-full xl:col-span-2">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          CALORIES PAR JOUR
        </Eyebrow>
        <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
          LIGNE = TON OBJECTIF DE {stats.objectifs.kcal} KCAL
        </div>

        <div className="relative mt-[16px]" style={{ height: 120 }}>
          {/* La ligne d'objectif. */}
          <div
            className="absolute left-0 right-0 border-t border-dashed"
            style={{
              bottom: `${(stats.objectifs.kcal / maxKcal) * 100}%`,
              borderColor: "rgba(255,198,61,0.5)",
            }}
          />
          <div className="flex h-full items-end gap-[3px]">
            {derniers.map((j) => {
              // Vert si dans ±15 % de la cible, ambre si loin, gris si rien noté.
              const ecart = stats.objectifs.kcal ? Math.abs(j.kcal - stats.objectifs.kcal) / stats.objectifs.kcal : 1;
              const couleur = !j.mange
                ? "rgba(255,255,255,0.06)"
                : ecart <= 0.15
                  ? "var(--color-ver)"
                  : "var(--color-amb)";
              return (
                <div
                  key={j.jour}
                  title={
                    j.mange
                      ? `${dateCourte(j.jour)} — ${j.kcal} kcal · ${j.p}g prot.`
                      : `${dateCourte(j.jour)} — rien noté`
                  }
                  className="flex-1 rounded-t-[3px] transition-all hover:brightness-125"
                  style={{
                    height: `${Math.max((j.kcal / maxKcal) * 100, j.mange ? 3 : 1)}%`,
                    background: couleur,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-[8px] flex items-center gap-[12px] text-[9px] font-bold text-white/25">
          <span className="flex items-center gap-[4px]">
            <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: "var(--color-ver)" }} />
            dans la cible
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="h-[10px] w-[10px] rounded-[2px]" style={{ background: "var(--color-amb)" }} />
            loin de la cible
          </span>
        </div>
      </Panel>
    </div>
  );
}

export function BilanView() {
  return (
    <div className="flex flex-col gap-[18px]">
      <TachesBilan />
      <NutritionBilan />
      <HabitudesView />
    </div>
  );
}
