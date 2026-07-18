import type { CSSProperties, ReactNode } from "react";

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
  children,
}: {
  accent: string;
  size?: "lg" | "sm";
  hover?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      className={`${size === "lg" ? "panel" : "panel-sm"} ${hover ? "panel-hover" : ""} ${className}`}
      style={style}
    >
      <span className="panel-accent" style={{ background: accent }} aria-hidden />
      {children}
    </section>
  );
}
