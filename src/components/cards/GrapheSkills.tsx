"use client";

import { useMemo, useState } from "react";
import { courbes } from "@/lib/skills-suivi";
import type { Skill } from "@/lib/types";

/**
 * La trajectoire de toutes les compétences, semaine après semaine.
 *
 * Chaque carte portait déjà ses mini-barres, mais elles ne répondent pas à la
 * question qu'on se pose vraiment : « est-ce que ça monte ? ». Un compteur
 * isolé dit où j'en suis ; une courbe dit dans quel sens je vais, et c'est
 * elle qui donne envie de bouger un curseur.
 *
 * Sur téléphone, huit courbes superposées deviennent illisibles : toucher une
 * compétence dans la légende éteint les autres.
 */

/* Une palette stable : la même compétence garde sa couleur d'une semaine sur
   l'autre, sinon la courbe qu'on suivait des yeux change de teinte. */
const PALETTE = [
  "#ff3d8b",
  "#22d3ee",
  "#3ddc84",
  "#ffc63d",
  "#b06bff",
  "#ff7a3d",
  "#4f9cff",
  "#ff6ba3",
];

const L = 320; // largeur du repère
const H = 132; // hauteur du repère
const MARGE = { haut: 8, bas: 16, gauche: 22, droite: 8 };

export function GrapheSkills({ skills }: { skills: Skill[] }) {
  const [isole, setIsole] = useState<string | null>(null);
  const { cles, series } = useMemo(() => courbes(skills, 12), [skills]);

  /*
   * Une courbe a besoin d'au moins deux points POSÉS pour dire quelque chose.
   * Sans ce garde-fou, la première semaine affichait un repère vide avec une
   * légende — un graphique qui ne montre rien vaut moins que pas de graphique.
   */
  const utiles = series.filter((s) => s.valeurs.filter((v) => v !== null).length >= 2);
  if (utiles.length === 0) return null;

  const x = (i: number) =>
    MARGE.gauche + (i * (L - MARGE.gauche - MARGE.droite)) / Math.max(1, cles.length - 1);
  const y = (v: number) => MARGE.haut + ((100 - v) * (H - MARGE.haut - MARGE.bas)) / 100;

  const chemin = (valeurs: (number | null)[]) => {
    const morceaux: string[] = [];
    let ouvert = false;
    valeurs.forEach((v, i) => {
      if (v === null) {
        ouvert = false;
        return;
      }
      morceaux.push(`${ouvert ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
      ouvert = true;
    });
    return morceaux.join(" ");
  };

  const jourCourt = (cle: string) => {
    const [, m, j] = cle.split("-");
    return j ? `${j}/${m}` : cle;
  };

  return (
    <div className="mt-[13px]">
      <div className="mb-[7px] flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-black tracking-[0.1em] text-white/35">
          PROGRESSION, 12 SEMAINES
        </span>
        {isole && (
          <button
            type="button"
            onClick={() => setIsole(null)}
            className="cursor-pointer text-[10px] font-bold text-white/40 underline"
          >
            tout revoir
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${L} ${H}`}
        className="block w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`Progression des compétences sur 12 semaines : ${utiles
          .map((s) => `${s.nom} ${s.valeurs[s.valeurs.length - 1] ?? "—"}`)
          .join(", ")}`}
      >
        {/* Les repères horizontaux : sans eux, une pente n'a pas d'échelle. */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={MARGE.gauche}
              y1={y(v)}
              x2={L - MARGE.droite}
              y2={y(v)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text
              x={MARGE.gauche - 5}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="7"
              fill="rgba(255,255,255,0.28)"
              fontWeight="700"
            >
              {v}
            </text>
          </g>
        ))}

        {utiles.map((s, i) => {
          const couleur = PALETTE[i % PALETTE.length];
          const efface = isole !== null && isole !== s.id;
          return (
            <path
              key={s.id}
              d={chemin(s.valeurs)}
              fill="none"
              stroke={couleur}
              strokeWidth={isole === s.id ? 2.4 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={efface ? 0.12 : 1}
            />
          );
        })}

        {/* La date des deux bouts : douze étiquettes ne tiendraient pas. */}
        <text x={MARGE.gauche} y={H - 3} fontSize="7" fill="rgba(255,255,255,0.28)" fontWeight="700">
          {jourCourt(cles[0] ?? "")}
        </text>
        <text
          x={L - MARGE.droite}
          y={H - 3}
          textAnchor="end"
          fontSize="7"
          fill="rgba(255,255,255,0.28)"
          fontWeight="700"
        >
          cette semaine
        </text>
      </svg>

      <div className="mt-[7px] flex flex-wrap gap-[5px]">
        {utiles.map((s, i) => {
          const couleur = PALETTE[i % PALETTE.length];
          const actif = isole === null || isole === s.id;
          const debut = s.valeurs.find((v) => v !== null) ?? 0;
          const fin = s.valeurs[s.valeurs.length - 1] ?? 0;
          const delta = fin - debut;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setIsole(isole === s.id ? null : s.id)}
              className="flex min-h-[32px] cursor-pointer items-center gap-[5px] rounded-full px-[8px] py-[4px] text-[10px] font-bold transition-all"
              style={{
                background: actif ? `${couleur}1f` : "rgba(255,255,255,0.03)",
                border: `1px solid ${actif ? `${couleur}55` : "rgba(255,255,255,0.06)"}`,
                color: actif ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)",
              }}
            >
              <span
                className="h-[6px] w-[6px] flex-none rounded-full"
                style={{ background: couleur, opacity: actif ? 1 : 0.35 }}
              />
              {s.nom}
              <span
                className="font-mono"
                style={{
                  color: delta > 0 ? "var(--color-ver-soft)" : "rgba(255,255,255,0.3)",
                }}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
