"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

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
