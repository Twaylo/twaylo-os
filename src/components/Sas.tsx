"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CATEGORIES_BLOC } from "@/lib/journees";
import { LONGUEUR_PRECISION, PROFILS, QUESTIONS, type Reponses } from "@/lib/sas";
import { AMBIANCE_PAR_PROFIL } from "@/lib/custom";
import { BLOC_PAR_ID, MODULES_COEUR, MODULE_PAR_ID } from "@/lib/modules";
import { Bulle, Mascotte, type Humeur } from "@/components/Mascotte";
import type { PlanOs } from "@/lib/sas-plan";
import { purgerCachesLocaux } from "@/lib/storage";

/**
 * Le sas d'accueil.
 *
 * UNE chose par écran, et rien d'autre : une question, de l'air, un bouton en
 * bas. C'est la forme des applications qu'on finit d'installer, et elle ne
 * tient pas à la décoration — elle tient à ce qu'on RETIRE. Pas de sous-titre
 * explicatif sous chaque option, pas de deux colonnes, pas de bouton
 * secondaire posé à côté du principal.
 *
 * Trois décisions structurent le reste :
 *
 * 1. LE COMPTE ARRIVE APRÈS LES QUESTIONS. Demander un mot de passe au premier
 *    écran, c'est demander un engagement avant d'avoir rien montré. On répond
 *    d'abord — c'est court, et ça se fait au pouce — et le compte se crée au
 *    moment où l'espace va exister. La route de construction, elle, reste
 *    derrière la porte : elle appelle un modèle payant.
 * 2. LA COULEUR VIENT DU PROFIL. Dès l'écran suivant, la jauge, les coches, le
 *    halo et le compagnon prennent la teinte choisie. L'OS commence à être le
 *    sien avant même d'exister — et ce n'est jamais le dégradé de Twaylo.
 * 3. RIEN N'EST APPLIQUÉ SANS ÊTRE MONTRÉ, mais l'aperçu tient en six lignes.
 *    Qui veut trier ouvre une section ; les autres appuient sur le bouton.
 */

type Phase = "porte" | "parcours" | "compte" | "construction" | "apercu" | "pose";

/** Les écrans du parcours : prénom, profil, les quatre questions, la précision. */
const ETAPES = 1 + 1 + QUESTIONS.length + 1;

/** La teinte d'avant le choix du profil : le bleu neutre du produit. */
const BLEU = "#4f9cff";

export function Sas() {
  const [phase, setPhase] = useState<Phase>("porte");
  const [etape, setEtape] = useState(0);

  const [prenom, setPrenom] = useState("");
  const [profil, setProfil] = useState<string | null>(null);
  const [choix, setChoix] = useState<Record<string, string[]>>({});
  const [precision, setPrecision] = useState("");

  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauMdp, setNouveauMdp] = useState("");
  /** Vrai quand ce parcours doit se terminer par la création d'un compte. */
  const [nouveauCompte, setNouveauCompte] = useState(false);

  const [plan, setPlan] = useState<PlanOs | null>(null);
  /**
   * Ce qu'on GARDE, coche par coche.
   *
   * Séparé du plan lui-même : décocher un bloc ne doit pas l'effacer, sinon on
   * ne peut plus le récupérer d'un second appui. La clé est « type:position » —
   * le plan ne change pas d'ordre entre l'aperçu et la mise en place.
   */
  const [garde, setGarde] = useState<Record<string, boolean>>({});
  const [secours, setSecours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<Record<string, number> | null>(null);

  /*
   * A-t-on déjà un OS ouvert dans ce navigateur ?
   *
   * `null` tant qu'on ne sait pas. La question se pose à une route déjà
   * fermée, qui répond 401 sans session : aucune route nouvelle à ouvrir.
   */
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useEffect(() => {
    let annule = false;
    void fetch("/api/custom", { cache: "no-store" })
      .then((r) => {
        if (!annule) setConnecte(r.status !== 401);
      })
      .catch(() => {
        if (!annule) setConnecte(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  const teinte = PROFILS.find((p) => p.id === profil)?.couleur ?? BLEU;
  const question = etape >= 2 && etape < 2 + QUESTIONS.length ? QUESTIONS[etape - 2] : null;

  /** L'écran courant est-il répondu ? Sinon, le bouton reste éteint. */
  const repondu = useMemo(() => {
    if (etape === 0) return prenom.trim().length >= 1;
    if (etape === 1) return profil !== null;
    if (question) return (choix[question.id] ?? []).length > 0;
    return true; // la précision est facultative
  }, [etape, prenom, profil, question, choix]);

  const basculer = useCallback((idQuestion: string, idChoix: string, multiple: boolean) => {
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
  }, []);

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
       * 401 : pas de session. On ne renvoie pas à l'écran d'accueil les mains
       * vides — les réponses sont en mémoire, on demande juste le compte et on
       * enchaîne tout seul.
       */
      if (r.status === 401) {
        setErreur("Il te faut un OS pour continuer. Crée-le ici, ça prend dix secondes.");
        setNouveauCompte(true);
        setPhase("compte");
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
        ["mod", d.plan.espace.modules.length],
        ["carte", d.plan.espace.blocs.length],
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
        err instanceof Error && err.message.length < 120 ? err.message : "La construction a échoué.",
      );
      setPhase("parcours");
    }
  }, [profil, choix, precision]);

  /** Le plan réellement appliqué : seulement ce qui est resté coché. */
  const planRetenu = useMemo(() => {
    if (!plan) return null;
    const modules = plan.espace.modules.filter((_, i) => garde[`mod:${i}`]);
    return {
      ...plan,
      nom: prenom.trim(),
      ambiance: AMBIANCE_PAR_PROFIL[plan.profil] ?? "bleu",
      blocs: plan.blocs.filter((_, i) => garde[`bloc:${i}`]),
      habitudes: plan.habitudes.filter((_, i) => garde[`hab:${i}`]),
      objectifs: plan.objectifs.filter((_, i) => garde[`obj:${i}`]),
      skills: plan.skills.filter((_, i) => garde[`skill:${i}`]),
      espace: {
        modules,
        /*
         * Une carte dont l'onglet vient d'être décoché ne part pas : sinon
         * l'accueil se remplirait tout seul le jour où l'onglet revient, sans
         * que personne ne l'ait demandé.
         */
        blocs: plan.espace.blocs.filter((id, i) => {
          if (!garde[`carte:${i}`]) return false;
          const requis = BLOC_PAR_ID.get(id)?.module;
          return !requis || modules.includes(requis);
        }),
      },
    };
  }, [plan, garde, prenom]);

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

  const creerCompte = useCallback(async () => {
    setErreur(null);
    try {
      const r = await fetch("/api/auth/creer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: nouveauNom, motDePasse: nouveauMdp }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErreur(d.error ?? "Création impossible.");
        return;
      }
      /*
       * On change d'OS : la mémoire du navigateur doit repartir de zéro.
       *
       * Les caches locaux (tâches, journée, réglages) ne sont pas rangés par
       * compte. Sans ce nettoyage, le nouvel OS s'ouvrait rempli des données
       * du précédent — exactement ce que la séparation des comptes cherche à
       * empêcher.
       */
      purgerCachesLocaux();
      setConnecte(true);
      await construire();
    } catch (err) {
      console.error("[sas] création impossible :", err);
      setErreur("Création impossible. Réessaie dans un instant.");
    }
  }, [nouveauNom, nouveauMdp, construire]);

  /** Avancer d'un écran ; au bout, vers le compte ou droit à la construction. */
  const suivant = useCallback(() => {
    if (etape < ETAPES - 1) {
      setEtape((e) => e + 1);
      return;
    }
    if (nouveauCompte || connecte === false) {
      // Le nom de compte se déduit du prénom : un champ de moins à remplir.
      setNouveauNom((n) => n || prenom.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      setPhase("compte");
      return;
    }
    void construire();
  }, [etape, nouveauCompte, connecte, prenom, construire]);

  const reculer = useCallback(() => {
    setErreur(null);
    if (phase === "compte") {
      setPhase("parcours");
      return;
    }
    if (phase !== "parcours") return;
    if (etape === 0) setPhase("porte");
    else setEtape((e) => e - 1);
  }, [phase, etape]);

  return (
    <div className="sas-ecran relative overflow-hidden" style={{ ["--teinte" as string]: teinte }}>
      {/* Le halo prend la teinte du profil : l'écran change de couleur au choix. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -right-[140px] -top-[180px] h-[430px] w-[430px] rounded-full blur-[90px] transition-[background] duration-700"
          style={{ background: `radial-gradient(circle, ${teinte}26, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-[200px] -left-[150px] h-[420px] w-[420px] rounded-full blur-[90px] transition-[background] duration-700"
          style={{ background: `radial-gradient(circle, ${teinte}14, transparent 70%)` }}
        />
      </div>

      {phase === "porte" && (
        <Porte
          connecte={connecte}
          onContinuer={() => {
            setNouveauCompte(false);
            setPhase("parcours");
          }}
          onCreer={() => {
            setNouveauCompte(true);
            setPhase("parcours");
          }}
        />
      )}

      {phase === "parcours" && (
        <>
          <BarreHaut etape={etape} total={ETAPES} onRetour={reculer} />
          <div className="sas-corps">
            {etape === 0 && (
              <EcranPrenom valeur={prenom} onChange={setPrenom} onValider={suivant} />
            )}
            {etape === 1 && <EcranProfil choisi={profil} onChoisir={setProfil} />}
            {question && (
              <EcranQuestion
                key={question.id}
                question={question}
                choisis={choix[question.id] ?? []}
                teinte={teinte}
                onBasculer={(id) => basculer(question.id, id, Boolean(question.multiple))}
              />
            )}
            {etape === ETAPES - 1 && (
              <EcranPrecision valeur={precision} onChange={setPrecision} prenom={prenom} />
            )}
          </div>
          <PiedBouton
            libelle={etape === ETAPES - 1 ? "Construire mon OS" : "Continuer"}
            actif={repondu}
            teinte={teinte}
            erreur={erreur}
            onClic={suivant}
            secondaire={
              etape === ETAPES - 1 && precision.trim() === ""
                ? { libelle: "Passer", onClic: suivant }
                : undefined
            }
          />
        </>
      )}

      {phase === "compte" && (
        <>
          <BarreHaut etape={ETAPES} total={ETAPES} onRetour={reculer} />
          <div className="sas-corps">
            <EcranCompte
              prenom={prenom}
              nom={nouveauNom}
              mdp={nouveauMdp}
              teinte={teinte}
              onNom={setNouveauNom}
              onMdp={setNouveauMdp}
            />
          </div>
          <PiedBouton
            libelle="Créer mon OS"
            actif={nouveauNom.trim().length >= 2 && nouveauMdp.length >= 8}
            teinte={teinte}
            erreur={erreur}
            onClic={() => void creerCompte()}
          />
        </>
      )}

      {phase === "construction" && <EnConstruction teinte={teinte} prenom={prenom} />}

      {phase === "apercu" && plan && (
        <Apercu
          plan={plan}
          garde={garde}
          secours={secours}
          erreur={erreur}
          teinte={teinte}
          prenom={prenom}
          onBasculer={(cle) => setGarde((g) => ({ ...g, [cle]: !g[cle] }))}
          onModifierBloc={(i, champ, valeur) =>
            setPlan((p) =>
              p === null
                ? p
                : { ...p, blocs: p.blocs.map((b, j) => (j === i ? { ...b, [champ]: valeur } : b)) },
            )
          }
          onAppliquer={() => void appliquer()}
        />
      )}

      {phase === "pose" && <Termine bilan={bilan} teinte={teinte} prenom={prenom} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Le châssis : barre du haut, pied                                    */
/* ------------------------------------------------------------------ */

/**
 * Flèche de retour et jauge segmentée.
 *
 * Segmentée, pas continue : une barre qui avance de 14 % ne dit rien, sept
 * traits dont trois sont pleins disent « il en reste quatre ». C'est la seule
 * information qui empêche d'abandonner au troisième écran.
 */
function BarreHaut({
  etape,
  total,
  onRetour,
}: {
  etape: number;
  total: number;
  onRetour: () => void;
}) {
  return (
    <header
      className="relative z-[1] flex items-center gap-[12px] px-[18px] pb-[12px]"
      style={{ paddingTop: "calc(14px + env(safe-area-inset-top, 0px))" }}
    >
      <button
        type="button"
        onClick={onRetour}
        aria-label="Revenir en arrière"
        className="flex h-[44px] w-[34px] flex-none cursor-pointer items-center text-[25px] font-black text-white/30 transition-colors hover:text-white/70"
      >
        ←
      </button>
      <div
        className="sas-jauge"
        role="progressbar"
        aria-valuenow={Math.min(etape + 1, total)}
        aria-valuemin={1}
        aria-valuemax={total}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= etape ? "faite" : ""} />
        ))}
      </div>
    </header>
  );
}

/**
 * Le pied : UN bouton, pleine largeur, toujours au même endroit.
 *
 * « Toujours au même endroit » est la partie qui compte. Un bouton qui se
 * déplace d'un écran à l'autre oblige à le chercher à chaque fois ; ici le
 * pouce sait où aller sans regarder, et l'enchaînement se fait à l'aveugle.
 */
function PiedBouton({
  libelle,
  actif,
  teinte,
  erreur,
  onClic,
  secondaire,
}: {
  libelle: string;
  actif: boolean;
  teinte: string;
  erreur?: string | null;
  onClic: () => void;
  secondaire?: { libelle: string; onClic: () => void };
}) {
  return (
    <footer
      className="relative z-[1] flex flex-col gap-[10px] px-[18px] pt-[10px]"
      style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
    >
      {erreur && (
        <p
          className="rounded-[12px] px-[13px] py-[10px] text-center text-[12.5px] font-bold leading-[1.35]"
          style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.11)" }}
        >
          {erreur}
        </p>
      )}
      {secondaire && (
        <button
          type="button"
          onClick={secondaire.onClic}
          className="min-h-[40px] cursor-pointer text-[13px] font-extrabold uppercase tracking-[0.06em] text-white/30 transition-colors hover:text-white/60"
        >
          {secondaire.libelle}
        </button>
      )}
      <button
        type="button"
        onClick={onClic}
        disabled={!actif}
        className="sas-bouton"
        style={{
          background: teinte,
          boxShadow: actif ? `0 5px 0 0 color-mix(in srgb, ${teinte} 58%, #000)` : "none",
        }}
      >
        {libelle}
      </button>
    </footer>
  );
}

/** Le compagnon et sa bulle, en tête d'écran. */
function Dit({
  texte,
  humeur = "neutre",
  teinte,
}: {
  texte: string;
  humeur?: Humeur;
  teinte: string;
}) {
  return (
    <div className="flex items-start gap-[10px]">
      <Mascotte humeur={humeur} couleur={teinte} taille={80} />
      <div className="min-w-0 flex-1 pt-[10px]">
        <Bulle>{texte}</Bulle>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les écrans                                                          */
/* ------------------------------------------------------------------ */

/**
 * La porte d'entrée.
 *
 * Pour un inconnu, c'est l'écran d'accueil d'une application : le nom en très
 * grand, une promesse d'une ligne, un bouton plein, un lien de connexion.
 * Pour quelqu'un de déjà connecté, c'est le choix entre enrichir son OS et en
 * ouvrir un second.
 */
function Porte({
  connecte,
  onContinuer,
  onCreer,
}: {
  connecte: boolean | null;
  onContinuer: () => void;
  onCreer: () => void;
}) {
  return (
    <>
      <div className="sas-corps sas-in sas-sans-barre items-center justify-center text-center">
        <Mascotte humeur="salut" couleur={BLEU} taille={140} />
        <h1 className="mt-[24px] text-[42px] font-black leading-[1] tracking-[-0.045em] sm:text-[54px]">
          twaylo os
        </h1>
        <p className="mt-[13px] max-w-[290px] text-[16px] font-bold leading-[1.4] text-white/55">
          Ta journée, écrite d&apos;avance. Coche, monte de niveau, recommence.
        </p>
      </div>

      <footer
        className="relative z-[1] flex flex-col gap-[10px] px-[18px] pt-[10px]"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          onClick={onCreer}
          className="sas-bouton"
          style={{ background: BLEU, boxShadow: "0 5px 0 0 #2f6fd0" }}
        >
          Commencer
        </button>

        {connecte === true ? (
          <button type="button" onClick={onContinuer} className="sas-bouton sas-bouton-2">
            Continuer avec mon OS
          </button>
        ) : (
          <a href="/login" className="sas-bouton sas-bouton-2">
            J&apos;ai déjà un OS
          </a>
        )}
      </footer>
    </>
  );
}

/** « On t'appelle comment ? » — le premier écran, et le plus court. */
function EcranPrenom({
  valeur,
  onChange,
  onValider,
}: {
  valeur: string;
  onChange: (v: string) => void;
  onValider: () => void;
}) {
  return (
    <div className="sas-in">
      <Dit texte="On t'appelle comment ?" humeur="salut" teinte="var(--teinte)" />
      <h1 className="sas-titre mt-[26px]">Ton prénom</h1>
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value.slice(0, 24))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valeur.trim()) onValider();
        }}
        placeholder="Nico"
        autoFocus
        autoCapitalize="words"
        autoCorrect="off"
        aria-label="Ton prénom"
        className="mt-[16px] w-full rounded-[16px] px-[16px] py-[16px] text-[17px] font-bold outline-none placeholder:text-white/20"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "2px solid var(--teinte)",
          color: "var(--color-fg)",
        }}
      />
      <p className="mt-[10px] text-[12.5px] font-semibold text-white/35">
        Tu pourras en changer plus tard dans ton profil.
      </p>
    </div>
  );
}

/** Le profil : six grandes cartes, un seul appui. */
function EcranProfil({
  choisi,
  onChoisir,
}: {
  choisi: string | null;
  onChoisir: (id: string) => void;
}) {
  return (
    <div className="sas-in">
      <h1 className="sas-titre">Tu te reconnais dans quoi ?</h1>
      <p className="mt-[9px] text-[13.5px] font-semibold leading-[1.4] text-white/40">
        Un étudiant et un indépendant n&apos;ont pas la même journée.
      </p>
      <div className="sas-cascade mt-[20px] flex flex-col gap-[9px]">
        {PROFILS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChoisir(p.id)}
            aria-pressed={choisi === p.id}
            className="sas-choix"
            style={{ ["--teinte" as string]: p.couleur }}
          >
            <span className="text-[26px] leading-none">{p.emoji}</span>
            <span className="min-w-0 flex-1">{p.titre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Une question, ses choix. Rien d'autre à l'écran. */
function EcranQuestion({
  question,
  choisis,
  teinte,
  onBasculer,
}: {
  question: (typeof QUESTIONS)[number];
  choisis: string[];
  teinte: string;
  onBasculer: (id: string) => void;
}) {
  return (
    <div className="sas-in">
      <Dit texte={question.intitule} humeur="neutre" teinte={teinte} />
      <p className="mt-[16px] text-[13px] font-semibold leading-[1.4] text-white/35">
        {question.raison}
        {question.multiple && (
          <span className="ml-[5px] font-black" style={{ color: teinte }}>
            Plusieurs réponses possibles.
          </span>
        )}
      </p>
      <div className="sas-cascade mt-[18px] flex flex-col gap-[9px]">
        {question.choix.map((c) => {
          const pris = choisis.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onBasculer(c.id)}
              aria-pressed={pris}
              className="sas-choix"
            >
              {c.emoji && <span className="text-[22px] leading-none">{c.emoji}</span>}
              <span className="min-w-0 flex-1">{c.libelle}</span>
              {question.multiple && (
                <span
                  className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-[8px] text-[13px] font-black text-[#07121d]"
                  style={{
                    background: pris ? teinte : "transparent",
                    border: `2px solid ${pris ? teinte : "rgba(255,255,255,0.18)"}`,
                  }}
                >
                  {pris && "✓"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** La saisie libre : facultative, et on le dit. */
function EcranPrecision({
  valeur,
  onChange,
  prenom,
}: {
  valeur: string;
  onChange: (v: string) => void;
  prenom: string;
}) {
  return (
    <div className="sas-in">
      <Dit
        texte={`Autre chose que je devrais savoir${prenom.trim() ? `, ${prenom.trim()}` : ""} ?`}
        humeur="pense"
        teinte="var(--teinte)"
      />
      <p className="mt-[16px] text-[13px] font-semibold leading-[1.4] text-white/35">
        Une contrainte, un objectif précis, un métier. Ou rien — c&apos;est facultatif.
      </p>
      <textarea
        value={valeur}
        onChange={(e) => onChange(e.target.value.slice(0, LONGUEUR_PRECISION))}
        rows={4}
        aria-label="Précision libre"
        placeholder="Je bosse de nuit une semaine sur deux…"
        className="mt-[14px] w-full resize-none rounded-[16px] px-[15px] py-[14px] text-[15px] font-semibold outline-none placeholder:text-white/20"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "2px solid rgba(255,255,255,0.1)",
          color: "var(--color-fg)",
        }}
      />
      <div className="mt-[6px] text-right font-mono text-[11px] font-bold text-white/25">
        {valeur.length} / {LONGUEUR_PRECISION}
      </div>
    </div>
  );
}

/**
 * Le compte, en dernier.
 *
 * À ce stade la personne a répondu à sept écrans : elle est engagée, et le
 * formulaire n'est plus un péage mais la dernière marche. Le nom d'OS arrive
 * pré-rempli à partir du prénom — un champ de moins.
 */
function EcranCompte({
  prenom,
  nom,
  mdp,
  teinte,
  onNom,
  onMdp,
}: {
  prenom: string;
  nom: string;
  mdp: string;
  teinte: string;
  onNom: (v: string) => void;
  onMdp: (v: string) => void;
}) {
  return (
    <div className="sas-in">
      <Dit
        texte={`Dernière étape${prenom.trim() ? `, ${prenom.trim()}` : ""} !`}
        humeur="content"
        teinte={teinte}
      />
      <h1 className="sas-titre mt-[24px]">On garde tout ça où ?</h1>
      <p className="mt-[9px] text-[13px] font-semibold leading-[1.4] text-white/40">
        Un nom, un mot de passe, et ton OS est à toi.
      </p>

      <label className="mt-[18px] block">
        <span className="mb-[6px] block text-[11px] font-black tracking-[0.1em] text-white/30">
          NOM DE TON OS
        </span>
        <input
          value={nom}
          onChange={(e) => onNom(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="nico"
          className="w-full rounded-[16px] px-[16px] py-[15px] text-[16px] font-bold outline-none placeholder:text-white/20"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "2px solid rgba(255,255,255,0.1)",
            color: "var(--color-fg)",
          }}
        />
      </label>

      <label className="mt-[12px] block">
        <span className="mb-[6px] block text-[11px] font-black tracking-[0.1em] text-white/30">
          MOT DE PASSE
        </span>
        <input
          value={mdp}
          onChange={(e) => onMdp(e.target.value)}
          type="password"
          placeholder="8 caractères minimum"
          className="w-full rounded-[16px] px-[16px] py-[15px] text-[16px] font-bold outline-none placeholder:text-white/20"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "2px solid rgba(255,255,255,0.1)",
            color: "var(--color-fg)",
          }}
        />
      </label>

      {/* Il n'y a pas de « mot de passe oublié » : on le dit AVANT. */}
      <p className="mt-[12px] text-[12px] font-bold leading-[1.4] text-white/30">
        Note-le quelque part : il n&apos;y a aucun moyen de le retrouver.
      </p>
    </div>
  );
}

/** L'attente. Le compagnon réfléchit, la barre avance toute seule. */
function EnConstruction({ teinte, prenom }: { teinte: string; prenom: string }) {
  return (
    <div className="sas-corps sas-sans-barre items-center justify-center text-center">
      <Mascotte humeur="pense" couleur={teinte} taille={128} />
      <p className="mt-[24px] text-[19px] font-black leading-[1.2]">
        Je monte ton espace{prenom.trim() ? `, ${prenom.trim()}` : ""}…
      </p>
      <p className="mt-[8px] max-w-[290px] text-[13.5px] font-semibold leading-[1.4] text-white/40">
        Journée type, habitudes, objectifs et compétences. Quelques secondes.
      </p>
      <div className="lancement-piste mt-[26px]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* L'aperçu                                                            */
/* ------------------------------------------------------------------ */

/**
 * Ce qui va être posé, en six lignes.
 *
 * La version précédente dépliait tout : une trentaine de cases à cocher sur un
 * seul écran, juste avant la ligne d'arrivée. On en lit trois et on appuie
 * sans regarder — ce qui rend le tri inutile ET donne l'impression d'avoir
 * accepté quelque chose qu'on n'a pas lu.
 *
 * Ici chaque partie tient sur une ligne : un emoji, un compte, les premiers
 * noms. Qui veut trier ouvre la section. Le bouton reste en bas, seul, comme
 * sur tous les autres écrans.
 */
function Apercu({
  plan,
  garde,
  secours,
  erreur,
  teinte,
  prenom,
  onBasculer,
  onModifierBloc,
  onAppliquer,
}: {
  plan: PlanOs;
  garde: Record<string, boolean>;
  secours: boolean;
  erreur: string | null;
  teinte: string;
  prenom: string;
  onBasculer: (cle: string) => void;
  onModifierBloc: (i: number, champ: "debut" | "fin" | "titre", valeur: string) => void;
  onAppliquer: () => void;
}) {
  const compte = (prefixe: string, n: number) =>
    Array.from({ length: n }, (_, i) => i).filter((i) => garde[`${prefixe}:${i}`]).length;

  return (
    <>
      <div className="sas-corps sas-in sas-sans-barre">
        <Dit
          texte={`C'est prêt${prenom.trim() ? `, ${prenom.trim()}` : ""} !`}
          humeur="bravo"
          teinte={teinte}
        />
        <h1 className="sas-titre mt-[22px]">Voilà ton OS.</h1>
        <p className="mt-[9px] text-[13.5px] font-semibold leading-[1.45] text-white/45">
          {secours
            ? "L'assistant n'a pas répondu : voici la base de ton profil. Tout se modifie."
            : plan.resume || "Tout se modifie, maintenant comme plus tard."}
        </p>

        <div className="mt-[18px] flex flex-col gap-[8px]">
          <Section
            emoji="🧩"
            titre="Tes onglets"
            n={compte("mod", plan.espace.modules.length)}
            apercu={plan.espace.modules.slice(0, 4).join(" · ")}
            teinte={teinte}
          >
            <div className="flex flex-wrap gap-[6px]">
              {plan.espace.modules.map((id, i) => {
                const fixe = MODULES_COEUR.includes(id);
                const actif = fixe || Boolean(garde[`mod:${i}`]);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => !fixe && onBasculer(`mod:${i}`)}
                    disabled={fixe}
                    aria-pressed={actif}
                    className="min-h-[40px] cursor-pointer rounded-full px-[13px] text-[13px] font-extrabold transition-all disabled:cursor-default"
                    style={
                      actif
                        ? { color: "#07121d", background: teinte }
                        : {
                            color: "rgba(255,255,255,0.4)",
                            background: "rgba(255,255,255,0.04)",
                            border: "1.5px dashed rgba(255,255,255,0.15)",
                          }
                    }
                  >
                    {MODULE_PAR_ID.get(id)?.emoji} {id}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            emoji="🏠"
            titre="Ton accueil"
            n={compte("carte", plan.espace.blocs.length)}
            apercu={plan.espace.blocs
              .slice(0, 4)
              .map((id) => BLOC_PAR_ID.get(id)?.titre ?? id)
              .join(" · ")}
            teinte={teinte}
          >
            {plan.espace.blocs.map((id, i) => (
              <Ligne
                key={id}
                actif={Boolean(garde[`carte:${i}`])}
                teinte={teinte}
                onBasculer={() => onBasculer(`carte:${i}`)}
              >
                <span className="text-[14px] font-bold">
                  {BLOC_PAR_ID.get(id)?.emoji} {BLOC_PAR_ID.get(id)?.titre ?? id}
                </span>
              </Ligne>
            ))}
          </Section>

          {plan.blocs.length > 0 && (
            <Section
              emoji="🗓️"
              titre="Ta journée type"
              n={compte("bloc", plan.blocs.length)}
              apercu={plan.blocs
                .slice(0, 5)
                .map((b) => b.debut)
                .join(" · ")}
              teinte={teinte}
            >
              {/*
                Modifiable SUR PLACE. Un horaire qu'il faut aller changer
                ailleurs après coup n'est jamais changé : la journée est
                acceptée telle quelle, puis abandonnée parce qu'elle ne colle
                pas.
              */}
              {plan.blocs.map((b, i) => {
                const actif = Boolean(garde[`bloc:${i}`]);
                return (
                  <Ligne
                    key={`bloc-${i}`}
                    actif={actif}
                    teinte={teinte}
                    onBasculer={() => onBasculer(`bloc:${i}`)}
                  >
                    <span
                      className="h-[8px] w-[8px] flex-none rounded-full"
                      style={{ background: CATEGORIES_BLOC[b.categorie].couleur }}
                    />
                    <input
                      type="time"
                      value={b.debut}
                      disabled={!actif}
                      onChange={(e) => onModifierBloc(i, "debut", e.target.value)}
                      aria-label={`Heure de ${b.titre}`}
                      className="w-[72px] flex-none rounded-[9px] bg-transparent px-[5px] py-[6px] font-mono text-[12.5px] font-bold text-white/70 outline-none [color-scheme:dark]"
                      style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <input
                      value={b.titre}
                      disabled={!actif}
                      onChange={(e) => onModifierBloc(i, "titre", e.target.value.slice(0, 60))}
                      aria-label={`Intitulé du bloc de ${b.debut}`}
                      className="min-w-0 flex-1 rounded-[9px] bg-transparent px-[8px] py-[6px] text-[14px] font-bold outline-none"
                      style={{
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "var(--color-fg)",
                      }}
                    />
                  </Ligne>
                );
              })}
            </Section>
          )}

          {plan.habitudes.length > 0 && (
            <Section
              emoji="☑️"
              titre="Tes habitudes"
              n={compte("hab", plan.habitudes.length)}
              apercu={plan.habitudes
                .slice(0, 3)
                .map((h) => h.nom)
                .join(" · ")}
              teinte={teinte}
            >
              {plan.habitudes.map((h, i) => (
                <Ligne
                  key={`hab-${i}`}
                  actif={Boolean(garde[`hab:${i}`])}
                  teinte={teinte}
                  onBasculer={() => onBasculer(`hab:${i}`)}
                >
                  <span className="text-[14px] font-bold">{h.nom}</span>
                </Ligne>
              ))}
            </Section>
          )}

          {plan.objectifs.length > 0 && (
            <Section
              emoji="🎯"
              titre="Tes objectifs"
              n={compte("obj", plan.objectifs.length)}
              apercu={plan.objectifs
                .slice(0, 2)
                .map((o) => o.objectif)
                .join(" · ")}
              teinte={teinte}
            >
              {plan.objectifs.map((o, i) => (
                <Ligne
                  key={`obj-${i}`}
                  actif={Boolean(garde[`obj:${i}`])}
                  teinte={teinte}
                  onBasculer={() => onBasculer(`obj:${i}`)}
                >
                  <span className="min-w-0 flex-1 text-[14px] font-bold">{o.objectif}</span>
                  <span className="flex-none font-mono text-[11px] font-bold text-white/30">
                    {o.portee}
                  </span>
                </Ligne>
              ))}
            </Section>
          )}

          {plan.skills.length > 0 && (
            <Section
              emoji="📈"
              titre="Tes compétences"
              n={compte("skill", plan.skills.length)}
              apercu={plan.skills
                .slice(0, 3)
                .map((s) => s.nom)
                .join(" · ")}
              teinte={teinte}
            >
              {plan.skills.map((s, i) => (
                <Ligne
                  key={`skill-${i}`}
                  actif={Boolean(garde[`skill:${i}`])}
                  teinte={teinte}
                  onBasculer={() => onBasculer(`skill:${i}`)}
                >
                  <span className="text-[14px] font-bold">{s.nom}</span>
                </Ligne>
              ))}
            </Section>
          )}
        </div>

        <p className="mt-[16px] text-center text-[12px] font-semibold leading-[1.4] text-white/25">
          Rien n&apos;est remplacé : tout s&apos;ajoute, et tout se change après.
        </p>
      </div>

      <PiedBouton libelle="C'est parti" actif teinte={teinte} erreur={erreur} onClic={onAppliquer} />
    </>
  );
}

/** Une partie de l'aperçu : refermée par défaut, dépliable d'un appui. */
function Section({
  emoji,
  titre,
  n,
  apercu,
  teinte,
  children,
}: {
  emoji: string;
  titre: string;
  n: number;
  apercu: string;
  teinte: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className="overflow-hidden rounded-[16px]"
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <summary className="flex min-h-[62px] cursor-pointer list-none items-center gap-[12px] px-[14px] py-[11px]">
        <span className="text-[22px] leading-none">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-[7px]">
            <span className="text-[14.5px] font-black">{titre}</span>
            <span className="font-mono text-[12px] font-black" style={{ color: teinte }}>
              {n}
            </span>
          </span>
          <span className="mt-[2px] block truncate text-[11.5px] font-semibold text-white/35">
            {apercu}
          </span>
        </span>
        {/*
          Un chevron, pas un crayon.
          Le « ✎ » sortait en glyphe minuscule et illisible selon la police
          système ; un chevron qui pivote à l'ouverture dit à la fois « ça
          s'ouvre » et « c'est ouvert », sans dépendre d'aucun jeu d'emoji.
        */}
        <span className="chevron-section flex-none text-[17px] font-black text-white/25">›</span>
      </summary>
      <div className="flex flex-col gap-[6px] px-[14px] pb-[13px]">{children}</div>
    </details>
  );
}

/** Une ligne cochable de l'aperçu. */
function Ligne({
  actif,
  teinte,
  onBasculer,
  children,
}: {
  actif: boolean;
  teinte: string;
  onBasculer: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-[10px]" style={{ opacity: actif ? 1 : 0.35 }}>
      <button
        type="button"
        onClick={onBasculer}
        aria-pressed={actif}
        aria-label={actif ? "Retirer" : "Garder"}
        className="flex h-[26px] w-[26px] flex-none cursor-pointer items-center justify-center rounded-[9px] text-[13px] font-black text-[#07121d] transition-all"
        style={{
          background: actif ? teinte : "transparent",
          border: `2px solid ${actif ? teinte : "rgba(255,255,255,0.2)"}`,
        }}
      >
        {actif && "✓"}
      </button>
      {children}
    </div>
  );
}

/** L'arrivée. Une seule chose à faire : ouvrir son OS. */
function Termine({
  bilan,
  teinte,
  prenom,
}: {
  bilan: Record<string, number> | null;
  teinte: string;
  prenom: string;
}) {
  const lignes = [
    ["onglets", bilan?.modules ?? 0],
    ["blocs d'accueil", bilan?.blocs ?? 0],
    ["blocs de journée", bilan?.journee ?? 0],
    ["habitudes", bilan?.habitudes ?? 0],
    ["objectifs", bilan?.objectifs ?? 0],
    ["compétences", bilan?.skills ?? 0],
  ] as const;

  return (
    <>
      <div className="sas-corps sas-in sas-sans-barre items-center justify-center text-center">
        <Mascotte humeur="bravo" couleur={teinte} taille={128} />
        <h1 className="mt-[22px] text-[30px] font-black leading-[1.1] tracking-[-0.03em]">
          Ton OS est prêt{prenom.trim() ? `, ${prenom.trim()}` : ""}.
        </h1>
        <p className="mt-[10px] max-w-[300px] text-[14px] font-semibold leading-[1.45] text-white/50">
          La première coche débloque tout le reste.
        </p>

        <div className="mt-[22px] flex flex-wrap justify-center gap-[7px]">
          {lignes
            .filter(([, n]) => n > 0)
            .map(([nom, n]) => (
              <span
                key={nom}
                className="rounded-full px-[11px] py-[6px] text-[12px] font-bold text-white/60"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <span className="font-mono font-black" style={{ color: teinte }}>
                  +{n}
                </span>{" "}
                {nom}
              </span>
            ))}
        </div>
      </div>

      {/*
        Un rechargement COMPLET, pas une navigation interne.
        Le contexte de l'OS a déjà lu la base au démarrage ; une navigation
        côté client le laisserait tel quel, et on arriverait sur un tableau de
        bord qui ignore la journée type qu'on vient de poser.
      */}
      <PiedBouton
        libelle="Ouvrir mon OS"
        actif
        teinte={teinte}
        onClic={() => {
          window.location.href = "/";
        }}
      />
    </>
  );
}
