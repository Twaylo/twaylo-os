import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * Le wrapper verre dépoli commun à toutes les cartes.
 * `accent` peint la barre fine du haut — une couleur par carte, comme le
 * prévoit le tableau de la spec Partie 3. Passer `var(--grad)` pour la carte
 * Session qui porte le dégradé signature.
 */
export function Panel({
  accent,
  size = "lg",
  hover = true,
  className = "",
  style,
  innerRef,
  zone,
  children,
}: {
  accent: string;
  size?: "lg" | "sm";
  hover?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * La carte elle-même, pour qui a besoin de la mesurer.
   *
   * Sert au glisser-déposer : une colonne d'objectifs EST une carte, et le
   * moteur doit connaître son cadre pour savoir quand le doigt entre dedans.
   */
  innerRef?: Ref<HTMLElement>;
  /** Marque la carte comme zone de dépôt — lisible depuis le DOM. */
  zone?: string;
  children: ReactNode;
}) {
  return (
    <section
      ref={innerRef}
      data-zone={zone}
      className={`${size === "lg" ? "panel" : "panel-sm"} ${hover ? "panel-hover" : ""} ${className}`}
      style={style}
    >
      <span className="panel-accent" style={{ background: accent }} aria-hidden />
      {children}
    </section>
  );
}
