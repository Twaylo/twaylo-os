"use client";

import { useEffect, useState } from "react";
import { useOs } from "@/lib/os-context";
import { EmptyState, MicButton } from "@/components/ui";
import { localDateKey } from "@/lib/local-date";
import { Panel } from "@/components/Panel";
import { MemoryList } from "@/components/cards/JournalCard";
import { ViewHeader } from "@/components/views/ViewHeader";

/** Comme l'horloge du rail : la date locale n'est connue qu'après montage. */
function useTodayLabel() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(
      new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    );
  }, []);
  return label;
}

type EntreePassee = { jour: string; texte: string };

/** « 17 juil. » plutôt que « 2026-07-17 ». */
function dateLisible(jour: string): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function JournalView() {
  /*
   * Les jours passés, relus depuis la base.
   *
   * Le champ ci-dessus n'écrit que la journée en cours : tout ce qui avait été
   * écrit les jours précédents existait en base mais n'apparaissait nulle part.
   * C'est ce qui manquait pour que le journal serve de mémoire.
   */
  const [passees, setPassees] = useState<EntreePassee[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void fetch(`/api/journal?jour=${localDateKey()}&combien=30`)
      .then((r) => r.json())
      .then((d) => {
        if (!annule) setPassees(Array.isArray(d.entrees) ? d.entrees : []);
      })
      .catch((err) => {
        console.error("[journal] historique illisible :", err);
        if (!annule) setPassees([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  const { journalText, setJournalText, data } = useOs();
  const today = useTodayLabel();

  return (
    <>
      <ViewHeader title="Journal" subtitle="Ta mémoire, jour après jour" />

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-[1.1fr_1fr]">
        <Panel
          accent="var(--color-cor)"
          size="sm"
          className="p-[18px]"
          style={{ border: "1px solid rgba(255,122,61,0.2)" }}
        >
          <div
            className="text-[10.5px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-cor-soft)" }}
          >
            ENTRÉE DU SOIR{today && ` — ${today}`}
          </div>

          <textarea
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            placeholder="Raconte ta journée — ce que tu as vu, ressenti, appris…"
            aria-label="Entrée du soir"
            className="mt-3 min-h-[200px] w-full resize-y rounded-[14px] px-4 py-[14px] text-[14px] font-semibold leading-[1.6] text-white outline-none transition-colors focus:border-white/25"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-[10px]">
            <MicButton
              onTranscript={(t) =>
                setJournalText((prev) => (prev ? `${prev} ${t}` : t))
              }
            />
            <button
              type="button"
              className="cursor-pointer rounded-xl border-none px-5 py-[11px] text-[14px] font-extrabold text-[#07121d] transition-all hover:brightness-110"
              style={{ background: "linear-gradient(90deg,#ff7a3d,#ffc63d)" }}
            >
              Enregistrer &amp; nourrir l&apos;IA
            </button>
          </div>
        </Panel>

        <div className="flex flex-col gap-[14px]">
          <Panel accent="var(--color-cor)" size="sm">
            <div
              className="mb-[11px] text-[10.5px] font-extrabold tracking-[0.12em]"
              style={{ color: "var(--color-cor-soft)" }}
            >
              ENTRÉES RÉCENTES
            </div>
            {passees === null ? (
              <div className="py-4 text-center text-[12px] font-bold text-white/25">
                Lecture…
              </div>
            ) : passees.length === 0 ? (
              <EmptyState hint="La première entrée démarre ta mémoire.">
                Aucune entrée passée
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {passees.map((j) => {
                  const deplie = ouverte === j.jour;
                  return (
                    <button
                      key={j.jour}
                      type="button"
                      onClick={() => setOuverte(deplie ? null : j.jour)}
                      title={deplie ? "Replier" : "Lire en entier"}
                      className="cursor-pointer rounded-[11px] px-[13px] py-[11px] text-left transition-colors hover:brightness-125"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${deplie ? "rgba(255,122,61,0.3)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="font-mono text-[11px] font-extrabold"
                          style={{ color: "var(--color-cor-soft)" }}
                        >
                          {dateLisible(j.jour)}
                        </span>
                        <span className="text-[10px] text-white/25">
                          {j.texte.length} caractères
                        </span>
                      </div>
                      {/*
                        Replié, on ne montre que le début : une entrée de
                        journal peut faire plusieurs paragraphes, et trente
                        d'affilée rendraient la colonne illisible.
                      */}
                      <div
                        className={`mt-1 text-[12.5px] leading-[1.45] text-white/70 ${deplie ? "whitespace-pre-wrap" : "line-clamp-2"}`}
                      >
                        {j.texte}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <section className="subpanel rounded-[16px] p-4">
            <div
              className="mb-[10px] text-[10px] font-extrabold tracking-[0.06em]"
              style={{ color: "var(--color-cor-soft)" }}
            >
              CE QUE L&apos;IA A RETENU
            </div>
            <MemoryList />
          </section>
        </div>
      </div>
    </>
  );
}
