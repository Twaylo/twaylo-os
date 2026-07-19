"use client";

import { useState } from "react";
import { useOs, type ObjectifVue } from "@/lib/os-context";
import { EmptyState, ProgressBar } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { COULEUR_PORTEE, LIBELLE_PORTEE, ORDRE_PORTEES } from "@/lib/portees";

/**
 * OBJECTIFS — les quatre horizons côte à côte.
 *
 * Une colonne par portée : semaine, mois, trimestre, année. C'est ce que
 * Twaylo demandait — voir les quatre ensemble plutôt que dérouler une liste
 * où l'année se perd sous la semaine.
 *
 * Ils étaient jusqu'ici écrits en dur dans le code : justes le jour où ils
 * ont été tapés, faux tous les jours suivants. Ils vivent maintenant en base.
 *
 * La progression se règle à la main. Un calcul automatique supposerait que
 * l'OS sache mesurer « 100k abonnés » ou « tournage Amérique du Sud », ce
 * qu'il ne sait pas — et une barre qui ment est pire qu'une barre qu'on
 * déplace soi-même. Dès qu'il y a des étapes, ce sont elles qui commandent.
 */
export function ObjectifsView() {
  const { objectifs, ajouterObjectif, majObjectif, supprimerObjectif } = useOs();
  const [nouveau, setNouveau] = useState<Record<string, string>>({});

  if (objectifs === null) {
    return (
      <Panel accent="var(--color-amb)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Lecture des objectifs…
        </div>
      </Panel>
    );
  }

  const global = objectifs.length
    ? Math.round(objectifs.reduce((n, o) => n + o.pct, 0) / objectifs.length)
    : 0;

  return (
    <div className="flex flex-col gap-[14px]">
      <ViewHeader
        title="Objectifs"
        subtitle={
          objectifs.length
            ? `${objectifs.length} objectif${objectifs.length > 1 ? "s" : ""} · ${global} % en moyenne`
            : "Aucun objectif pour l'instant"
        }
      />

      <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-4">
        {ORDRE_PORTEES.map((portee) => {
          const couleur = COULEUR_PORTEE[portee];
          const items = objectifs.filter((o) => o.portee === portee);

          return (
            <Panel key={portee} accent={couleur} className="col-span-1">
              <div className="flex items-start justify-between gap-2">
                <div className="eyebrow tracking-[0.12em]" style={{ color: couleur }}>
                  <span className="eyebrow-dot" style={{ background: couleur }} />
                  {LIBELLE_PORTEE[portee].toUpperCase()}
                </div>
                {items.length > 0 && (
                  <span className="flex-none font-mono text-[11px] font-extrabold text-white/30">
                    {Math.round(items.reduce((n, o) => n + o.pct, 0) / items.length)}%
                  </span>
                )}
              </div>

              <div className="mt-[11px] flex flex-col gap-[9px]">
                {items.length === 0 && (
                  <div
                    className="rounded-[10px] px-[10px] py-[9px] text-[11px] leading-[1.4] text-white/25"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px dashed rgba(255,255,255,0.08)",
                    }}
                  >
                    Rien pour cet horizon.
                  </div>
                )}

                {items.map((o) => (
                  <CarteObjectif
                    key={o.id}
                    objectif={o}
                    couleur={couleur}
                    onMaj={(patch) => majObjectif(o.id, patch)}
                    onSupprimer={() => supprimerObjectif(o.id)}
                  />
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ajouterObjectif(nouveau[portee] ?? "", portee);
                  setNouveau((p) => ({ ...p, [portee]: "" }));
                }}
                className="mt-[9px]"
              >
                <input
                  value={nouveau[portee] ?? ""}
                  onChange={(e) => setNouveau((p) => ({ ...p, [portee]: e.target.value }))}
                  placeholder={`+ objectif ${LIBELLE_PORTEE[portee].toLowerCase()}`}
                  aria-label={`Ajouter un objectif — ${LIBELLE_PORTEE[portee].toLowerCase()}`}
                  className="w-full rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.13)",
                  }}
                />
              </form>
            </Panel>
          );
        })}
      </div>

      {objectifs.length === 0 && (
        <Panel accent="var(--color-amb)">
          <EmptyState hint="Écris-en un dans la colonne qui correspond à son horizon. Clique dessus ensuite pour y ajouter des étapes.">
            Rien à viser pour l&apos;instant
          </EmptyState>
        </Panel>
      )}
    </div>
  );
}

function CarteObjectif({
  objectif,
  couleur,
  onMaj,
  onSupprimer,
}: {
  objectif: ObjectifVue;
  couleur: string;
  onMaj: (patch: Partial<Omit<ObjectifVue, "id">>) => void;
  onSupprimer: () => void;
}) {
  const [nouvelleEtape, setNouvelleEtape] = useState("");
  const [deplie, setDeplie] = useState(false);

  /*
   * Cocher une étape recalcule la progression.
   *
   * Tant qu'il y a des étapes, elles font foi : régler la barre à la main
   * pendant que trois étapes sur cinq sont cochées afficherait deux vérités
   * contradictoires côte à côte.
   */
  function majEtapes(etapes: { texte: string; fait: boolean }[]) {
    const faites = etapes.filter((e) => e.fait).length;
    onMaj({
      etapes,
      pct: etapes.length ? Math.round((faites / etapes.length) * 100) : objectif.pct,
      valeur: etapes.length ? `${faites}/${etapes.length}` : objectif.valeur,
    });
  }

  const atteint = objectif.pct >= 100;

  return (
    <div
      className="group relative rounded-[12px] px-[11px] py-[10px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${atteint ? couleur : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <button
        type="button"
        onClick={() => setDeplie((v) => !v)}
        title={deplie ? "Replier" : "Déplier les étapes"}
        className="w-full cursor-pointer text-left"
      >
        <div className="flex items-baseline justify-between gap-2 pr-[16px]">
          <span className="text-[12.5px] font-bold leading-[1.3]">{objectif.objectif}</span>
          <span
            className="flex-none font-mono text-[11.5px] font-extrabold"
            style={{ color: atteint ? couleur : "rgba(255,255,255,0.6)" }}
          >
            {objectif.valeur || `${objectif.pct}%`}
          </span>
        </div>
        <div className="mt-[6px]">
          <ProgressBar pct={objectif.pct} color={couleur} />
        </div>
      </button>

      <button
        type="button"
        onClick={onSupprimer}
        title="Supprimer"
        aria-label={`Supprimer ${objectif.objectif}`}
        className="absolute right-[7px] top-[7px] cursor-pointer rounded-[5px] px-[4px] text-[11px] font-black opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.14)" }}
      >
        ×
      </button>

      {deplie && (
        <div className="mt-[9px]">
          {/*
            Le curseur ne sert que s'il n'y a pas d'étapes : avec des étapes,
            ce sont elles qui commandent la barre.
          */}
          {objectif.etapes.length === 0 && (
            <div className="mb-[8px]">
              <div className="mb-[3px] text-[8.5px] font-black tracking-[0.1em] text-white/30">
                PROGRESSION
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={objectif.pct}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  onMaj({ pct, valeur: `${pct}%` });
                }}
                aria-label={`Progression de ${objectif.objectif}`}
                className="w-full cursor-pointer"
                style={{ accentColor: couleur }}
              />
            </div>
          )}

          <div className="flex flex-col gap-[4px]">
            {objectif.etapes.map((e, i) => (
              <div key={i} className="flex items-center gap-[7px]">
                <button
                  type="button"
                  onClick={() =>
                    majEtapes(
                      objectif.etapes.map((x, j) => (j === i ? { ...x, fait: !x.fait } : x)),
                    )
                  }
                  aria-pressed={e.fait}
                  className="flex h-[15px] w-[15px] flex-none cursor-pointer items-center justify-center rounded-[4px] text-[9px] font-black text-[#07121d] transition-all hover:brightness-125"
                  style={{
                    background: e.fait ? couleur : "transparent",
                    border: `2px solid ${e.fait ? couleur : "rgba(255,255,255,0.22)"}`,
                  }}
                >
                  {e.fait ? "✓" : ""}
                </button>
                <span
                  className="flex-1 text-[11.5px] font-semibold leading-[1.3]"
                  style={{
                    color: e.fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
                    textDecoration: e.fait ? "line-through" : "none",
                  }}
                >
                  {e.texte}
                </span>
                <button
                  type="button"
                  onClick={() => majEtapes(objectif.etapes.filter((_, j) => j !== i))}
                  title="Retirer l'étape"
                  aria-label={`Retirer ${e.texte}`}
                  className="flex-none cursor-pointer px-[3px] text-[11px] font-black text-white/20 transition-colors hover:text-[color:var(--color-mag-soft)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const texte = nouvelleEtape.trim();
              if (!texte) return;
              majEtapes([...objectif.etapes, { texte, fait: false }]);
              setNouvelleEtape("");
            }}
            className="mt-[6px]"
          >
            <input
              value={nouvelleEtape}
              onChange={(ev) => setNouvelleEtape(ev.target.value)}
              placeholder="+ étape"
              aria-label={`Ajouter une étape à ${objectif.objectif}`}
              className="w-full rounded-[7px] px-[8px] py-[5px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px dashed rgba(255,255,255,0.12)",
              }}
            />
          </form>
        </div>
      )}
    </div>
  );
}
