"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * LES BRIQUES DU COCKPIT.
 *
 * Sept composants, et volontairement sept : l'ancien fichier d'interface en
 * portait douze, dont des badges de format vidéo et un bouton de dictée pour
 * des onglets qui n'existent plus.
 *
 * Aucune ne porte de couleur en dur — tout vient des variables du thème, pour
 * qu'un changement de palette soit un changement de palette et non une chasse
 * aux valeurs hexadécimales dans trente fichiers.
 */

/** Une surface. `zone` la marque comme cible de dépôt, lisible depuis le DOM. */
export function Carte({
  children,
  className = "",
  style,
  innerRef,
  zone,
  haute = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  innerRef?: Ref<HTMLDivElement>;
  zone?: string;
  /** Surface haute : pour ce qui se pose SUR une carte. */
  haute?: boolean;
}) {
  return (
    <div
      ref={innerRef}
      data-zone={zone}
      className={`${haute ? "carte-haute" : "carte"} p-[14px] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** Le surtitre d'un bloc : petit, espacé, gris. */
export function Surtitre({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surtitre ${className}`}>{children}</div>;
}

/** Les cinq tons du thème, nommés une fois et partagés par tout le cockpit. */
export const TONS = {
  neutre: "var(--p90-texte-2)",
  accent: "var(--p90-accent)",
  succes: "var(--p90-succes)",
  alerte: "var(--p90-alerte)",
  danger: "var(--p90-danger)",
} as const;

export type Ton = keyof typeof TONS;

/**
 * UNE LIGNE DE CONTEXTE — du texte, pas des étiquettes.
 *
 * Une tâche porte cinq informations autour d'elle : son objectif, qui s'en
 * occupe, son échéance, son état, son âge. Encadrées, ça fait cinq petites
 * boîtes par ligne — cent boîtes sur un écran de vingt tâches, et l'intitulé,
 * la seule chose qu'on vient lire, se noie au milieu.
 *
 * Elles redeviennent donc du gris séparé par des points médians. La règle qui
 * en découle tient en une phrase : LE CADRE EST RÉSERVÉ À CE SUR QUOI ON
 * CLIQUE — un filtre, un choix dans l'éditeur. Ce qui s'informe se lit, et
 * seul ce qui alarme garde une couleur.
 */
export type Bout = { texte: string; ton?: Ton; titre?: string; fort?: boolean };

export function Meta({ bouts, className = "" }: { bouts: (Bout | null | false | undefined)[]; className?: string }) {
  const vivants = bouts.filter((b): b is Bout => Boolean(b));
  if (vivants.length === 0) return null;
  return (
    <div className={`text-[10px] leading-[15px] text-[var(--p90-texte-2)] ${className}`}>
      {vivants.map((b, i) => (
        <span key={`${b.texte}-${i}`}>
          {i > 0 && <span className="opacity-30"> · </span>}
          <span
            title={b.titre}
            className={b.fort ? "font-semibold" : undefined}
            style={b.ton && b.ton !== "neutre" ? { color: TONS[b.ton] } : undefined}
          >
            {b.texte}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Une étiquette qu'on allume. `ton` choisit sa couleur parmi les états du thème.
 *
 * `onClick` la rend cliquable — un filtre du Kanban est une puce qu'on allume,
 * pas une liste déroulante : un geste au lieu de trois. Sans `onClick` elle
 * n'est qu'un cadre autour d'un mot : préférer `Meta`.
 */
export function Puce({
  children,
  ton = "neutre",
  actif = false,
  onClick,
  titre,
  className = "",
}: {
  children: ReactNode;
  ton?: Ton;
  actif?: boolean;
  onClick?: () => void;
  titre?: string;
  className?: string;
}) {
  const couleur = TONS[ton];

  const style: CSSProperties = {
    color: actif ? "var(--p90-fond)" : couleur,
    background: actif ? couleur : "transparent",
    border: `1px solid ${actif ? couleur : "var(--p90-bord)"}`,
    transition: `all var(--p90-vitesse) ease`,
  };

  const classes = `inline-flex items-center gap-[4px] rounded-[6px] px-[6px] py-[2px] text-[10px] font-semibold leading-[16px] ${className}`;

  if (!onClick) {
    return (
      <span className={classes} style={style} title={titre}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} title={titre} className={`${classes} cursor-pointer hover:brightness-125`} style={style}>
      {children}
    </button>
  );
}

/**
 * L'intitulé d'une rangée de réglages — « Objectif », « Qui », « Bloc ».
 *
 * Il existait en six exemplaires, chacun avec sa propre largeur fixe et sa
 * propre suite de classes : trois rangées d'un même panneau ne s'alignaient
 * pas tout à fait, ce qui se voit sans qu'on sache pourquoi.
 */
export function Etiq({ children, l = "w-[62px]" }: { children: ReactNode; l?: string }) {
  return (
    <span className={`surtitre flex-none ${l}`} style={{ letterSpacing: "0.08em" }}>
      {children}
    </span>
  );
}

/** Une barre de progression. La valeur est bornée ici, pas chez l'appelant. */
export function Barre({
  pct,
  couleur = "var(--p90-accent)",
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
      className="w-full overflow-hidden rounded-full"
      style={{ height: hauteur, background: "var(--p90-bord)" }}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${borne}%`, background: couleur, transition: `width var(--p90-vitesse) ease` }}
      />
    </div>
  );
}

/** Ce qu'on affiche quand il n'y a rien — avec ce qu'il faut faire pour qu'il y ait. */
export function Vide({ children, indice }: { children: ReactNode; indice?: string }) {
  return (
    <div className="py-[26px] text-center">
      <div className="text-[12px] font-semibold text-[var(--p90-texte-2)]">{children}</div>
      {indice && <div className="mt-[3px] text-[11px] text-[var(--p90-texte-2)] opacity-60">{indice}</div>}
    </div>
  );
}

/**
 * Un bouton. `ton` « plein » pour l'action principale, « fin » pour le reste.
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
  ton?: "plein" | "fin" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  titre?: string;
  className?: string;
}) {
  const styles: Record<string, CSSProperties> = {
    plein: { background: "var(--p90-accent)", color: "#0b0b0c", border: "1px solid var(--p90-accent)" },
    fin: { background: "var(--p90-haute)", color: "var(--p90-texte)", border: "1px solid var(--p90-bord)" },
    danger: { background: "transparent", color: "var(--p90-danger)", border: "1px solid var(--p90-danger)" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titre}
      className={`cible-doigt inline-flex cursor-pointer items-center justify-center gap-[6px] rounded-[8px] px-[11px] py-[7px] text-[12px] font-semibold transition-all hover:brightness-115 disabled:cursor-default disabled:opacity-40 ${className}`}
      style={{ ...styles[ton], transitionDuration: "var(--p90-vitesse)" }}
    >
      {children}
    </button>
  );
}

/**
 * Un champ de saisie.
 *
 * Ses couleurs viennent de `.champ`, en CSS, et non d'un `style` en ligne :
 * un style en ligne l'emporte sur toute classe, donc sur le `:focus` — le
 * liseré vert du champ actif ne s'allumait jamais.
 *
 * `fantome` l'efface tant qu'on n'écrit pas dedans. La todo en affiche un par
 * bloc, soit quatre en permanence : quatre boîtes vides encadrées pèsent plus
 * lourd à l'œil que les tâches qu'elles servent à créer. Réduit à une ligne
 * grise, le champ redevient un champ dès qu'on le touche.
 */
export function Champ({
  valeur,
  onChange,
  placeholder,
  type = "text",
  onBlur,
  onKeyDown,
  autoFocus = false,
  fantome = false,
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
  fantome?: boolean;
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
      className={`champ ${fantome ? "champ-fantome" : ""} min-w-0 rounded-[8px] px-[9px] py-[7px] text-[13px] outline-none placeholder:text-[var(--p90-texte-2)] placeholder:opacity-50 ${className}`}
    />
  );
}

/**
 * Un montant en euros, en chasse tabulaire.
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

/** « 2 500 € », avec une espace insécable fine, toujours la même. */
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
