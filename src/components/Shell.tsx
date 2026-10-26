"use client";

import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CockpitProvider, useCockpit } from "@/lib/p90-context";
import { compteARebours } from "@/lib/p90";
import { TodoView } from "@/components/views/TodoView";
import { SponsorsView } from "@/components/views/SponsorsView";
import { ObjectifsView } from "@/components/views/ObjectifsView";
import { RevueView } from "@/components/views/RevueView";
import { OubliesView } from "@/components/views/OubliesView";

/**
 * LE COCKPIT.
 *
 * Cinq onglets, et la todo en premier parce que c'est 90 % de l'usage réel.
 * Trois modules portent le PROJECT 90 — todo, sponsors, objectifs — et deux
 * restent en appui : la revue de semaine, et les Oubliés qui servent de
 * sauvegarde à ce qu'on supprime.
 *
 * Le Kanban est parti, à la demande de Twaylo (« inutilisable », puis « tu
 * peux tej la kanban ») : il montrait les mêmes tâches que la todo, dans une
 * forme qu'il n'ouvrait pas. Le seul geste qu'il portait seul — passer une
 * tâche « en cours » — vit maintenant dans le panneau ⋯ de la ligne.
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
  /*
   * FIXE : c'est le fond d'écran derrière le verre. Le contenu défile
   * par-dessus, et chaque carte floute en continu une couleur qui ne bouge
   * pas — l'effet même du verre d'Apple.
   *
   * DES DÉGRADÉS, ET PLUS AUCUN FLOU. Les nappes étaient trois grands disques
   * passés au filtre `blur(120px)` : le rendu le plus coûteux qui soit, sur
   * les trois quarts de l'écran, et une part réelle du manque de fluidité au
   * défilement sur iPhone. Un dégradé radial qui s'éteint en douceur donne
   * la même nappe, pour presque rien.
   */
  return (
    <div
      className="pointer-events-none fixed inset-0"
      aria-hidden
      style={{
        background: [
          "radial-gradient(70vw 70vh at 8% -10%, var(--halo-1), transparent 70%)",
          "radial-gradient(60vw 65vh at 100% 15%, var(--halo-2), transparent 70%)",
          "radial-gradient(70vw 70vh at 45% 115%, var(--halo-3), transparent 70%)",
        ].join(", "),
      }}
    />
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
      <span className="text-[10.5px] font-bold tracking-[0.08em]" style={{ color: vu.couleur }}>
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
    { label: "Momentum ouvre", valeur: r.versOuverture, chaud: r.versOuverture <= 7 },
    { label: "Fin des 90 jours", valeur: r.versFin, chaud: false },
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
          <div className="hidden text-[11px] font-medium text-white/45 sm:block">{l.label}</div>
          <div
            className="nombres text-[16px] font-semibold"
            style={{ color: l.chaud ? "var(--color-cor-soft)" : undefined }}
          >
            {l.valeur < 0 ? `+${-l.valeur}` : `J-${l.valeur}`}
          </div>
        </div>
      ))}
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
        className="block h-[44px] w-[44px] cursor-pointer rounded-full p-[1px] transition-all hover:brightness-125 lg:h-[36px] lg:w-[36px]"
        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.45), rgba(255,255,255,0.08))" }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1c1d24] text-[14px] font-semibold">
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

/** Les icônes des onglets, dessinées au trait comme les symboles d'Apple. */
function IconeOnglet({ nom }: { nom: Onglet }) {
  const traits: Record<Onglet, React.ReactNode> = {
    "To-do": (
      <>
        <path d="M4 6.8l1.7 1.7 3-3.1" />
        <path d="M12 7h8" />
        <path d="M4 12.8l1.7 1.7 3-3.1" />
        <path d="M12 13h8" />
        <path d="M5.2 19h2.6" />
        <path d="M12 19h8" />
      </>
    ),
    Sponsors: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2.6" />
        <path d="M8.5 7V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6V7" />
        <path d="M3 12.6h18" />
      </>
    ),
    Objectifs: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    Revue: (
      <>
        <path d="M7 3.6h7l4.6 4.6v11.4a1 1 0 0 1-1 1H7a1.6 1.6 0 0 1-1.6-1.6V5.2A1.6 1.6 0 0 1 7 3.6z" />
        <path d="M14 3.6v4.6h4.6" />
        <path d="M8.8 12.6h6.4M8.8 16.2h6.4" />
      </>
    ),
    Oubliés: (
      <>
        <rect x="3.4" y="4" width="17.2" height="4.6" rx="1.3" />
        <path d="M5 8.6v9.6a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6V8.6" />
        <path d="M10 12.6h4" />
      </>
    ),
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="flex-none lg:hidden"
    >
      {traits[nom]}
    </svg>
  );
}

function TopRail({ actif, surChoix }: { actif: Onglet; surChoix: (o: Onglet) => void }) {
  const navRef = useRef<HTMLElement>(null);
  const pastilleRef = useRef<HTMLSpanElement>(null);

  /*
   * LA PASTILLE QUI GLISSE jusqu'à l'onglet choisi.
   *
   * Posée directement sur l'élément, sans passer par l'état de React : elle
   * se déplace sans re-rendre la barre. La première pose se fait sans
   * transition — sinon, à l'ouverture, on la verrait partir du bord gauche.
   * Elle se recale quand la fenêtre change de taille.
   */
  useLayoutEffect(() => {
    const nav = navRef.current;
    const pastille = pastilleRef.current;
    if (!nav || !pastille) return;
    const poser = () => {
      const bouton = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!bouton) return;
      pastille.style.transform = `translateX(${bouton.offsetLeft}px)`;
      pastille.style.width = `${bouton.offsetWidth}px`;
      pastille.style.opacity = "1";
    };
    poser();
    const raf = requestAnimationFrame(() => pastille.classList.add("anime"));
    window.addEventListener("resize", poser);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", poser);
    };
  }, [actif]);

  /*
   * LA PASTILLE PART À L'INSTANT DU TOUCHER — sans attendre la page.
   *
   * Elle suivait l'onglet actif, donc le rendu de la nouvelle page : sur la
   * plus chargée, elle ne bougeait qu'au bout d'un dixième de seconde, et le
   * geste paraissait mou. On la déplace dans le geste lui-même, et la lecture
   * de `offsetWidth` force le navigateur à prendre la nouvelle position tout
   * de suite : la transition démarre avant que React ne se mette au travail,
   * et elle file sur le processeur graphique pendant qu'il dessine la page.
   */
  const glisserVers = (bouton: HTMLElement) => {
    const pastille = pastilleRef.current;
    if (!pastille) return;
    pastille.style.transform = `translateX(${bouton.offsetLeft}px)`;
    pastille.style.width = `${bouton.offsetWidth}px`;
    void pastille.offsetWidth;
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          /*
           * Une barre de verre, comme celles d'Apple : ce qui défile dessous
           * passe flouté et saturé, au lieu de disparaître sous un aplat.
           */
          background: "linear-gradient(180deg, rgba(10,11,15,0.72), rgba(10,11,15,0.45))",
          WebkitBackdropFilter: "blur(26px) saturate(170%)",
          backdropFilter: "blur(26px) saturate(170%)",
          borderColor: "rgba(255,255,255,0.07)",
          /*
           * En mode application, il n'y a plus de barre Safari : la page démarre
           * sous l'heure et la batterie. Sur le web normal, l'encart vaut 0.
           */
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        {/*
          ÉPURÉ : le logo à gauche, les deux comptes à rebours et le compte à
          droite. L'heure, la date et la barre d'avancement sont parties — la
          date vit dans le grand titre de la todo, et l'heure est déjà dans la
          barre de menus du Mac et la barre d'état de l'iPhone.
        */}
        <div className="gouttiere mx-auto flex h-[60px] max-w-[1500px] items-center justify-between gap-4">
          <Logo
            surClic={() => {
              surChoix("To-do");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
          <div className="flex items-center gap-[12px]">
            <Comptes />
            <Base />
            <Compte />
          </div>
        </div>
      </header>

      {/*
        LA BARRE D'ONGLETS, hors du bandeau (voir `.barre-onglets`) : une
        capsule au centre du bandeau sur grand écran, une capsule flottante en
        bas de l'écran au téléphone — la barre d'onglets d'iOS 26.
      */}
      <nav ref={navRef} className="barre-onglets" aria-label="Modules">
        <span ref={pastilleRef} className="indicateur-onglet" style={{ opacity: 0 }} aria-hidden />
        {NOMS.map((nom) => {
          const choisi = nom === actif;
          return (
            <button
              key={nom}
              type="button"
              data-onglet={nom}
              onClick={(e) => {
                glisserVers(e.currentTarget);
                /*
                 * La page attend UNE image. Mesuré : dessiner la nouvelle page
                 * prend le fil principal 40 à 120 ms, et la pastille ne
                 * démarrait qu'après — le geste paraissait accrocher. Ici
                 * l'image suivante part d'abord, avec la pastille en route ;
                 * le dessin de la page vient ensuite, pendant que la pastille
                 * file sur le processeur graphique. 16 ms d'attente, qu'on ne
                 * voit pas, contre un mouvement qui démarre sous le doigt.
                 */
                requestAnimationFrame(() => window.setTimeout(() => surChoix(nom), 0));
              }}
              aria-current={choisi ? "page" : undefined}
              className="flex h-[50px] min-w-[62px] flex-none cursor-pointer flex-col items-center justify-center gap-[2px] rounded-full px-[8px] text-[10.5px] font-medium transition-colors lg:h-[34px] lg:min-w-0 lg:flex-row lg:px-[16px] lg:text-[14px]"
              style={{ color: choisi ? "var(--color-fg)" : "rgba(245,245,247,0.58)" }}
            >
              <IconeOnglet nom={nom} />
              <span>{nom}</span>
            </button>
          );
        })}
      </nav>
    </>
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
    /*
     * Dans une transition : la nouvelle page se prépare SANS bloquer l'écran.
     * La pastille glisse déjà (voir `TopRail`), l'ancienne page reste vivante
     * le temps que la nouvelle soit prête, et rien ne fige sous le doigt.
     */
    startTransition(() => setOnglet(o));
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
      {/*
        La gouttière suit l'écran (16 px au téléphone, 28 sur grand écran, et
        jamais moins que l'encoche en paysage), et le bas de page laisse la
        place à la barre d'onglets flottante (voir `.contenu-vues`).
      */}
      <main className="contenu-vues gouttiere relative z-[1] mx-auto max-w-[1500px] pt-[18px]">
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
