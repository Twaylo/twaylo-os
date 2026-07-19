"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FORMAT_META } from "@/lib/labels";
import type { Format } from "@/lib/types";
import { useOs } from "@/lib/os-context";
import { useDictation } from "@/lib/use-dictation";

/** Libellé en tête de carte : pastille colorée + texte capitalisé. */
export function Eyebrow({
  color,
  dot = color,
  children,
  className = "",
}: {
  color: string;
  dot?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`eyebrow ${className}`} style={{ color }}>
      <span className="eyebrow-dot" style={{ background: dot }} />
      {children}
    </div>
  );
}

/**
 * Ligne de checklist. `accent` colore la case une fois cochée.
 *
 * Cocher déclenche une animation : à-coup sur la case, tracé du ✓, onde qui
 * se dissipe, et la ligne qui se décale d'un cheveu. Décocher n'anime rien —
 * on récompense l'avancée, pas le retour en arrière.
 */
export function CheckRow({
  label,
  done,
  accent,
  onToggle,
  meta,
}: {
  label: string;
  done: boolean;
  accent: string;
  onToggle: () => void;
  meta?: string;
}) {
  const [anime, setAnime] = useState(false);
  const precedent = useRef(done);

  useEffect(() => {
    // On n'anime qu'au passage de non-fait à fait, et jamais au premier rendu
    // (sinon toute la liste s'agite au chargement de la page).
    if (done && !precedent.current) {
      setAnime(true);
      const t = setTimeout(() => setAnime(false), 600);
      precedent.current = done;
      return () => clearTimeout(t);
    }
    precedent.current = done;
  }, [done]);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      className={`check-row relative hover:brightness-125 ${anime ? "ligne-validee" : ""}`}
      style={{
        background: done ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)",
        border: `1px solid ${done ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {anime && (
        <span
          className="onde-validation"
          aria-hidden
          style={{ boxShadow: `0 0 0 2px ${accent}, 0 0 22px 4px ${accent}` }}
        />
      )}

      <span
        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] text-[11px] font-black text-[#07121d] ${anime ? "case-cochee" : ""}`}
        style={{
          background: done ? accent : "transparent",
          border: `2px solid ${done ? accent : "rgba(255,255,255,0.22)"}`,
        }}
      >
        {done && <span className={anime ? "case-marque" : ""}>✓</span>}
      </span>
      <span
        className="flex-1 text-[12.5px] font-bold leading-[1.3]"
        style={{
          color: done ? "rgba(255,255,255,0.38)" : "var(--color-fg)",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {label}
      </span>
      {meta && (
        // S'efface quand la ligne est survolée : la barre d'actions vient se
        // placer exactement ici, et les deux se chevauchaient.
        // `group-hover` ne s'applique que si un ancêtre porte `.group` — sans
        // lui, l'étiquette reste simplement visible.
        <span className="flex-none text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-white/30 transition-opacity group-hover:opacity-0">
          {meta}
        </span>
      )}
    </button>
  );
}

/** Étape d'objectif : même logique que CheckRow mais en lecture seule et plus dense. */
export function StepRow({
  label,
  done,
  accent,
}: {
  label: string;
  done: boolean;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-[9px]">
      <span
        className="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] text-[10px] font-black text-[#07121d]"
        style={{
          background: done ? accent : "transparent",
          border: `2px solid ${done ? accent : "rgba(255,255,255,0.22)"}`,
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span
        className="text-[12.5px] font-bold"
        style={{ color: done ? "rgba(255,255,255,0.5)" : "var(--color-fg)" }}
      >
        {label}
      </span>
    </div>
  );
}

/** Pastille de format vidéo. Le Short est plein, les autres en contour. */
export function FormatBadge({ format }: { format: Format }) {
  const { fill, color } = FORMAT_META[format];
  return (
    <span
      className="inline-block flex-none rounded-[6px] px-[7px] py-[2px] text-[9.5px] font-black tracking-[0.04em]"
      style={
        fill
          ? { color: "#07121d", background: color, border: "none" }
          : {
              color,
              background: "color-mix(in srgb, currentColor 14%, transparent)",
              border: "1px solid color-mix(in srgb, currentColor 35%, transparent)",
            }
      }
    >
      {format}
    </span>
  );
}

/** Petite pastille de statut générique (relation CRM, type de contact…). */
export function Chip({
  label,
  color,
  subtle = false,
}: {
  label: string;
  color: string;
  subtle?: boolean;
}) {
  return (
    <span
      className="inline-block flex-none rounded-full px-2 py-[2px] text-[9.5px] font-black tracking-[0.04em]"
      style={
        subtle
          ? {
              color: "rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.09)",
            }
          : {
              color,
              background: "color-mix(in srgb, currentColor 14%, transparent)",
              border: "1px solid color-mix(in srgb, currentColor 35%, transparent)",
            }
      }
    >
      {label}
    </span>
  );
}

/**
 * Bouton de dictée. Chaque bouton pilote sa propre reconnaissance et écrit
 * dans le champ qu'on lui désigne — la barre de capture et le journal ne
 * partagent plus un état micro global qui ne servait à rien.
 */
export function MicButton({
  onTranscript,
  className = "",
}: {
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const { supported, listening, interim, error, toggle } = useDictation(onTranscript);

  const titre = !supported
    ? "Dictée indisponible sur ce navigateur (essaie Chrome ou Edge)"
    : listening
      ? `Dictée en cours — clique pour arrêter${interim ? ` · « ${interim} »` : ""}`
      : "Dictée vocale";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported}
      title={error ?? titre}
      aria-label="Dictée vocale"
      aria-pressed={listening}
      className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] transition-all disabled:cursor-not-allowed disabled:opacity-30 ${supported ? "cursor-pointer hover:brightness-125" : ""} ${className}`}
      style={{
        border: `1px solid ${listening ? "rgba(255,61,139,0.6)" : "rgba(255,255,255,0.14)"}`,
        background: listening ? "rgba(255,61,139,0.2)" : "rgba(255,255,255,0.05)",
      }}
    >
      <span
        className="block h-[11px] w-[11px] rounded-full"
        style={{
          background: listening ? "var(--color-mag)" : "rgba(255,255,255,0.5)",
          animation: listening ? "pulseDot 1s ease-in-out infinite" : "none",
        }}
      />
    </button>
  );
}

/** Barre de progression pleine largeur. */
export function ProgressBar({
  pct,
  color,
  height = 6,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  return (
    <div className="bar-track" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** En-tête d'une colonne de kanban. */
export function ColumnHead({
  name,
  count,
  color,
  size = 10.5,
}: {
  name: string;
  count: number;
  color: string;
  size?: number;
}) {
  return (
    <div
      className="font-black uppercase tracking-[0.03em]"
      style={{ color, fontSize: size }}
    >
      {name} <span className="opacity-55">{count}</span>
    </div>
  );
}

/** Chiffre en chasse fixe, flouté tant que « Révéler » est off. */
export function Amount({
  children,
  hidden,
  className = "",
  style,
}: {
  children: ReactNode;
  hidden: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`font-mono transition-[filter] duration-200 ${className}`}
      style={{ filter: hidden ? "blur(7px)" : "none", ...style }}
    >
      {children}
    </span>
  );
}

/** Bouton Révéler / Masquer, présent sur l'accueil et sur la page Revenus. */
export function RevealButton({ large = false }: { large?: boolean }) {
  const { revealed, toggleRevealed } = useOs();
  return (
    <button
      type="button"
      onClick={toggleRevealed}
      className="cursor-pointer font-extrabold transition-all hover:brightness-125"
      style={{
        border: "1px solid rgba(61,220,132,0.35)",
        background: "rgba(61,220,132,0.1)",
        color: "var(--color-ver-soft)",
        borderRadius: large ? 10 : 9,
        padding: large ? "8px 14px" : "5px 10px",
        fontSize: large ? 13 : 11,
      }}
    >
      {revealed ? "Masquer" : "Révéler"}
    </button>
  );
}

/**
 * L'état vide d'une carte. Twaylo démarre : la plupart des cartes sont vides
 * en mode réel, et le dire vaut mieux que d'afficher des zéros trompeurs.
 */
export function EmptyState({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-3 py-6 text-center">
      <div className="text-[12.5px] font-bold text-white/45">{children}</div>
      {hint && <div className="text-[11px] text-white/25">{hint}</div>}
    </div>
  );
}
