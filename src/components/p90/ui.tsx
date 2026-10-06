"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * LES BRIQUES DU COCKPIT, au langage visuel d'origine.
 *
 * Verre dépoli sur fond encre, un filet de couleur en tête de chaque carte,
 * des pastilles rondes et des boutons teintés dans la couleur de ce qu'ils
 * font. C'est la maquette de Twaylo OS, reprise après l'essai d'un noir
 * uniforme : sept modules peints de la même couleur se ressemblent tous, et
 * c'est la couleur qui permet de retrouver « la carte verte » sans lire.
 *
 * Aucune carte ne choisit sa teinte ici : elle la reçoit. Les couleurs vivent
 * dans `globals.css` et dans `p90.ts`, pour qu'un changement de palette reste
 * un changement de palette.
 */

/** Les sept accents de la maquette, et le gris. */
export const TONS = {
  neutre: { vif: "rgba(255,255,255,0.55)", fond: "rgba(255,255,255,0.05)", bord: "rgba(255,255,255,0.09)" },
  accent: { vif: "var(--color-cya)", fond: "rgba(34,211,238,0.13)", bord: "rgba(34,211,238,0.3)" },
  bleu: { vif: "var(--color-ble)", fond: "rgba(79,156,255,0.13)", bord: "rgba(79,156,255,0.3)" },
  violet: { vif: "var(--color-vio)", fond: "rgba(176,107,255,0.13)", bord: "rgba(176,107,255,0.3)" },
  succes: { vif: "var(--color-ver)", fond: "rgba(61,220,132,0.13)", bord: "rgba(61,220,132,0.32)" },
  alerte: { vif: "var(--color-amb)", fond: "rgba(255,198,61,0.13)", bord: "rgba(255,198,61,0.32)" },
  corail: { vif: "var(--color-cor)", fond: "rgba(255,122,61,0.13)", bord: "rgba(255,122,61,0.3)" },
  danger: { vif: "var(--color-mag)", fond: "rgba(255,61,139,0.13)", bord: "rgba(255,61,139,0.32)" },
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
      <div ref={innerRef} data-zone={zone} className={`carte-haute p-[14px] ${className}`} style={style}>
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
    >
      <span className="panel-accent" style={{ background: accent }} aria-hidden />
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
    <div className={`surtitre ${className}`} style={{ color: couleur }}>
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
        fond: `color-mix(in srgb, ${couleur} 13%, transparent)`,
        bord: `color-mix(in srgb, ${couleur} 32%, transparent)`,
      }
    : TONS[ton];

  const style: CSSProperties = actif
    ? { color: "#07121d", background: t.vif, border: `1px solid ${t.vif}` }
    : { color: t.vif, background: t.fond, border: `1px solid ${t.bord}` };

  const classes = `inline-flex items-center gap-[4px] rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold leading-[15px] transition-all ${className}`;

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
export function Eclats({ nombre, portee }: { nombre: number; portee: number }) {
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
                background: COULEURS_ECLAT[i % COULEURS_ECLAT.length],
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
  couleur = "var(--grad)",
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
    <div className="py-[26px] text-center">
      <div className="text-[12.5px] font-extrabold text-white/40">{children}</div>
      {indice && <div className="mt-[3px] text-[11px] text-white/25">{indice}</div>}
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
  const styles: Record<string, CSSProperties> = {
    plein: { background: "var(--grad)", color: "#07121d", border: "1px solid transparent" },
    fin: {
      background: "rgba(255,255,255,0.05)",
      color: "rgba(255,255,255,0.72)",
      border: "1px solid rgba(255,255,255,0.09)",
    },
    succes: { background: TONS.succes.fond, color: TONS.succes.vif, border: `1px solid ${TONS.succes.bord}` },
    danger: { background: TONS.danger.fond, color: TONS.danger.vif, border: `1px solid ${TONS.danger.bord}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titre}
      className={`cible-doigt inline-flex cursor-pointer items-center justify-center gap-[6px] rounded-[11px] px-[12px] py-[7px] text-[11.5px] font-extrabold transition-all hover:brightness-125 disabled:cursor-default disabled:opacity-40 ${className}`}
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
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={aria}
      className={`min-w-0 rounded-[11px] px-[11px] py-[8px] text-[13px] font-semibold outline-none transition-all focus:border-[var(--color-cya)] ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "var(--color-fg)",
      }}
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
