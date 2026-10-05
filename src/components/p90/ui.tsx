"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * LES BRIQUES DU COCKPIT.
 *
 * Six composants, et volontairement six : l'ancien fichier d'interface en
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

/**
 * Une étiquette. `ton` choisit sa couleur parmi les états du thème.
 *
 * `onClick` la rend cliquable — un filtre du Kanban est une puce qu'on allume,
 * pas une liste déroulante : un geste au lieu de trois.
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
  ton?: "neutre" | "accent" | "succes" | "alerte" | "danger";
  actif?: boolean;
  onClick?: () => void;
  titre?: string;
  className?: string;
}) {
  const couleur = {
    neutre: "var(--p90-texte-2)",
    accent: "var(--p90-accent)",
    succes: "var(--p90-succes)",
    alerte: "var(--p90-alerte)",
    danger: "var(--p90-danger)",
  }[ton];

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
      className={`min-w-0 rounded-[8px] px-[9px] py-[7px] text-[13px] outline-none transition-all placeholder:text-[var(--p90-texte-2)] placeholder:opacity-50 focus:border-[var(--p90-accent)] ${className}`}
      style={{
        background: "var(--p90-fond)",
        border: "1px solid var(--p90-bord)",
        color: "var(--p90-texte)",
        transitionDuration: "var(--p90-vitesse)",
      }}
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
