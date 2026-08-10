"use client";

import { useCallback, useMemo, useState } from "react";

import { CATEGORIES_BLOC } from "@/lib/journees";
import { LONGUEUR_PRECISION, PROFILS, QUESTIONS, type Reponses } from "@/lib/sas";
import type { PlanOs } from "@/lib/sas-plan";

/**
 * Le sas d'accueil.
 *
 * UNE question par écran, jamais un formulaire. Un formulaire de six champs se
 * referme ; six écrans d'une question se traversent — c'est ce que font les
 * applications qu'on finit d'installer. La barre du haut dit combien il reste,
 * parce qu'un enchaînement sans fin visible se quitte au troisième écran.
 *
 * Chaque écran doit se répondre au pouce, sans clavier. La saisie libre est
 * gardée pour la fin, quand la personne est déjà engagée : la demander en
 * premier ferait fuir.
 */

type Phase = "questions" | "construction" | "apercu" | "pose";

const TOTAL = 1 + QUESTIONS.length + 1; // profil + questions + précision

export function Sas() {
  const [etape, setEtape] = useState(0);
  const [profil, setProfil] = useState<string | null>(null);
  const [choix, setChoix] = useState<Record<string, string[]>>({});
  const [precision, setPrecision] = useState("");

  const [phase, setPhase] = useState<Phase>("questions");
  const [plan, setPlan] = useState<PlanOs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<Record<string, number> | null>(null);

  const question = etape >= 1 && etape <= QUESTIONS.length ? QUESTIONS[etape - 1] : null;

  /** L'écran courant est-il répondu ? Sinon, « Continuer » reste éteint. */
  const repondu = useMemo(() => {
    if (etape === 0) return profil !== null;
    if (question) return (choix[question.id] ?? []).length > 0;
    return true; // la précision est facultative
  }, [etape, profil, question, choix]);

  const basculer = useCallback(
    (idQuestion: string, idChoix: string, multiple: boolean) => {
      setChoix((p) => {
        const actuels = p[idQuestion] ?? [];
        if (!multiple) return { ...p, [idQuestion]: [idChoix] };
        return {
          ...p,
          [idQuestion]: actuels.includes(idChoix)
            ? actuels.filter((c) => c !== idChoix)
            : [...actuels, idChoix],
        };
      });
    },
    [],
  );

  const construire = useCallback(async () => {
    if (!profil) return;
    setPhase("construction");
    setErreur(null);
    const reponses: Reponses = { profil, choix, precision: precision.trim() || undefined };
    try {
      const r = await fetch("/api/sas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reponses }),
      });
      const d = (await r.json()) as { plan?: PlanOs; error?: string };
      if (!r.ok || !d.plan) throw new Error(d.error ?? `HTTP ${r.status}`);
      setPlan(d.plan);
      setPhase("apercu");
    } catch (err) {
      console.error("[sas] construction impossible :", err);
      setErreur(
        err instanceof Error && err.message.length < 120
          ? err.message
          : "La construction a échoué.",
      );
      setPhase("questions");
    }
  }, [profil, choix, precision]);

  const appliquer = useCallback(async () => {
    if (!plan) return;
    setPhase("construction");
    setErreur(null);
    try {
      const r = await fetch("/api/sas/appliquer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = (await r.json()) as { pose?: Record<string, number>; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setBilan(d.pose ?? null);
      setPhase("pose");
    } catch (err) {
      console.error("[sas] mise en place impossible :", err);
      setErreur("La mise en place a échoué. Ton OS n'a pas été modifié.");
      setPhase("apercu");
    }
  }, [plan]);

  const teinte = PROFILS.find((p) => p.id === profil)?.couleur ?? "var(--color-cya)";

  return (
    <div className="cadre-appli relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-[140px] left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
          style={{ background: `radial-gradient(circle, ${teinte}22, transparent 70%)` }}
        />
      </div>

      {/* ---------- La barre d'avancement ---------- */}
      <div
        className="relative z-[1] px-[22px] pt-[18px]"
        style={{ paddingTop: "calc(18px + env(safe-area-inset-top, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-[12px]">
          <button
            type="button"
            onClick={() => setEtape((e) => Math.max(0, e - 1))}
            disabled={etape === 0 || phase !== "questions"}
            aria-label="Revenir à l'écran précédent"
            className="flex h-[36px] w-[36px] flex-none cursor-pointer items-center justify-center rounded-full text-[17px] font-black text-white/40 transition-colors hover:text-white/80 disabled:opacity-0"
          >
            ←
          </button>
          <div className="bar-track flex-1">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.round(((phase === "questions" ? etape : TOTAL) / TOTAL) * 100)}%`,
                background: "var(--grad)",
              }}
            />
          </div>
        </div>
      </div>

      <main
        className="relative z-[1] mx-auto flex w-full max-w-[560px] flex-1 flex-col px-[22px] pb-[24px] pt-[26px]"
        style={{
          paddingLeft: "max(22px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(22px, env(safe-area-inset-right, 0px))",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {phase === "construction" && <EnConstruction />}

        {phase === "questions" && (
          <>
            {etape === 0 && (
              <Ecran
                titre="Tu ressembles le plus à…"
                raison="Ce choix décide de tout le reste. Tu pourras en changer."
              >
                <div className="flex flex-col gap-[9px]">
                  {PROFILS.map((p) => (
                    <Carte
                      key={p.id}
                      actif={profil === p.id}
                      couleur={p.couleur}
                      onClick={() => setProfil(p.id)}
                    >
                      <span className="text-[22px]">{p.emoji}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-[14.5px] font-black">{p.titre}</span>
                        <span className="mt-[2px] block text-[11.5px] font-semibold leading-[1.35] text-white/45">
                          {p.accroche}
                        </span>
                      </span>
                    </Carte>
                  ))}
                </div>
              </Ecran>
            )}

            {question && (
              <Ecran titre={question.intitule} raison={question.raison}>
                <div className="flex flex-col gap-[9px]">
                  {question.choix.map((c) => (
                    <Carte
                      key={c.id}
                      actif={(choix[question.id] ?? []).includes(c.id)}
                      couleur={teinte}
                      onClick={() => basculer(question.id, c.id, Boolean(question.multiple))}
                    >
                      {c.emoji && <span className="text-[19px]">{c.emoji}</span>}
                      <span className="flex-1 text-left text-[14px] font-bold">{c.libelle}</span>
                    </Carte>
                  ))}
                </div>
                {question.multiple && (
                  <p className="mt-[10px] text-center text-[11px] font-bold text-white/25">
                    Plusieurs réponses possibles.
                  </p>
                )}
              </Ecran>
            )}

            {etape === TOTAL - 1 && (
              <Ecran
                titre="Quelque chose que je devrais savoir ?"
                raison="Une contrainte, un objectif précis, un métier. Ou rien — c'est facultatif."
              >
                <textarea
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value.slice(0, LONGUEUR_PRECISION))}
                  rows={4}
                  placeholder="Je bosse en 3×8, je prépare le barreau, je pars vivre au Japon en mars…"
                  className="w-full resize-none rounded-[13px] px-[13px] py-[11px] text-[14px] font-semibold leading-[1.5] outline-none placeholder:text-white/25"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "var(--color-fg)",
                  }}
                />
                <div className="mt-[6px] text-right font-mono text-[10.5px] text-white/25">
                  {precision.length} / {LONGUEUR_PRECISION}
                </div>
              </Ecran>
            )}

            {erreur && (
              <p
                className="mt-[14px] rounded-[11px] px-[12px] py-[9px] text-center text-[12px] font-bold"
                style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.1)" }}
              >
                {erreur}
              </p>
            )}

            <div className="mt-auto pt-[22px]">
              <button
                type="button"
                disabled={!repondu}
                onClick={() => (etape === TOTAL - 1 ? void construire() : setEtape((e) => e + 1))}
                className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[14px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-25"
                style={{ background: "var(--grad)" }}
              >
                {etape === TOTAL - 1 ? "Construire mon OS" : "Continuer"}
              </button>
            </div>
          </>
        )}

        {phase === "apercu" && plan && (
          <Apercu plan={plan} erreur={erreur} onAppliquer={() => void appliquer()} />
        )}

        {phase === "pose" && <Termine bilan={bilan} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Ecran({
  titre,
  raison,
  children,
}: {
  titre: string;
  raison: string;
  children: React.ReactNode;
}) {
  return (
    <div className="view-in">
      <h1 className="text-[23px] font-black leading-[1.2] tracking-[-0.02em] sm:text-[27px]">
        {titre}
      </h1>
      {/* Le POURQUOI sous chaque question : sans lui, on répond au hasard. */}
      <p className="mt-[7px] text-[12.5px] font-semibold leading-[1.45] text-white/45">{raison}</p>
      <div className="mt-[20px]">{children}</div>
    </div>
  );
}

function Carte({
  actif,
  couleur,
  onClick,
  children,
}: {
  actif: boolean;
  couleur: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className="flex min-h-[58px] w-full cursor-pointer items-center gap-[12px] rounded-[14px] px-[14px] py-[11px] transition-all"
      style={{
        background: actif ? `${couleur}1c` : "rgba(255,255,255,0.035)",
        border: `1.5px solid ${actif ? couleur : "rgba(255,255,255,0.08)"}`,
        boxShadow: actif ? `0 0 22px -12px ${couleur}` : "none",
      }}
    >
      {children}
      <span
        className="flex h-[21px] w-[21px] flex-none items-center justify-center rounded-full text-[11px] font-black"
        style={{
          background: actif ? couleur : "transparent",
          border: `2px solid ${actif ? couleur : "rgba(255,255,255,0.15)"}`,
          color: "#07121d",
        }}
      >
        {actif ? "✓" : ""}
      </span>
    </button>
  );
}

function EnConstruction() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="lancement-piste" />
      <p className="mt-[18px] text-[15px] font-black">Je monte ton espace de travail…</p>
      <p className="mt-[6px] max-w-[300px] text-[12.5px] font-semibold leading-[1.45] text-white/45">
        Journée type, habitudes, objectifs et compétences. Quelques secondes.
      </p>
    </div>
  );
}

function Apercu({
  plan,
  erreur,
  onAppliquer,
}: {
  plan: PlanOs;
  erreur: string | null;
  onAppliquer: () => void;
}) {
  return (
    <div className="view-in flex flex-1 flex-col">
      <h1 className="text-[23px] font-black leading-[1.2] tracking-[-0.02em]">Voilà ton OS.</h1>
      {plan.resume && (
        <p className="mt-[8px] text-[13px] font-semibold leading-[1.5] text-white/55">
          {plan.resume}
        </p>
      )}

      <div className="mt-[18px] flex flex-col gap-[10px]">
        {plan.blocs.length > 0 && (
          <Bloc titre="TA JOURNÉE TYPE" nombre={plan.blocs.length}>
            {plan.blocs.map((b, i) => (
              <div key={`${b.debut}-${i}`} className="flex items-center gap-[9px] py-[4px]">
                <span className="w-[74px] flex-none font-mono text-[11px] font-bold text-white/35">
                  {b.debut}
                  {b.fin ? `–${b.fin}` : ""}
                </span>
                <span
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: CATEGORIES_BLOC[b.categorie].couleur }}
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{b.titre}</span>
              </div>
            ))}
          </Bloc>
        )}

        {plan.habitudes.length > 0 && (
          <Bloc titre="TES HABITUDES" nombre={plan.habitudes.length}>
            <div className="flex flex-wrap gap-[6px]">
              {plan.habitudes.map((h) => (
                <span
                  key={h.nom}
                  className="rounded-full px-[9px] py-[4px] text-[11.5px] font-bold text-white/65"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {h.nom}
                </span>
              ))}
            </div>
          </Bloc>
        )}

        {plan.objectifs.length > 0 && (
          <Bloc titre="TES OBJECTIFS" nombre={plan.objectifs.length}>
            {plan.objectifs.map((o) => (
              <div key={o.objectif} className="flex items-baseline gap-[8px] py-[3px]">
                <span className="min-w-0 flex-1 text-[12.5px] font-bold">{o.objectif}</span>
                <span className="flex-none font-mono text-[10px] font-bold text-white/30">
                  {o.portee}
                </span>
              </div>
            ))}
          </Bloc>
        )}

        {plan.skills.length > 0 && (
          <Bloc titre="TES COMPÉTENCES SUIVIES" nombre={plan.skills.length}>
            <div className="flex flex-wrap gap-[6px]">
              {plan.skills.map((s) => (
                <span
                  key={s.nom}
                  className="rounded-full px-[9px] py-[4px] text-[11.5px] font-bold text-white/65"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {s.nom} <span className="font-mono text-white/35">{s.niveau}</span>
                </span>
              ))}
            </div>
          </Bloc>
        )}
      </div>

      {erreur && (
        <p
          className="mt-[14px] rounded-[11px] px-[12px] py-[9px] text-center text-[12px] font-bold"
          style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.1)" }}
        >
          {erreur}
        </p>
      )}

      <div className="mt-auto pt-[22px]">
        <button
          type="button"
          onClick={onAppliquer}
          className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[14px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110"
          style={{ background: "var(--grad)" }}
        >
          Mettre en place
        </button>
        {/* Ce que « mettre en place » ne fait PAS : dit ici, avant le geste. */}
        <p className="mt-[9px] text-center text-[11px] font-bold leading-[1.4] text-white/30">
          Rien n&apos;est remplacé — tout s&apos;ajoute à ce que tu as déjà.
        </p>
      </div>
    </div>
  );
}

function Bloc({
  titre,
  nombre,
  children,
}: {
  titre: string;
  nombre: number;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-sm">
      <div className="mb-[8px] flex items-baseline justify-between">
        <span className="text-[10px] font-black tracking-[0.12em] text-white/35">{titre}</span>
        <span className="font-mono text-[10.5px] font-bold text-white/25">{nombre}</span>
      </div>
      {children}
    </div>
  );
}

function Termine({ bilan }: { bilan: Record<string, number> | null }) {
  const lignes = [
    ["blocs de journée", bilan?.journee ?? 0],
    ["habitudes", bilan?.habitudes ?? 0],
    ["objectifs", bilan?.objectifs ?? 0],
    ["compétences", bilan?.skills ?? 0],
  ] as const;

  return (
    <div className="view-in flex flex-1 flex-col items-center justify-center text-center">
      <div className="text-[46px]">🎉</div>
      <h1 className="mt-[10px] text-[25px] font-black leading-[1.15] tracking-[-0.02em]">
        Ton OS est prêt.
      </h1>
      <p className="mt-[8px] max-w-[320px] text-[13px] font-semibold leading-[1.45] text-white/50">
        Tout est en place. La première coche débloque le reste.
      </p>

      <div className="mt-[20px] flex flex-wrap justify-center gap-[7px]">
        {lignes
          .filter(([, n]) => n > 0)
          .map(([nom, n]) => (
            <span
              key={nom}
              className="rounded-full px-[10px] py-[5px] text-[11.5px] font-bold text-white/60"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <span className="font-mono" style={{ color: "var(--color-ver-soft)" }}>
                +{n}
              </span>{" "}
              {nom}
            </span>
          ))}
      </div>

      {/*
        Un rechargement COMPLET, pas une navigation interne.

        Le contexte de l'OS a déjà lu la base au démarrage ; une navigation
        côté client le laisserait tel quel, et Twaylo arriverait sur un
        tableau de bord qui ignore la journée type qu'on vient de lui poser.
      */}
      <button
        type="button"
        onClick={() => {
          window.location.href = "/";
        }}
        className="mt-[26px] flex min-h-[52px] w-full max-w-[300px] cursor-pointer items-center justify-center rounded-[14px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110"
        style={{ background: "var(--grad)" }}
      >
        Ouvrir mon OS
      </button>
    </div>
  );
}
