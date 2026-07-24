"use client";

import { useState } from "react";
import { useOs, type ObjectifVue } from "@/lib/os-context";
import { EmptyState, ProgressBar } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { COULEUR_PORTEE, LIBELLE_PORTEE, ORDRE_PORTEES } from "@/lib/portees";

/** Le serveur tronque au-delà : on l'annonce au lieu de le subir. */
const MAX_ETAPES = 12;

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
  const [archiveOuverte, setArchiveOuverte] = useState(false);

  if (objectifs === null) {
    return (
      <Panel accent="var(--color-amb)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Lecture des objectifs…
        </div>
      </Panel>
    );
  }

  /*
   * Actifs d'un côté, archivés de l'autre.
   *
   * Un objectif bouclé ou abandonné n'a plus rien à faire dans sa colonne — il
   * dilue la moyenne et encombre l'horizon. Mais le supprimer effacerait la
   * trace de ce qui a été visé : l'archive garde la mémoire sans polluer la vue.
   * Le statut vit déjà en base ('en_cours' / 'atteint' / 'abandonne').
   */
  const actifs = objectifs.filter((o) => o.statut === "en_cours");
  const archives = objectifs.filter((o) => o.statut !== "en_cours");

  const global = actifs.length
    ? Math.round(actifs.reduce((n, o) => n + o.pct, 0) / actifs.length)
    : 0;

  return (
    <div className="flex flex-col gap-[14px]">
      <ViewHeader
        title="Objectifs"
        subtitle={
          actifs.length
            ? `${actifs.length} objectif${actifs.length > 1 ? "s" : ""} · ${global} % en moyenne`
            : archives.length
              ? "Aucun objectif en cours — l'archive est en bas"
              : "Aucun objectif pour l'instant"
        }
      />

      <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-4">
        {ORDRE_PORTEES.map((portee) => {
          const couleur = COULEUR_PORTEE[portee];
          const items = actifs.filter((o) => o.portee === portee);

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
                    onArchiver={(statut) => majObjectif(o.id, { statut })}
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

      {/* Le grand panneau d'accueil ne sert que sur une page vraiment vide :
          dès qu'il y a une archive, c'est elle qui occupe le bas. */}
      {actifs.length === 0 && archives.length === 0 && (
        <Panel accent="var(--color-amb)">
          <EmptyState hint="Écris-en un dans la colonne qui correspond à son horizon. Clique dessus ensuite pour y ajouter des étapes.">
            Rien à viser pour l&apos;instant
          </EmptyState>
        </Panel>
      )}

      {archives.length > 0 && (
        <Panel accent="rgba(255,255,255,0.18)">
          <button
            type="button"
            onClick={() => setArchiveOuverte((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
          >
            <div className="eyebrow tracking-[0.12em] text-white/45">
              <span className="eyebrow-dot" style={{ background: "rgba(255,255,255,0.3)" }} />
              ARCHIVE
            </div>
            <div className="flex items-center gap-[9px]">
              <span className="font-mono text-[11px] font-extrabold text-white/30">
                {archives.length} objectif{archives.length > 1 ? "s" : ""}
              </span>
              <span className="text-[11px] font-black text-white/30">
                {archiveOuverte ? "▾" : "▸"}
              </span>
            </div>
          </button>

          {archiveOuverte && (
            <div className="mt-[11px] flex flex-col gap-[6px]">
              {archives.map((o) => {
                const couleur = COULEUR_PORTEE[o.portee as keyof typeof COULEUR_PORTEE] ??
                  "rgba(255,255,255,0.3)";
                const atteint = o.statut === "atteint";
                return (
                  <div
                    key={o.id}
                    className="group flex items-center gap-[9px] rounded-[10px] px-[10px] py-[8px]"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span
                      className="h-[7px] w-[7px] flex-none rounded-full"
                      style={{ background: couleur }}
                      title={LIBELLE_PORTEE[o.portee as keyof typeof LIBELLE_PORTEE] ?? o.portee}
                    />
                    <span className="flex-1 truncate text-[12px] font-bold text-white/55">
                      {o.objectif}
                    </span>
                    <span
                      className="flex-none rounded-[5px] px-[6px] py-[1px] text-[9.5px] font-black tracking-[0.06em]"
                      style={{
                        color: atteint ? "var(--color-ver-soft)" : "rgba(255,255,255,0.35)",
                        background: atteint ? "rgba(61,220,132,0.12)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      {atteint ? "ATTEINT" : "ABANDONNÉ"}
                    </span>
                    <span className="flex-none font-mono text-[11px] font-extrabold text-white/30">
                      {o.valeur || `${o.pct}%`}
                    </span>
                    <button
                      type="button"
                      onClick={() => majObjectif(o.id, { statut: "en_cours" })}
                      title="Remettre en cours"
                      aria-label={`Remettre ${o.objectif} en cours`}
                      className="flex-none cursor-pointer rounded-[5px] px-[5px] py-[1px] text-[10px] font-black text-white/40 opacity-0 transition-all hover:text-white/80 group-hover:opacity-100"
                      style={{ background: "rgba(255,255,255,0.07)" }}
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerObjectif(o.id)}
                      title="Supprimer définitivement"
                      aria-label={`Supprimer ${o.objectif}`}
                      className="flex-none cursor-pointer rounded-[5px] px-[5px] py-[1px] text-[10px] font-black opacity-0 transition-all group-hover:opacity-100"
                      style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.14)" }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
  onArchiver,
}: {
  objectif: ObjectifVue;
  couleur: string;
  onMaj: (patch: Partial<Omit<ObjectifVue, "id">>) => void;
  onSupprimer: () => void;
  onArchiver: (statut: "atteint" | "abandonne") => void;
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

    if (etapes.length === 0) {
      /*
       * Plus aucune étape : le libellé « 2/5 » n'a plus de sens.
       *
       * Il était conservé tel quel, et la carte de l'accueil affichait donc un
       * compteur d'étapes qui n'existaient plus. On repasse au pourcentage,
       * que le curseur reprend la main.
       */
      onMaj({ etapes, valeur: `${objectif.pct}%` });
      return;
    }

    onMaj({
      etapes,
      pct: Math.round((faites / etapes.length) * 100),
      valeur: `${faites}/${etapes.length}`,
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
        {/* Trois actions au survol maintenant : on leur réserve la place. */}
        <div className="flex items-baseline justify-between gap-2 pr-[62px]">
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

      {/* Archiver plutôt que supprimer : la trace de ce qu'on a visé se garde.
          ✓ pour un objectif atteint, ⌀ pour un objectif qu'on lâche. */}
      <div className="absolute right-[7px] top-[7px] flex items-center gap-[3px] opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onArchiver("atteint")}
          title="Archiver comme atteint"
          aria-label={`Archiver ${objectif.objectif} comme atteint`}
          className="cursor-pointer rounded-[5px] px-[4px] text-[11px] font-black transition-all hover:brightness-125"
          style={{ color: "var(--color-ver-soft)", background: "rgba(61,220,132,0.14)" }}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => onArchiver("abandonne")}
          title="Archiver comme abandonné"
          aria-label={`Archiver ${objectif.objectif} comme abandonné`}
          className="cursor-pointer rounded-[5px] px-[4px] text-[11px] font-black text-white/40 transition-all hover:text-white/70"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          ⌀
        </button>
        <button
          type="button"
          onClick={onSupprimer}
          title="Supprimer définitivement"
          aria-label={`Supprimer ${objectif.objectif}`}
          className="cursor-pointer rounded-[5px] px-[4px] text-[11px] font-black transition-all hover:brightness-125"
          style={{ color: "var(--color-mag-soft)", background: "rgba(255,61,139,0.14)" }}
        >
          ×
        </button>
      </div>

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
              // Même plafond que le serveur : au-delà, il tronquait en
              // silence et l'étape disparaissait au rechargement suivant.
              if (!texte || objectif.etapes.length >= MAX_ETAPES) return;
              majEtapes([...objectif.etapes, { texte, fait: false }]);
              setNouvelleEtape("");
            }}
            className="mt-[6px]"
          >
            <input
              value={nouvelleEtape}
              onChange={(ev) => setNouvelleEtape(ev.target.value)}
              disabled={objectif.etapes.length >= MAX_ETAPES}
              maxLength={160}
              placeholder={
                objectif.etapes.length >= MAX_ETAPES
                  ? `${MAX_ETAPES} étapes maximum`
                  : "+ étape"
              }
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
