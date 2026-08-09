"use client";

import { useOs } from "@/lib/os-context";
import { useProgression } from "@/lib/progression-context";
import { useHeure } from "@/lib/use-heure";
import { localDateKey } from "@/lib/local-date";
import { relanceDuJour } from "@/lib/relance";

/**
 * La bannière de relance — ce que l'OS dit quand la journée reste vide.
 *
 * Elle n'apparaît que si elle a quelque chose à dire, et disparaît à la
 * première coche. Elle propose UNE action, jamais une liste : « commence par
 * réveil + sport » fait lever, « voici tes 7 blocs » fait fermer l'onglet.
 */
export function RelanceBanner() {
  const { demoMode, journees, blocsFaits, basculerBlocFait } = useOs();
  const { pret, xpJour, serie, dernierJourRempli } = useProgression();
  const heure = useHeure();

  if (demoMode || !pret || !heure) return null;

  const modele =
    journees?.liste.find((j) => j.id === journees.active) ?? journees?.liste[0] ?? null;
  const restants = (modele?.blocs ?? []).filter((b) => !blocsFaits.includes(b.id));
  const premier = restants[0];

  const relance = relanceDuJour({
    xpJour,
    serie,
    dernierJourRempli,
    aujourdhui: localDateKey(),
    heure: Number(heure.slice(0, 2)),
    blocsRestants: restants.length,
    premierBloc: premier?.titre,
  });

  if (!relance) return null;

  return (
    <div
      className="relative flex flex-wrap items-center gap-x-[14px] gap-y-[10px] overflow-hidden rounded-[14px] px-[16px] py-[12px]"
      style={{
        background: `color-mix(in srgb, ${relance.couleur} 9%, rgba(255,255,255,0.03))`,
        border: `1px solid color-mix(in srgb, ${relance.couleur} 32%, transparent)`,
      }}
      role="status"
    >
      <span className="flex-none text-[24px] leading-none">{relance.emoji}</span>

      <div className="min-w-[200px] flex-1 leading-[1.35]">
        <div className="text-[13.5px] font-black" style={{ color: relance.couleur }}>
          {relance.titre}
        </div>
        <div className="mt-[2px] text-[12px] font-semibold text-white/55">{relance.texte}</div>
      </div>

      {premier && (
        <button
          type="button"
          onClick={() => basculerBlocFait(premier.id)}
          className="flex-none cursor-pointer rounded-[10px] px-[13px] py-[7px] text-[12px] font-extrabold transition-all hover:brightness-125"
          style={{ color: "#07121d", background: relance.couleur }}
        >
          Cocher « {premier.titre.length > 24 ? `${premier.titre.slice(0, 24)}…` : premier.titre} »
        </button>
      )}
    </div>
  );
}
