"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

/**
 * LES BRIQUES DU COCKPIT, en verre — à la manière d'Apple.
 *
 * Des surfaces translucides qui floutent la couleur du fond, de grands
 * arrondis, des boutons en capsule, et une lueur de couleur sous l'arête de
 * chaque carte. Tout est un cran plus grand qu'avant : c'était la demande
 * (« cases plus grandes, plus user friendly »), et c'est aussi la taille à
 * laquelle on vise du pouce sans regarder.
 *
 * La couleur reste ce qui distingue un module d'un autre : on retrouve « la
 * carte verte » sans lire.
 *
 * Aucune carte ne choisit sa teinte ici : elle la reçoit. Les couleurs vivent
 * dans `globals.css` et dans `p90.ts`, pour qu'un changement de palette reste
 * un changement de palette.
 */

/** Les sept accents de la maquette, et le gris. */
/*
 * Les tons d'une étiquette : un TEXTE coloré sur un fond à peine teinté, sans
 * bordure — l'allure des étiquettes d'Apple. Les bordures de couleur à chaque
 * pastille faisaient partie de ce qui donnait l'air « kitsch ».
 */
export const TONS = {
  neutre: { vif: "rgba(245,245,247,0.72)", fond: "rgba(255,255,255,0.08)", bord: "transparent" },
  accent: { vif: "var(--color-ble-soft)", fond: "rgba(10,132,255,0.16)", bord: "transparent" },
  bleu: { vif: "var(--color-ble-soft)", fond: "rgba(10,132,255,0.16)", bord: "transparent" },
  violet: { vif: "var(--color-vio-soft)", fond: "rgba(191,90,242,0.16)", bord: "transparent" },
  succes: { vif: "var(--color-ver-soft)", fond: "rgba(48,209,88,0.15)", bord: "transparent" },
  alerte: { vif: "var(--color-cor-soft)", fond: "rgba(255,159,10,0.15)", bord: "transparent" },
  corail: { vif: "var(--color-cor-soft)", fond: "rgba(255,159,10,0.15)", bord: "transparent" },
  danger: { vif: "var(--color-mag-soft)", fond: "rgba(255,55,95,0.15)", bord: "transparent" },
} as const;

export type Ton = keyof typeof TONS;

/**
 * Une carte en verre. `accent` peint la barre fine du haut.
 *
 * Une couleur par carte, et c'est tout l'intérêt : on repère le pipeline des
 * OP à son filet corail avant d'avoir lu son titre. `zone` la marque comme
 * cible de dépôt, lisible depuis le DOM.
 */
export function Carte({
  children,
  accent = "rgba(255,255,255,0.14)",
  className = "",
  style,
  innerRef,
  zone,
  survol = true,
  haute = false,
}: {
  children: ReactNode;
  /** La couleur du filet du haut. `var(--grad)` pour la carte maîtresse. */
  accent?: string;
  className?: string;
  style?: CSSProperties;
  innerRef?: Ref<HTMLDivElement>;
  zone?: string;
  /** Le léger soulèvement au survol. À couper sur une carte de dépôt. */
  survol?: boolean;
  /** Surface haute : pour ce qui se pose SUR une carte. */
  haute?: boolean;
}) {
  if (haute) {
    return (
      <div ref={innerRef} data-zone={zone} className={`carte-haute p-[16px] ${className}`} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div
      ref={innerRef}
      data-zone={zone}
      className={`carte ${survol ? "carte-hover" : ""} p-[16px] ${className}`}
      style={style}
      data-accent={accent}
    >
      {children}
    </div>
  );
}

/** Le libellé en tête de carte : pastille colorée, puis le texte capitalisé. */
export function Surtitre({
  children,
  couleur = "rgba(255,255,255,0.45)",
  pastille,
  className = "",
}: {
  children: ReactNode;
  couleur?: string;
  /** La pastille, si elle doit différer du texte. */
  pastille?: string;
  className?: string;
}) {
  return (
    // Le texte reste blanc : la couleur ne vit que dans la pastille.
    <div className={`surtitre ${className}`} style={{ color: "var(--color-fg)" }}>
      <span className="pastille-titre" style={{ background: pastille ?? couleur }} aria-hidden />
      {children}
    </div>
  );
}

/**
 * Une étiquette ronde, teintée dans son ton.
 *
 * `onClick` la rend cliquable — un filtre du Kanban est une puce qu'on allume,
 * pas une liste déroulante : un geste au lieu de trois. Allumée, elle prend sa
 * couleur pleine ; éteinte, elle reste un verre discret.
 */
export function Puce({
  children,
  ton = "neutre",
  couleur,
  actif = false,
  onClick,
  titre,
  className = "",
}: {
  children: ReactNode;
  ton?: Ton;
  /**
   * Une couleur hors des huit tons — celle d'un objectif, d'un bloc, d'une
   * étape d'OP. Le fond et la bordure s'en déduisent par `color-mix` : une
   * seule source de vérité, et personne n'a à écrire trois rgba à la main
   * chaque fois qu'on ajoute un objectif.
   */
  couleur?: string;
  actif?: boolean;
  onClick?: () => void;
  titre?: string;
  className?: string;
}) {
  const t = couleur
    ? {
        vif: couleur,
        fond: `color-mix(in srgb, ${couleur} 15%, transparent)`,
        bord: "transparent",
      }
    : TONS[ton];

  // Allumée : la couleur pleine, texte sombre. Éteinte : du texte coloré sur
  // un fond à peine teinté.
  const style: CSSProperties = actif
    ? { color: "#0a0b0f", background: t.vif, border: `1px solid ${t.vif}` }
    : { color: t.vif, background: t.fond, border: `1px solid ${t.bord}` };

  const classes = `inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[12px] font-medium leading-[16px] transition-all ${className}`;

  if (!onClick) {
    return (
      <span className={classes} style={style} title={titre}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      className={`${classes} cursor-pointer hover:brightness-125`}
      style={style}
    >
      {children}
    </button>
  );
}

const COULEURS_ECLAT = [
  "var(--color-mag)",
  "var(--color-amb)",
  "var(--color-ver)",
  "var(--color-cya)",
  "var(--color-vio)",
];

/**
 * Les éclats projetés depuis la case cochée.
 *
 * Les directions sont CALCULÉES, pas tirées au sort : un tirage aléatoire
 * donnerait un résultat différent entre le rendu serveur et le rendu
 * navigateur, et React signalerait une divergence d'hydratation. Un éventail
 * régulier est de toute façon plus lisible qu'un vrai hasard.
 */
export function Eclats({ nombre, portee, couleur }: { nombre: number; portee: number; couleur?: string }) {
  return (
    <>
      {Array.from({ length: nombre }, (_, i) => {
        const angle = (i / nombre) * Math.PI * 2;
        // Une alternance de portée évite l'effet « couronne » trop régulier.
        const rayon = portee * (i % 2 === 0 ? 1 : 0.65);
        return (
          <span
            key={i}
            className="eclat"
            aria-hidden
            style={
              {
                // Une seule couleur, celle de la liste, en trois intensités :
                // l'arc-en-ciel faisait confettis de kermesse.
                background: couleur ?? COULEURS_ECLAT[i % COULEURS_ECLAT.length],
                opacity: couleur ? [1, 0.7, 0.45][i % 3] : undefined,
                "--dx": `${Math.cos(angle) * rayon}px`,
                "--dy": `${Math.sin(angle) * rayon}px`,
                "--rot": `${(i % 2 === 0 ? 1 : -1) * 220}deg`,
                "--duree": `${0.55 + (i % 3) * 0.12}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </>
  );
}

/** Une barre de progression. La valeur est bornée ici, pas chez l'appelant. */
export function Barre({
  pct,
  couleur = "var(--color-ble)",
  hauteur = 6,
  etiquette,
}: {
  pct: number;
  couleur?: string;
  hauteur?: number;
  etiquette?: string;
}) {
  const borne = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={borne}
      aria-label={etiquette}
      className="bar-track w-full"
      style={{ height: hauteur }}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${borne}%`, background: couleur, transition: "width 0.4s ease" }}
      />
    </div>
  );
}

/** Ce qu'on affiche quand il n'y a rien — avec ce qu'il faut faire pour qu'il y ait. */
export function Vide({ children, indice }: { children: ReactNode; indice?: string }) {
  return (
    <div className="py-[28px] text-center">
      <div className="text-[14px] font-medium text-white/45">{children}</div>
      {indice && <div className="mt-[4px] text-[12.5px] text-white/30">{indice}</div>}
    </div>
  );
}

/**
 * Un bouton. `ton` « plein » porte le dégradé signature, le reste est teinté.
 *
 * 44 px de haut au doigt via `cible-doigt` : une cible de 30 px se rate une
 * fois sur trois sur un téléphone, et un bouton raté passe pour un bug.
 */
export function Bouton({
  children,
  onClick,
  ton = "fin",
  type = "button",
  disabled = false,
  titre,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  ton?: "plein" | "fin" | "danger" | "succes";
  type?: "button" | "submit";
  disabled?: boolean;
  titre?: string;
  className?: string;
}) {
  /*
   * Une capsule de verre (`.capsule` dans globals.css). « plein » est la
   * capsule blanche de l'action principale — plus de dégradé arc-en-ciel.
   */
  const styles: Record<string, CSSProperties | undefined> = {
    plein: undefined,
    fin: undefined,
    succes: { color: TONS.succes.vif, background: TONS.succes.fond },
    danger: { color: TONS.danger.vif, background: TONS.danger.fond },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titre}
      className={`capsule cible-doigt ${ton === "plein" ? "capsule-pleine" : ""} ${className}`}
      style={styles[ton]}
    >
      {children}
    </button>
  );
}

/** Un champ de saisie, à l'allure du thème. */
export function Champ({
  valeur,
  onChange,
  placeholder,
  type = "text",
  onBlur,
  onKeyDown,
  onPaste,
  autoFocus = false,
  className = "",
  aria,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number";
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /**
   * Le collage, AVANT que le navigateur ne le range dans le champ.
   *
   * Un champ d'une ligne retire les retours à la ligne de ce qu'on y colle :
   * une liste de trois tâches copiée d'une note arrivait soudée en une seule
   * (« Appeler le fixeurRelancer ExpandiaPoster »). Le seul moment où les
   * lignes existent encore, c'est ici.
   */
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  className?: string;
  aria?: string;
}) {
  return (
    <input
      type={type}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={aria}
      enterKeyHint={type === "text" ? "done" : undefined}
      // Le style vit dans la classe `.champ` : en ligne, il écrasait la
      // bordure de focus, et rien ne montrait où l'on tapait.
      className={`champ min-w-0 ${className}`}
    />
  );
}

/**
 * Un montant en euros, en chasse fixe.
 *
 * Formaté ici et nulle part ailleurs : `toLocaleString` rend une espace fine
 * insécable dont le code varie selon la version d'ICU, et deux montants
 * formatés à deux endroits ne s'alignaient pas à l'écran.
 */
export function Euros({
  valeur,
  className = "",
  ton,
}: {
  valeur: number;
  className?: string;
  ton?: string;
}) {
  return (
    <span className={`nombres ${className}`} style={ton ? { color: ton } : undefined}>
      {formaterEuros(valeur)}
    </span>
  );
}

/** « 2 500 € », avec U+202F — une espace fine insécable, toujours la même. */
export function formaterEuros(valeur: number): string {
  if (!Number.isFinite(valeur)) return "—";
  const entier = Math.round(valeur);
  const chiffres = Math.abs(entier).toString();
  const groupes: string[] = [];
  for (let i = chiffres.length; i > 0; i -= 3) groupes.unshift(chiffres.slice(Math.max(0, i - 3), i));
  return `${entier < 0 ? "-" : ""}${groupes.join(" ")} €`;
}

/** « 316 000 » — le même groupement, sans l'unité. */
export function formaterNombre(valeur: number): string {
  if (!Number.isFinite(valeur)) return "—";
  const entier = Math.round(valeur);
  const chiffres = Math.abs(entier).toString();
  const groupes: string[] = [];
  for (let i = chiffres.length; i > 0; i -= 3) groupes.unshift(chiffres.slice(Math.max(0, i - 3), i));
  return `${entier < 0 ? "-" : ""}${groupes.join(" ")}`;
}

/** « 8 oct. » — court, lisible, sans dépendre d'ICU. */
const MOIS = ["janv.", "févr.", "mars", "avril", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function formaterJour(jour: string | undefined): string {
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return "—";
  const [, m, j] = jour.split("-");
  return `${Number(j)} ${MOIS[Number(m) - 1] ?? ""}`.trim();
}

/* ------------------------------------------------------------------ */
/* Les pièces de la fluidité                                           */
/* ------------------------------------------------------------------ */

/** Le mouvement est-il coupé dans les réglages du système ? */
function mouvementReduit(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * LA COCHE, dessinée — un trait qui part du coin bas et file vers la pointe,
 * comme dans Rappels. `trace` la fait se dessiner ; sinon elle est là.
 */
export function Coche({ trace = false, taille = 12 }: { trace?: boolean; taille?: number }) {
  return (
    <svg
      className={`coche-svg ${trace ? "trace" : ""}`}
      width={taille}
      height={taille}
      viewBox="0 0 14 14"
      aria-hidden
    >
      <path
        d="M2.8 7.3 L5.7 10.1 L11.2 3.9"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * L'ANNEAU DE PROGRESSION — celui de l'app Forme.
 *
 * Plus parlant qu'une barre et beaucoup plus compact : une colonne de dix
 * objectifs ne devient plus un empilement de dix pavés identiques.
 */
export function Anneau({
  pct,
  taille = 26,
  epaisseur = 3.5,
  couleur = "var(--color-ble)",
  children,
  etiquette,
}: {
  pct: number;
  taille?: number;
  epaisseur?: number;
  couleur?: string;
  children?: ReactNode;
  etiquette?: string;
}) {
  const borne = Math.max(0, Math.min(100, Math.round(pct)));
  const r = (taille - epaisseur) / 2;
  const tour = 2 * Math.PI * r;
  return (
    <span
      className="anneau"
      style={{ width: taille, height: taille }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={borne}
      aria-label={etiquette}
    >
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={epaisseur} />
        {borne > 0 && (
          <circle
            className="valeur"
            cx={taille / 2}
            cy={taille / 2}
            r={r}
            fill="none"
            stroke={couleur}
            strokeWidth={epaisseur}
            strokeLinecap="round"
            strokeDasharray={tour}
            strokeDashoffset={tour * (1 - borne / 100)}
          />
        )}
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

/**
 * LE DÉPLIANT : ce qui s'ouvre se DÉPLIE, ce qui se ferme se replie.
 *
 * Un panneau qui apparaît d'un coup pousse tout ce qui est dessous d'un seul
 * cran — c'est ce saut qu'on ressent comme un manque de fluidité. Ici la
 * hauteur passe de zéro à sa valeur réelle (et retour), avec la courbe des
 * feuilles d'iOS, et le contenu reste dans la page le temps de se replier.
 */
export function Depliant({ ouvert, children }: { ouvert: boolean; children: ReactNode }) {
  const [rendu, setRendu] = useState(ouvert);
  const ref = useRef<HTMLDivElement>(null);
  /** Le contenu est-il déplié à l'écran (et non replié ou en train de l'être) ? */
  const deplie = useRef(ouvert);
  const premier = useRef(true);

  // Ouvert : le contenu est monté tout de suite, pendant le rendu — le motif
  // que React recommande pour un état qui suit une propriété.
  if (ouvert && !rendu) setRendu(true);

  useLayoutEffect(() => {
    // Rien à animer au premier affichage : déjà ouvert, il est simplement là.
    if (premier.current) {
      premier.current = false;
      deplie.current = ouvert;
      return;
    }
    const el = ref.current;
    if (!el) return;
    const reduit = mouvementReduit();
    const enCours = el.getAnimations();
    // D'où l'on part : zéro pour un contenu qui vient d'être monté, la hauteur
    // à l'instant pour un geste qui en interrompt un autre (rouvrir pendant
    // qu'il se replie ne doit pas sauter).
    const depart = deplie.current || enCours.length > 0 ? el.getBoundingClientRect().height : 0;
    enCours.forEach((a) => a.cancel());

    if (ouvert) {
      deplie.current = true;
      el.animate(
        [
          { height: `${depart}px`, opacity: depart > 0 ? 1 : 0 },
          { height: `${el.scrollHeight}px`, opacity: 1 },
        ],
        { duration: reduit ? 0 : 340, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      );
      return;
    }

    const anim = el.animate(
      [
        { height: `${depart}px`, opacity: 1 },
        { height: "0px", opacity: 0 },
      ],
      { duration: reduit ? 0 : 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    anim.onfinish = () => {
      deplie.current = false;
      setRendu(false);
    };
  }, [ouvert]);

  if (!rendu) return null;
  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      {children}
    </div>
  );
}

/**
 * LE GRAND TITRE DE PAGE, à la manière des applications d'Apple : un titre
 * net en tête, une ligne de contexte dessous, les actions à droite.
 */
export function EnTeteVue({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-[2px] pt-[2px]">
      <div className="min-w-0">
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.025em]">{titre}</h1>
        {sousTitre && <div className="mt-[4px] text-[14px] text-white/50">{sousTitre}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-[8px]">{children}</div>}
    </div>
  );
}

/**
 * LA FEUILLE — par-dessus la page, dans un portail sous `<body>`.
 *
 * Elle monte du bas au téléphone et éclot au centre sur grand écran ; et elle
 * REPART par le même chemin avant de disparaître. Rendue dans un portail : à
 * l'intérieur d'une vue, elle prenait pour repère l'ancêtre animé par
 * l'entrée de la vue et se plaçait par rapport à la page, pas à l'écran.
 *
 * `children` reçoit `fermer`, pour qu'un bouton du contenu referme la feuille
 * avec son animation.
 */
export function Feuille({
  titre,
  sousTitre,
  etiquette,
  surFermer,
  children,
}: {
  titre: ReactNode;
  sousTitre?: ReactNode;
  etiquette: string;
  surFermer: () => void;
  children: (fermer: () => void) => ReactNode;
}) {
  const [sortie, setSortie] = useState(false);
  const fermer = useCallback(() => {
    // Sans mouvement, pas d'animation de sortie à attendre.
    if (mouvementReduit()) surFermer();
    else setSortie(true);
  }, [surFermer]);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [fermer]);

  /*
   * LE FILET DE LA SORTIE. La feuille se retire à la fin de son animation —
   * mais une animation peut ne jamais finir : application passée en
   * arrière-plan pendant la fermeture, onglet masqué. La feuille restait alors
   * à l'écran, invisible et posée sur tout le reste, à intercepter chaque
   * clic. Passé 400 ms, elle se retire de toute façon.
   */
  const surFermerRef = useRef(surFermer);
  useEffect(() => {
    surFermerRef.current = surFermer;
  });
  useEffect(() => {
    if (!sortie) return;
    const t = window.setTimeout(() => surFermerRef.current(), 400);
    return () => window.clearTimeout(t);
  }, [sortie]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={etiquette}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={fermer}
        className={`voile absolute inset-0 cursor-default ${sortie ? "sortie" : ""}`}
      />
      <div
        className={`feuille carte relative w-full space-y-[14px] rounded-b-none p-[18px] sm:max-w-[480px] sm:rounded-b-[22px] ${
          sortie ? "sortie" : ""
        }`}
        style={{
          paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(28,29,36,0.84)",
          maxHeight: "92svh",
          overflowY: "auto",
        }}
        onAnimationEnd={(e) => {
          if (sortie && e.target === e.currentTarget) surFermer();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[19px] font-semibold leading-[1.25] tracking-[-0.01em]">{titre}</div>
            {sousTitre && <div className="nombres mt-[2px] text-[13px] text-white/50">{sousTitre}</div>}
          </div>
          <button
            type="button"
            onClick={fermer}
            aria-label="Fermer la fiche"
            className="capsule flex-none"
            style={{ width: 32, minHeight: 32, padding: 0 }}
          >
            ✕
          </button>
        </div>
        {children(fermer)}
      </div>
    </div>,
    document.body,
  );
}
