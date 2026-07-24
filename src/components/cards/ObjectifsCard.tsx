"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow, EmptyState, ProgressBar } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { COULEUR_PORTEE, LIBELLE_PORTEE, ORDRE_PORTEES, sansAccent } from "@/lib/portees";

/**
 * Le résumé de l'accueil. La page Objectifs détaille les sous-étapes.
 *
 * Les objectifs viennent maintenant de la base. Ils étaient écrits en dur dans
 * le code : justes le jour où ils ont été tapés, faux tous les jours suivants.
 */
export function ObjectifsCard() {
  const { objectifs, demoMode, data } = useOs();

  // En démo on garde le jeu factice, qui sert aux captures d'écran.
  const liste = demoMode
    ? data.objectives.map((o) => ({
        id: o.period,
        // « ANNÉE ».toLowerCase() donne « année », qui ne correspond à
        // aucune clé : l'objectif annuel remontait en tête et prenait la
        // mauvaise couleur.
        portee: sansAccent(o.period),
        objectif: o.label,
        valeur: o.value,
        pct: o.pct,
      }))
    : // Les archivés (atteints ou abandonnés) restent dans l'onglet Objectifs :
      // l'accueil ne montre que ce qui est encore à viser.
      (objectifs ?? [])
        .filter((o) => o.statut === "en_cours")
        .map((o) => ({
          id: o.id,
          portee: o.portee,
          objectif: o.objectif,
          valeur: o.valeur,
          pct: o.pct,
        }));

  // L'ordre du temps : la semaine avant l'année, jamais l'ordre de création.
  const ordonnes = [...liste].sort(
    (a, b) => ORDRE_PORTEES.indexOf(a.portee) - ORDRE_PORTEES.indexOf(b.portee),
  );

  return (
    <Panel accent="var(--color-amb)" className="col-span-full md:col-span-2 xl:col-span-1">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow color="var(--color-amb-soft)" dot="var(--color-amb)">
          OBJECTIFS
        </Eyebrow>
        {ordonnes.length > 0 && (
          <span className="flex-none font-mono text-[11px] font-extrabold text-white/30">
            {Math.round(ordonnes.reduce((n, o) => n + o.pct, 0) / ordonnes.length)}%
          </span>
        )}
      </div>

      {ordonnes.length === 0 ? (
        <EmptyState hint="Ajoute-les dans l'onglet Objectifs — semaine, mois, trimestre, année.">
          Aucun objectif
        </EmptyState>
      ) : (
        <div className="mt-3 flex flex-col gap-[11px]">
          {ordonnes.map((o) => (
            <div key={o.id}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span
                    className="text-[9.5px] font-extrabold"
                    style={{ color: COULEUR_PORTEE[o.portee] ?? "var(--color-amb-soft)" }}
                  >
                    {(LIBELLE_PORTEE[o.portee] ?? o.portee).toUpperCase()}
                  </span>
                  <div className="mt-[1px] truncate text-[12px] font-bold">{o.objectif}</div>
                </div>
                <div className="flex-none font-mono text-[11.5px] font-extrabold text-white/65">
                  {o.valeur || `${o.pct}%`}
                </div>
              </div>
              <div className="mt-[5px]">
                <ProgressBar pct={o.pct} color={COULEUR_PORTEE[o.portee] ?? "var(--color-amb)"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
