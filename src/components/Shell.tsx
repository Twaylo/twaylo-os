"use client";

import { useEffect, useRef, useState } from "react";
import { CockpitProvider, useCockpit } from "@/lib/p90-context";
import { compteARebours } from "@/lib/p90";
import { TodoView } from "@/components/views/TodoView";
import { KanbanView } from "@/components/views/KanbanView";
import { SponsorsView } from "@/components/views/SponsorsView";
import { ObjectifsView } from "@/components/views/ObjectifsView";
import { RevueView } from "@/components/views/RevueView";
import { OubliesView } from "@/components/views/OubliesView";

/**
 * LE COCKPIT.
 *
 * Six onglets, et la todo en premier parce que c'est 90 % de l'usage réel.
 * Quatre modules portent le PROJECT 90 — todo, Kanban, sponsors, objectifs —
 * et deux restent en appui : la revue de semaine, et les Oubliés qui servent
 * de sauvegarde à ce qu'on supprime.
 *
 * Il y en avait treize. Les sept autres (Brain, Bilan, Journée type, Contacts,
 * Contenu, Revenus, Journal, Habitudes, Skill) ne servaient plus : les garder
 * « au cas où » coûtait une barre de navigation qu'on parcourt des yeux avant
 * de trouver la todo, quarante fois par jour.
 *
 * Le bandeau, lui, est celui d'origine : le logo, le rail en pastilles où
 * l'onglet actif porte le dégradé signature, et les trois halos de couleur en
 * fond. Seuls les chiffres de droite ont changé — les abonnés YouTube ont
 * laissé la place aux deux comptes à rebours des 90 jours.
 */

const ONGLETS = {
  "To-do": TodoView,
  Kanban: KanbanView,
  Sponsors: SponsorsView,
  Objectifs: ObjectifsView,
  Revue: RevueView,
  Oubliés: OubliesView,
} as const;

type Onglet = keyof typeof ONGLETS;
const NOMS = Object.keys(ONGLETS) as Onglet[];

/** L'onglet ouvert survit au rechargement : on reprend là où on était. */
const CLE_ONGLET = "twaylo-p90-onglet";

/**
 * Les trois halos flous en fond. Purement décoratifs.
 *
 * Ils sont enfermés dans un cadre qui les coupe, et c'est tout l'enjeu : posés
 * en débordement volontaire (140 px au-dessus, 160 px SOUS la page), ils
 * agrandiraient sinon la zone défilable du document — 160 px de défilement
 * fantôme en bas de chaque onglet, du vide qu'un premier geste consomme avant
 * que la page ne bouge vraiment.
 *
 * Le cadre est `absolute inset-0` : il épouse exactement la page, ne s'ajoute
 * donc jamais à sa hauteur, et `overflow-hidden` rogne ce qui dépasse — ce qui
 * n'était de toute façon pas visible.
 */
function Glow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -right-[100px] -top-[140px] h-[460px] w-[460px] rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--halo-1), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-[160px] -left-20 h-[440px] w-[440px] rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--halo-2), transparent 70%)" }}
      />
      <div
        className="absolute left-1/2 top-[38%] h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--halo-3), transparent 70%)" }}
      />
    </div>
  );
}

/** Le logo : le triangle play du dégradé signature, et le mot. */
function Logo({ surClic }: { surClic: () => void }) {
  return (
    <button
      type="button"
      onClick={surClic}
      title="Retour à la todo"
      className="flex cursor-pointer items-center gap-[11px] bg-transparent"
    >
      <div className="logo-mark relative h-[38px] w-[38px] overflow-hidden rounded-xl">
        <svg width="38" height="38" viewBox="0 0 38 38" className="block">
          <defs>
            <linearGradient id="playGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff3d8b" />
              <stop offset="0.38" stopColor="#ffc63d" />
              <stop offset="0.7" stopColor="#3ddc84" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <rect x="1" y="1" width="36" height="36" rx="11" fill="rgba(255,255,255,0.05)" />
          <path d="M14 11 L28 19 L14 27 Z" fill="url(#playGrad)" />
        </svg>
        <div
          className="logo-sweep absolute left-0 top-0 h-full w-2/5"
          style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)" }}
        />
      </div>
      <span className="logo-word inline-block text-[22px] font-black tracking-[-0.02em]">twaylo</span>
    </button>
  );
}

/**
 * L'horloge reste côté client : la rendre au serveur produirait une heure
 * serveur différente de l'heure du navigateur et casserait l'hydratation.
 */
function useHorloge() {
  const [maintenant, setMaintenant] = useState<Date | null>(null);

  useEffect(() => {
    /*
     * La première lecture passe par `queueMicrotask`, et ce n'est pas un
     * caprice de linter : poser l'état dans le corps de l'effet déclenche un
     * second rendu synchrone avant la peinture, que le compilateur React
     * refuse. La microtâche s'exécute elle aussi avant la peinture — l'heure
     * est donc à l'écran du premier coup, sans l'aller-retour.
     */
    queueMicrotask(() => setMaintenant(new Date()));
    const id = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!maintenant) return { date: "", heure: "" };
  return {
    date: maintenant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    heure: maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * Où en sont les données : dans la base, ou nulle part.
 *
 * Discret quand tout va bien, visible quand ça ne va pas. Twaylo doit pouvoir
 * savoir d'un coup d'œil si ce qu'il vient d'écrire est réellement à l'abri —
 * c'est toute la différence entre un carnet et un système.
 *
 * Elle dit aussi, depuis la relecture vivante, quand quelque chose est arrivé
 * de L'AUTRE écran : une seconde de cyan, et le mot « À JOUR ». C'est le seul
 * endroit où ça se voit sans rien connaître de la todo, et ça répond à la
 * question qui vient tout de suite quand un écran se met à jour tout seul :
 * est-ce que c'est vraiment en train de marcher ?
 */
function Base() {
  const { etatReseau, sursauts } = useCockpit();
  const [frais, setFrais] = useState(false);
  const premier = useRef(true);

  useEffect(() => {
    // Le compteur part à zéro : ce premier passage n'est pas un changement.
    if (premier.current) {
      premier.current = false;
      return;
    }
    // En micro-tâche, comme partout ici : un `setState` synchrone dans un
    // corps d'effet est une cascade de rendus que le compilateur refuse.
    let vivant = true;
    queueMicrotask(() => {
      if (vivant) setFrais(true);
    });
    const t = window.setTimeout(() => {
      if (vivant) setFrais(false);
    }, 1_100);
    return () => {
      vivant = false;
      window.clearTimeout(t);
    };
  }, [sursauts]);

  const etats = {
    inconnu: { couleur: "rgba(255,255,255,0.2)", texte: "…", titre: "Connexion en cours" },
    connecte: { couleur: "var(--color-ver)", texte: "BASE", titre: "Tout est enregistré dans ta base" },
    hors_ligne: {
      couleur: "var(--color-mag)",
      texte: "HORS LIGNE",
      titre: "La base ne répond pas — ce qui est tapé maintenant risque d'être perdu",
    },
  } as const;

  /*
   * Le signal d'arrivée passe DEVANT l'état.
   *
   * Quand la liste vient de changer toute seule, c'est ça qu'il faut lire —
   * pas « BASE », qui est là en permanence et qu'on ne lit plus.
   */
  const vu =
    frais && etatReseau === "connecte"
      ? {
          couleur: "var(--color-cya)",
          texte: "À JOUR",
          titre: "Quelque chose vient de changer sur ton autre écran",
        }
      : etats[etatReseau];

  return (
    <div
      title={vu.titre}
      className={`hidden flex-none items-center gap-[5px] rounded-full px-[9px] py-[4px] sm:flex ${frais ? "sync-fraiche" : ""}`}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <span
        className={`h-[6px] w-[6px] rounded-full ${etatReseau === "inconnu" ? "pulse-dot" : ""}`}
        style={{ background: vu.couleur }}
      />
      <span className="text-[8.5px] font-black tracking-[0.1em]" style={{ color: vu.couleur }}>
        {vu.texte}
      </span>
    </div>
  );
}

/**
 * LES DEUX COMPTES À REBOURS, à la place des chiffres YouTube.
 *
 * Deux dates décident de tout : le 1er novembre, quand Momentum ouvre, et le
 * 31 décembre, quand les 90 jours se jugent. Affichées en jours, pas en dates :
 * « J-26 » se lit sans calculer, « 1er novembre » demande de compter.
 */
function Comptes() {
  const { aujourdhui } = useCockpit();
  const r = compteARebours(aujourdhui);

  const lignes = [
    { label: "MOMENTUM OUVRE", valeur: r.versOuverture, chaud: r.versOuverture <= 7 },
    { label: "FIN DES 90 JOURS", valeur: r.versFin, chaud: false },
  ];

  return (
    /*
      Les deux compteurs restent à l'écran sur téléphone, contrairement aux
      chiffres YouTube qu'ils remplacent : ils ne sont pas décoratifs, ce sont
      les deux dates sur lesquelles toute la liste se range. Seuls leurs
      libellés et la barre d'avancement s'effacent quand la place manque.
    */
    <div className="flex items-center gap-[12px] lg:gap-[14px]">
      {lignes.map((l) => (
        <div key={l.label} className="leading-[1.15]">
          <div className="hidden text-[8px] font-black tracking-[0.1em] text-white/30 sm:block">{l.label}</div>
          <div
            className="nombres text-[13px] font-extrabold"
            style={{ color: l.chaud ? "var(--color-amb)" : undefined }}
          >
            {l.valeur < 0 ? `+${-l.valeur}` : `J-${l.valeur}`}
          </div>
        </div>
      ))}
      <div className="hidden leading-[1.15] lg:block">
        <div className="text-[8px] font-black tracking-[0.1em] text-white/30">AVANCEMENT</div>
        <div className="flex items-center gap-[6px]">
          <span className="bar-track block w-[60px]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, r.pctEcoule))}%`, background: "var(--grad)" }}
            />
          </span>
          <span className="nombres text-[10px] font-bold text-white/40">
            {r.ecoules}/{r.total}
          </span>
        </div>
      </div>
    </div>
  );
}

/** L'avatar : le peu qui restait du panneau de compte, c'est-à-dire sortir. */
function Compte() {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        title="Mon compte"
        /* 44 px au doigt, 38 à la souris : la règle d'Apple ne vaut que là où
           l'on vise avec un pouce. */
        className="block h-[44px] w-[44px] cursor-pointer rounded-full p-[2px] transition-all hover:brightness-125 lg:h-[38px] lg:w-[38px]"
        style={{ background: "var(--grad)" }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#07121d] text-[15px] font-black">
          T
        </span>
      </button>

      {ouvert && (
        <>
          {/* Cliquer à côté referme — réflexe attendu de tout menu. */}
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div
            role="dialog"
            aria-label="Mon compte"
            className="absolute right-0 top-[46px] z-50 w-[220px] rounded-[14px] p-[14px] shadow-2xl"
            style={{
              background: "rgba(11,24,38,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div className="text-[15px] font-black">Twaylo</div>
            <div className="mt-[2px] text-[11px] text-white/40">PROJECT 90</div>
            <button
              type="button"
              onClick={async () => {
                // La route renvoie du JSON : on redirige nous-mêmes plutôt que
                // d'atterrir sur `{"ok":true}` à l'écran.
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="mt-[13px] w-full cursor-pointer rounded-[9px] py-[8px] text-[11.5px] font-extrabold transition-all hover:brightness-125"
              style={{
                color: "var(--color-mag-soft)",
                background: "rgba(255,61,139,0.12)",
                border: "1px solid rgba(255,61,139,0.25)",
              }}
            >
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TopRail({ actif, surChoix }: { actif: Onglet; surChoix: (o: Onglet) => void }) {
  const railRef = useRef<HTMLElement>(null);
  const { date, heure } = useHorloge();

  /*
   * L'onglet actif est ramené dans le cadre : sur téléphone, le rail défile.
   *
   * On déplace UNIQUEMENT le défilement du rail, jamais celui de la page.
   * `scrollIntoView` aurait fait les deux — et un onglet qui recale la page
   * verticalement à chaque clic, ça se ressent comme un défaut.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const bouton = rail.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bouton) return;
    const marge = 14;
    const bordGauche = bouton.offsetLeft - marge;
    const bordDroit = bouton.offsetLeft + bouton.offsetWidth + marge - rail.clientWidth;
    if (rail.scrollLeft > bordGauche) rail.scrollTo({ left: bordGauche, behavior: "smooth" });
    else if (rail.scrollLeft < bordDroit) rail.scrollTo({ left: bordDroit, behavior: "smooth" });
  }, [actif]);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-[18px]"
      style={{
        background: "linear-gradient(180deg, rgba(7,18,29,0.92), rgba(7,18,29,0.6))",
        borderColor: "rgba(255,255,255,0.06)",
        /*
         * En mode application, il n'y a plus de barre Safari : la page démarre
         * sous l'heure et la batterie. Sur le web normal, l'encart vaut 0.
         */
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/*
        Trois blocs, deux dispositions. Sur grand écran : logo à gauche, onglets
        au centre, chiffres à droite, sur une ligne. Sur téléphone, les onglets
        passent sur leur propre ligne en un rail qui défile — c'est `order` qui
        fait la bascule.
      */}
      <div
        className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-4 gap-y-[9px] px-6 py-3"
        style={{
          paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
        }}
      >
        <Logo
          surClic={() => {
            surChoix("To-do");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />

        <nav
          ref={railRef}
          /*
           * `overflow-y-hidden` est obligatoire à côté de `overflow-x-auto` :
           * un axe laissé en `visible` face à un axe défilant bascule en
           * `auto`, et ce rail deviendrait une seconde zone défilante
           * VERTICALE — le défilement qui bloque, par la porte de derrière.
           */
          className="rail-onglets order-3 flex w-full flex-nowrap items-center gap-[3px] overflow-x-auto overflow-y-hidden rounded-full p-1 lg:order-2 lg:w-auto lg:flex-wrap lg:overflow-visible"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          aria-label="Modules"
        >
          {NOMS.map((nom) => {
            const choisi = nom === actif;
            return (
              <button
                key={nom}
                type="button"
                data-onglet={nom}
                onClick={() => surChoix(nom)}
                aria-current={choisi ? "page" : undefined}
                className="flex min-h-[44px] flex-none cursor-pointer items-center rounded-full px-[13px] py-[7px] text-[13px] font-extrabold transition-all hover:brightness-125 lg:min-h-0"
                style={
                  choisi
                    ? { color: "#07121d", background: "var(--grad)" }
                    : { color: "rgba(255,255,255,0.5)", background: "transparent" }
                }
              >
                {nom}
              </button>
            );
          })}
        </nav>

        <div className="order-2 flex items-center gap-[10px] lg:order-3">
          <Comptes />
          <Base />
          {/*
            La date et l'heure disparaissent sur téléphone, et ce n'est pas une
            amputation : en mode application, la barre d'état d'iOS affiche
            l'heure juste au-dessus.
          */}
          <div className="hidden text-right leading-[1.2] sm:block">
            {/* Espace réservé pendant le premier rendu pour éviter un saut. */}
            <div className="text-[12.5px] font-extrabold capitalize">{date || " "}</div>
            <div className="nombres text-[11px] text-white/40">{heure || " "}</div>
          </div>
          <Compte />
        </div>
      </div>
    </header>
  );
}

function Cockpit() {
  const [onglet, setOnglet] = useState<Onglet>("To-do");

  /*
   * L'onglet est relu APRÈS le premier rendu, volontairement.
   *
   * Lu pendant le rendu, il ferait diverger le HTML du serveur (qui n'a pas
   * accès au stockage local) de celui du navigateur — React rejetterait
   * l'hydratation et repeindrait toute la page.
   */
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const memo = window.localStorage.getItem(CLE_ONGLET);
        if (memo && (NOMS as string[]).includes(memo)) setOnglet(memo as Onglet);
      } catch {
        /* Mode privé, stockage refusé : on reste sur la todo. */
      }
    });
  }, []);

  const choisir = (o: Onglet) => {
    setOnglet(o);
    try {
      window.localStorage.setItem(CLE_ONGLET, o);
    } catch {
      /* Sans mémoire, l'onglet repart simplement sur la todo. */
    }
  };

  const Vue = ONGLETS[onglet];

  return (
    /*
      Aucun `overflow` ici, et c'est délibéré : ce sont les halos qui se
      rognent eux-mêmes (voir `Glow`), si bien qu'il ne reste plus une seule
      déclaration d'`overflow` entre la fenêtre et le contenu. La fenêtre est
      l'unique zone défilante, dans tous les navigateurs.
    */
    <div className="cadre-appli relative">
      <Glow />
      <TopRail actif={onglet} surChoix={choisir} />
      <main
        className="relative z-[1] mx-auto max-w-[1500px] px-6 pb-[30px] pt-4"
        style={{
          /*
           * En mode application, la barre de gestes d'iOS mange le bas de
           * l'écran et l'encoche les côtés en paysage. Hors de ce mode, les
           * `safe-area-inset-*` valent 0 : la mise en page ne change pas.
           */
          paddingBottom: "calc(30px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
        }}
      >
        {/* La clé remet la vue à neuf d'un onglet à l'autre. */}
        <Vue key={onglet} />
      </main>
    </div>
  );
}

export function Shell() {
  return (
    <CockpitProvider>
      <Cockpit />
    </CockpitProvider>
  );
}
