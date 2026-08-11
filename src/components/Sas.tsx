"use client";

import { useCallback, useMemo, useState } from "react";

import { CATEGORIES_BLOC } from "@/lib/journees";
import { LONGUEUR_PRECISION, PROFILS, QUESTIONS, type Reponses } from "@/lib/sas";
import type { PlanOs } from "@/lib/sas-plan";
import { purgerCachesLocaux } from "@/lib/storage";

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

type Phase = "porte" | "questions" | "construction" | "apercu" | "pose";

const TOTAL = 1 + QUESTIONS.length + 1; // profil + questions + précision

export function Sas() {
  const [etape, setEtape] = useState(0);
  const [profil, setProfil] = useState<string | null>(null);
  const [choix, setChoix] = useState<Record<string, string[]>>({});
  const [precision, setPrecision] = useState("");

  /*
   * On commence par la PORTE : continuer avec l'OS déjà ouvert, ou en créer
   * un nouveau. Sans cet écran, quelqu'un de déjà connecté qui clique
   * « Construire mon OS » retombait dans le sien — ce qui n'est pas ce qu'il
   * demandait — et un nouveau venu se heurtait à un mot de passe qu'il n'a pas.
   */
  const [phase, setPhase] = useState<Phase>("porte");
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [plan, setPlan] = useState<PlanOs | null>(null);
  /*
   * Ce qu'on GARDE, coche par coche.
   *
   * Séparé du plan lui-même : décocher un bloc ne doit pas l'effacer, sinon
   * on ne peut plus le récupérer d'un second appui. La clé est
   * « type:position » — le plan ne bouge pas d'ordre entre l'aperçu et la
   * mise en place.
   */
  const [garde, setGarde] = useState<Record<string, boolean>>({});
  const [secours, setSecours] = useState(false);
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
      /*
       * 401 : il n'y a pas de session. C'est le cas de quelqu'un qui a touché
       * « Continuer avec mon OS » sans en avoir un.
       *
       * La route qui appelle le modèle reste volontairement derrière la porte :
       * elle coûte de l'argent à chaque appel, et exiger un compte est la
       * protection la plus solide. Mais l'impasse doit être NOMMÉE, avec la
       * sortie à côté — un « HTTP 401 » à l'écran ne dit rien à personne.
       */
      if (r.status === 401) {
        setErreur("Tu n'as pas encore d'OS. Reviens en arrière et crée-en un.");
        setPhase("porte");
        return;
      }
      const d = (await r.json()) as { plan?: PlanOs; error?: string; secours?: boolean };
      if (!r.ok || !d.plan) throw new Error(d.error ?? `HTTP ${r.status}`);
      // Tout coché au départ : on propose, on n'impose pas de trier.
      const coches: Record<string, boolean> = {};
      for (const [type, n] of [
        ["bloc", d.plan.blocs.length],
        ["hab", d.plan.habitudes.length],
        ["obj", d.plan.objectifs.length],
        ["skill", d.plan.skills.length],
      ] as const) {
        for (let i = 0; i < n; i++) coches[`${type}:${i}`] = true;
      }
      setGarde(coches);
      setSecours(Boolean(d.secours));
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

  /** Le plan réellement appliqué : seulement ce qui est resté coché. */
  const planRetenu = useMemo(() => {
    if (!plan) return null;
    return {
      resume: plan.resume,
      blocs: plan.blocs.filter((_, i) => garde[`bloc:${i}`]),
      habitudes: plan.habitudes.filter((_, i) => garde[`hab:${i}`]),
      objectifs: plan.objectifs.filter((_, i) => garde[`obj:${i}`]),
      skills: plan.skills.filter((_, i) => garde[`skill:${i}`]),
    };
  }, [plan, garde]);

  const appliquer = useCallback(async () => {
    if (!planRetenu) return;
    setPhase("construction");
    setErreur(null);
    try {
      const r = await fetch("/api/sas/appliquer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: planRetenu }),
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
  }, [planRetenu]);

  /** Modifier un bloc sur place : heure de début, de fin, intitulé. */
  const modifierBloc = useCallback(
    (i: number, champ: "debut" | "fin" | "titre", valeur: string) => {
      setPlan((p) =>
        p === null
          ? p
          : { ...p, blocs: p.blocs.map((b, j) => (j === i ? { ...b, [champ]: valeur } : b)) },
      );
    },
    [],
  );

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
                width: `${Math.round(((phase === "porte" ? 0 : phase === "questions" ? etape : TOTAL) / TOTAL) * 100)}%`,
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
        {phase === "porte" && (
          <Porte
            nom={nouveauNom}
            mdp={nouveauMdp}
            erreur={erreur}
            onNom={setNouveauNom}
            onMdp={setNouveauMdp}
            onContinuer={() => {
              setErreur(null);
              setPhase("questions");
            }}
            onCreer={async () => {
              setErreur(null);
              try {
                const r = await fetch("/api/auth/creer", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ nom: nouveauNom, motDePasse: nouveauMdp }),
                });
                const d = (await r.json()) as { error?: string };
                if (!r.ok) throw new Error(d.error ?? "Création impossible.");
                /*
                 * Les caches du compte précédent sont vidés ici, pas plus tard.
                 * Le nouvel OS est vierge ; sans cette purge il se peindrait
                 * avec la journée type et les tâches de l'ancien.
                 */
                purgerCachesLocaux();
                // Le compte est ouvert et la session posée : on enchaîne.
                setPhase("questions");
              } catch (err) {
                setErreur(err instanceof Error ? err.message : "Création impossible.");
              }
            }}
          />
        )}

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
          <Apercu
            plan={plan}
            garde={garde}
            secours={secours}
            erreur={erreur}
            retenus={
              (planRetenu?.blocs.length ?? 0) +
              (planRetenu?.habitudes.length ?? 0) +
              (planRetenu?.objectifs.length ?? 0) +
              (planRetenu?.skills.length ?? 0)
            }
            onBasculer={(cle) => setGarde((g) => ({ ...g, [cle]: !g[cle] }))}
            onModifierBloc={modifierBloc}
            onAppliquer={() => void appliquer()}
          />
        )}

        {phase === "pose" && <Termine bilan={bilan} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * La porte : continuer, ou créer.
 *
 * Deux chemins visibles d'emblée, parce que les deux existent réellement.
 * Cacher la création derrière un lien discret revenait à dire « c'est
 * l'application de quelqu'un d'autre ».
 */
function Porte({
  nom,
  mdp,
  erreur,
  onNom,
  onMdp,
  onContinuer,
  onCreer,
}: {
  nom: string;
  mdp: string;
  erreur: string | null;
  onNom: (v: string) => void;
  onMdp: (v: string) => void;
  onContinuer: () => void;
  onCreer: () => void | Promise<void>;
}) {
  const [ouvre, setOuvre] = useState(false);
  const pret = nom.trim().length >= 2 && mdp.length >= 8;

  return (
    <div className="view-in flex flex-1 flex-col">
      <h1 className="text-[23px] font-black leading-[1.2] tracking-[-0.02em] sm:text-[27px]">
        On part de quoi ?
      </h1>
      <p className="mt-[7px] text-[12.5px] font-semibold leading-[1.45] text-white/45">
        Chaque OS est séparé : ses journées, ses tâches, ses objectifs n&apos;appartiennent
        qu&apos;à lui.
      </p>

      <div className="mt-[20px] flex flex-col gap-[9px]">
        <button
          type="button"
          onClick={onContinuer}
          className="flex min-h-[64px] w-full cursor-pointer items-center gap-[12px] rounded-[14px] px-[14px] py-[12px] text-left transition-all"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1.5px solid rgba(255,255,255,0.09)",
          }}
        >
          <span className="text-[22px]">🔑</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-black">Continuer avec mon OS</span>
            <span className="mt-[2px] block text-[11.5px] font-semibold leading-[1.35] text-white/45">
              Ajoute des blocs, des habitudes et des objectifs à celui que tu as déjà.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOuvre((v) => !v)}
          aria-expanded={ouvre}
          className="flex min-h-[64px] w-full cursor-pointer items-center gap-[12px] rounded-[14px] px-[14px] py-[12px] text-left transition-all"
          style={{
            background: ouvre ? "rgba(61,220,132,0.1)" : "rgba(255,255,255,0.035)",
            border: `1.5px solid ${ouvre ? "rgba(61,220,132,0.45)" : "rgba(255,255,255,0.09)"}`,
          }}
        >
          <span className="text-[22px]">✨</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-black">Créer un nouvel OS</span>
            <span className="mt-[2px] block text-[11.5px] font-semibold leading-[1.35] text-white/45">
              Un espace vierge, avec son propre nom et son propre mot de passe.
            </span>
          </span>
        </button>
      </div>

      {ouvre && (
        <div className="mt-[12px] flex flex-col gap-[8px]">
          <input
            value={nom}
            onChange={(e) => onNom(e.target.value)}
            placeholder="Nom de l'OS — ex. « julie »"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-[12px] px-[13px] py-[12px] text-[14px] font-semibold outline-none placeholder:text-white/25"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "var(--color-fg)",
            }}
          />
          <input
            value={mdp}
            onChange={(e) => onMdp(e.target.value)}
            type="password"
            placeholder="Mot de passe — 8 caractères minimum"
            className="w-full rounded-[12px] px-[13px] py-[12px] text-[14px] font-semibold outline-none placeholder:text-white/25"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "var(--color-fg)",
            }}
          />
          <button
            type="button"
            disabled={!pret}
            onClick={() => void onCreer()}
            className="flex min-h-[50px] w-full cursor-pointer items-center justify-center rounded-[13px] text-[14.5px] font-black text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-25"
            style={{ background: "var(--grad)" }}
          >
            Créer et continuer
          </button>
          {/* Il n'y a pas de « mot de passe oublié » : on le dit avant. */}
          <p className="text-center text-[11px] font-bold leading-[1.4] text-white/30">
            Note ce mot de passe : il n&apos;y a aucun moyen de le retrouver.
          </p>
        </div>
      )}

      {erreur && (
        <p
          className="mt-[14px] rounded-[11px] px-[12px] py-[9px] text-center text-[12px] font-bold"
          style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.1)" }}
        >
          {erreur}
        </p>
      )}
    </div>
  );
}

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
  garde,
  secours,
  erreur,
  retenus,
  onBasculer,
  onModifierBloc,
  onAppliquer,
}: {
  plan: PlanOs;
  garde: Record<string, boolean>;
  secours: boolean;
  erreur: string | null;
  retenus: number;
  onBasculer: (cle: string) => void;
  onModifierBloc: (i: number, champ: "debut" | "fin" | "titre", valeur: string) => void;
  onAppliquer: () => void;
}) {
  return (
    <div className="view-in flex flex-1 flex-col">
      <h1 className="text-[23px] font-black leading-[1.2] tracking-[-0.02em]">
        Choisis ce que tu gardes.
      </h1>
      {plan.resume && (
        <p className="mt-[8px] text-[13px] font-semibold leading-[1.5] text-white/55">
          {plan.resume}
        </p>
      )}
      {secours && (
        <p
          className="mt-[10px] rounded-[10px] px-[11px] py-[8px] text-[11.5px] font-bold leading-[1.4]"
          style={{ color: "var(--color-amb-soft)", background: "rgba(255,198,61,0.09)" }}
        >
          L&apos;assistant n&apos;a pas répondu : voici la base de ton profil. Elle se modifie
          entièrement ici.
        </p>
      )}

      <div className="mt-[18px] flex flex-col gap-[10px]">
        {plan.blocs.length > 0 && (
          <Bloc titre="TA JOURNÉE TYPE" nombre={plan.blocs.filter((_, i) => garde[`bloc:${i}`]).length}>
            {/*
              Modifiable SUR PLACE, pas dans un écran à part.
              Un horaire qu'il faut aller changer ailleurs après coup n'est
              jamais changé : la journée proposée est acceptée telle quelle,
              puis abandonnée parce qu'elle ne colle pas.
            */}
            {plan.blocs.map((b, i) => {
              const actif = Boolean(garde[`bloc:${i}`]);
              return (
                <div
                  key={`bloc-${i}`}
                  className="flex items-center gap-[8px] border-b py-[7px] last:border-b-0"
                  style={{ borderColor: "rgba(255,255,255,0.05)", opacity: actif ? 1 : 0.35 }}
                >
                  <Coche actif={actif} onClick={() => onBasculer(`bloc:${i}`)} />
                  <span
                    className="h-[7px] w-[7px] flex-none rounded-full"
                    style={{ background: CATEGORIES_BLOC[b.categorie].couleur }}
                  />
                  <input
                    type="time"
                    value={b.debut}
                    disabled={!actif}
                    onChange={(e) => onModifierBloc(i, "debut", e.target.value)}
                    aria-label={`Heure de début de ${b.titre}`}
                    className="w-[62px] flex-none rounded-[7px] bg-transparent px-[4px] py-[3px] font-mono text-[11px] font-bold text-white/60 outline-none"
                    style={{ border: "1px solid rgba(255,255,255,0.09)" }}
                  />
                  <input
                    value={b.titre}
                    disabled={!actif}
                    onChange={(e) => onModifierBloc(i, "titre", e.target.value.slice(0, 60))}
                    aria-label={`Intitulé du bloc de ${b.debut}`}
                    className="min-w-0 flex-1 rounded-[7px] bg-transparent px-[6px] py-[3px] text-[12.5px] font-bold outline-none"
                    style={{ border: "1px solid rgba(255,255,255,0.09)", color: "var(--color-fg)" }}
                  />
                </div>
              );
            })}
          </Bloc>
        )}

        {plan.habitudes.length > 0 && (
          <Bloc titre="TES HABITUDES" nombre={plan.habitudes.filter((_, i) => garde[`hab:${i}`]).length}>
            <Puces
              items={plan.habitudes.map((h) => h.nom)}
              prefixe="hab"
              garde={garde}
              onBasculer={onBasculer}
            />
          </Bloc>
        )}

        {plan.objectifs.length > 0 && (
          <Bloc titre="TES OBJECTIFS" nombre={plan.objectifs.filter((_, i) => garde[`obj:${i}`]).length}>
            {plan.objectifs.map((o, i) => {
              const actif = Boolean(garde[`obj:${i}`]);
              return (
                <div
                  key={`obj-${i}`}
                  className="flex items-center gap-[8px] py-[4px]"
                  style={{ opacity: actif ? 1 : 0.35 }}
                >
                  <Coche actif={actif} onClick={() => onBasculer(`obj:${i}`)} />
                  <span className="min-w-0 flex-1 text-[12.5px] font-bold">{o.objectif}</span>
                  <span className="flex-none font-mono text-[10px] font-bold text-white/30">
                    {o.portee}
                  </span>
                </div>
              );
            })}
          </Bloc>
        )}

        {plan.skills.length > 0 && (
          <Bloc titre="TES COMPÉTENCES SUIVIES" nombre={plan.skills.filter((_, i) => garde[`skill:${i}`]).length}>
            <Puces
              items={plan.skills.map((s) => s.nom)}
              prefixe="skill"
              garde={garde}
              onBasculer={onBasculer}
            />
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
          disabled={retenus === 0}
          className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-[14px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-25"
          style={{ background: "var(--grad)" }}
        >
          {retenus === 0 ? "Rien de sélectionné" : `Mettre en place (${retenus})`}
        </button>
        {/* Ce que « mettre en place » ne fait PAS : dit ici, avant le geste. */}
        <p className="mt-[9px] text-center text-[11px] font-bold leading-[1.4] text-white/30">
          Rien n&apos;est remplacé — tout s&apos;ajoute à ce que tu as déjà.
        </p>
      </div>
    </div>
  );
}

/** La case à cocher des éléments du plan : 32 px de haut au doigt. */
function Coche({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      aria-label={actif ? "Retirer cet élément" : "Garder cet élément"}
      className="flex h-[32px] w-[26px] flex-none cursor-pointer items-center justify-center"
    >
      <span
        className="flex h-[19px] w-[19px] items-center justify-center rounded-[6px] text-[11px] font-black"
        style={{
          background: actif ? "var(--color-ver)" : "transparent",
          border: `2px solid ${actif ? "var(--color-ver)" : "rgba(255,255,255,0.18)"}`,
          color: "#07121d",
        }}
      >
        {actif ? "✓" : ""}
      </span>
    </button>
  );
}

/** Les listes courtes — habitudes, compétences — en puces cochables. */
function Puces({
  items,
  prefixe,
  garde,
  onBasculer,
}: {
  items: string[];
  prefixe: string;
  garde: Record<string, boolean>;
  onBasculer: (cle: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[6px]">
      {items.map((nom, i) => {
        const actif = Boolean(garde[`${prefixe}:${i}`]);
        return (
          <button
            key={`${prefixe}-${i}`}
            type="button"
            onClick={() => onBasculer(`${prefixe}:${i}`)}
            aria-pressed={actif}
            className="flex min-h-[34px] cursor-pointer items-center gap-[6px] rounded-full px-[10px] py-[5px] text-[11.5px] font-bold transition-all"
            style={{
              background: actif ? "rgba(61,220,132,0.13)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${actif ? "rgba(61,220,132,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: actif ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
            }}
          >
            <span style={{ color: actif ? "var(--color-ver)" : "rgba(255,255,255,0.2)" }}>
              {actif ? "✓" : "+"}
            </span>
            {nom}
          </button>
        );
      })}
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
