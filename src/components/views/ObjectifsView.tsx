"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HORIZONS,
  OBJECTIFS_P90,
  ecartJours,
  progression,
  tresorerie,
  type Horizon,
  type ObjectifP90,
} from "@/lib/p90";
import { useCockpit, type ButVue, type ObjectifVue } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import { Barre, Bouton, Carte, Champ, Euros, Puce, Surtitre, Vide, formaterJour, formaterNombre } from "@/components/p90/ui";

/**
 * LES OBJECTIFS — quatre horizons, côte à côte.
 *
 * Semaine, mois, trimestre, année : une colonne chacun, à l'horizontale. C'est
 * l'onglet d'avant le Projet 90, que Twaylo a redemandé (« remets-le en
 * horizontal », « permets de mettre objectif semaine / mois / année ») — voir
 * les quatre ensemble plutôt que dérouler une liste où l'année se perd sous
 * la semaine. Sur téléphone, les colonnes restent côte à côte et se
 * parcourent d'un glissement du doigt.
 *
 * Les cinq objectifs du Projet 90 vivent dans la colonne Trimestre : 90 jours,
 * c'est un trimestre. Ils gardent ce qui les distingue — un chiffre de départ
 * et une cible, des jalons datés, la trésorerie déduite des OP payées.
 *
 * Les objectifs de Twaylo se règlent à la main : un calcul automatique
 * supposerait que l'OS sache mesurer « 100k abonnés » ou « tournage en
 * Pologne », ce qu'il ne sait pas — et une barre qui ment est pire qu'une
 * barre qu'on déplace soi-même. Dès qu'il y a des étapes, ce sont elles qui
 * commandent.
 */

/** Le serveur tronque au-delà : on l'annonce au lieu de le subir. */
const MAX_ETAPES = 12;

/** Le nombre contenu dans une saisie libre (« 412 000 », « 412000 »). */
function nombreDe(valeur: string): number {
  const nu = valeur.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(nu);
  return Number.isFinite(n) ? n : 0;
}

export function ObjectifsView() {
  const {
    aujourdhui,
    objectifs,
    ops,
    buts,
    pret,
    modifierObjectif,
    ajouterBut,
    modifierBut,
    deposerBut,
    supprimerBut,
    verrouSync,
  } = useCockpit();

  const [nouveau, setNouveau] = useState<Record<Horizon, string>>({
    semaine: "",
    mois: "",
    trimestre: "",
    annee: "",
  });
  /** La carte dépliée : un seul à la fois, la page reste lisible. */
  const [deplie, setDeplie] = useState<string | null>(null);
  const [archiveOuverte, setArchiveOuverte] = useState(false);

  const tresor = useMemo(() => tresorerie(ops), [ops]);
  const suiviP90 = useMemo(() => new Map(objectifs.map((o) => [o.cle, o])), [objectifs]);

  const actifs = useMemo(() => buts.filter((b) => b.statut === "en_cours"), [buts]);
  const archives = useMemo(() => buts.filter((b) => b.statut !== "en_cours"), [buts]);

  /*
   * GLISSER UN OBJECTIF D'UN HORIZON À L'AUTRE — ce qui devait tenir dans la
   * semaine glisse au mois. Même moteur que la todo : appui long au doigt,
   * six pixels à la souris, colonne visée qui s'allume.
   */
  const horizonParId = useMemo(() => new Map(actifs.map((b) => [b.id, b.horizon])), [actifs]);
  const { dragId, ordreVisuel, zoneCourante, commencerDrag, setRowRef, setZoneRef, grilleRef, glissementArmeRef } =
    useGlisser<Horizon>({
      ordre: actifs.map((b) => b.id),
      zoneDe: (id) => horizonParId.get(id) ?? "mois",
      onDepot: (ids, changement) => {
        // Les archivés gardent leur place dans l'ordre complet.
        const visibles = new Set(ids);
        const complet: string[] = [];
        let curseur = 0;
        for (const b of buts) {
          if (visibles.has(b.id)) {
            complet.push(ids[curseur]);
            curseur += 1;
          } else {
            complet.push(b.id);
          }
        }
        void deposerBut(complet, changement ? { id: changement.id, horizon: changement.zone } : null);
      },
      bloque: deplie !== null,
      zoneParDefaut: "mois",
    });

  useEffect(() => {
    verrouSync("glisser", dragId !== null);
    return () => verrouSync("glisser", false);
  }, [dragId, verrouSync]);

  const parId = new Map(actifs.map((b) => [b.id, b]));
  const affiches: ButVue[] = dragId
    ? ordreVisuel
        .map((id) => parId.get(id))
        .filter((b): b is ButVue => Boolean(b))
        .map((b) => (b.id === dragId ? { ...b, horizon: zoneCourante } : b))
    : actifs;

  const moyenneGenerale = actifs.length
    ? Math.round(actifs.reduce((n, b) => n + b.pct, 0) / actifs.length)
    : null;

  return (
    <div className="entree-vue space-y-[14px]">
      {/*
        L'ARCHIVE EN TÊTE, dans une capsule — et pas sous les colonnes.

        Au téléphone, les colonnes défilent à l'horizontale et la plus haute
        (le trimestre) fixe la hauteur de toutes : posée dessous, l'archive
        tombait loin sous une colonne courte, après un grand vide.
      */}
      <div className="flex flex-wrap items-center gap-[9px] px-[2px]">
        <span className="nombres text-[13px] font-medium text-white/50">
          {actifs.length} objectif{actifs.length > 1 ? "s" : ""} à toi
          {moyenneGenerale !== null && ` · ${moyenneGenerale} % en moyenne`}
        </span>
        <span className="flex-1" />
        {archives.length > 0 && (
          <Bouton onClick={() => setArchiveOuverte((v) => !v)} titre="Les objectifs atteints ou abandonnés">
            Archive · {archives.length} {archiveOuverte ? "▾" : "▸"}
          </Bouton>
        )}
      </div>

      {archiveOuverte && archives.length > 0 && (
        <Carte accent="rgba(255,255,255,0.3)" survol={false}>
          <Surtitre>Archive</Surtitre>
          <div className="mt-[12px] flex flex-col gap-[7px]">
            {archives.map((b) => {
              const couleur = HORIZONS.find((h) => h.id === b.horizon)?.couleur ?? "rgba(255,255,255,0.3)";
              const atteint = b.statut === "atteint";
              return (
                <div key={b.id} className="carte-haute flex items-center gap-[10px] px-[12px] py-[9px]">
                  <span className="h-[8px] w-[8px] flex-none rounded-full" style={{ background: couleur }} />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-white/60">{b.titre}</span>
                  <Puce ton={atteint ? "succes" : "neutre"}>{atteint ? "Atteint" : "Abandonné"}</Puce>
                  <Bouton onClick={() => void modifierBut(b.id, { statut: "en_cours" })} titre="Remettre en cours">
                    ↺
                  </Bouton>
                  <Bouton ton="danger" onClick={() => void supprimerBut(b.id)} titre="Supprimer définitivement">
                    ×
                  </Bouton>
                </div>
              );
            })}
          </div>
        </Carte>
      )}

      <div ref={grilleRef} className="colonnes-horizontales">
        {HORIZONS.map((h) => {
          const items = affiches.filter((b) => b.horizon === h.id);
          const p90 = h.id === "trimestre" ? OBJECTIFS_P90 : [];
          const pcts = [
            ...items.map((b) => b.pct),
            ...p90.map((def) => pctP90(def, suiviP90.get(def.id), tresor)),
          ];
          const moyenne = pcts.length ? Math.round(pcts.reduce((n, x) => n + x, 0) / pcts.length) : null;
          const vise = Boolean(dragId) && zoneCourante === h.id;

          return (
            <Carte
              key={h.id}
              accent={h.couleur}
              survol={false}
              innerRef={setZoneRef(h.id)}
              zone={h.id}
              className={`zone-depot ${vise ? "zone-visee" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <Surtitre couleur={h.couleur}>{h.nom}</Surtitre>
                {moyenne !== null && (
                  <span className="nombres text-[14px] font-semibold text-white/50">{moyenne} %</span>
                )}
              </div>

              <div className="mt-[12px] flex flex-col gap-[9px]">
                {p90.map((def) => (
                  <CarteP90
                    key={def.id}
                    def={def}
                    suivi={suiviP90.get(def.id)}
                    tresor={def.calcule ? tresor : null}
                    aujourdhui={aujourdhui}
                    pret={pret}
                    ouvert={deplie === `p90:${def.id}`}
                    surOuvrir={() => setDeplie(deplie === `p90:${def.id}` ? null : `p90:${def.id}`)}
                    surValeur={(v) => void modifierObjectif(def.id, { valeur: v })}
                    surJalon={(texte, fait) => {
                      const actuels =
                        suiviP90.get(def.id)?.jalons ?? def.jalons.map((j) => ({ texte: j.texte, fait: false }));
                      const connus = new Set(actuels.map((j) => j.texte));
                      const complets = [
                        ...actuels,
                        ...def.jalons.filter((j) => !connus.has(j.texte)).map((j) => ({ texte: j.texte, fait: false })),
                      ];
                      void modifierObjectif(def.id, {
                        jalons: complets.map((j) => (j.texte === texte ? { ...j, fait } : j)),
                      });
                    }}
                  />
                ))}

                {items.map((b) => (
                  <CarteBut
                    key={b.id}
                    but={b}
                    couleur={h.couleur}
                    tire={dragId === b.id}
                    ouvert={deplie === b.id}
                    surOuvrir={() => {
                      if (glissementArmeRef.current) {
                        glissementArmeRef.current = false;
                        return;
                      }
                      setDeplie(deplie === b.id ? null : b.id);
                    }}
                    refLigne={setRowRef(b.id)}
                    surPrise={(e, poignee) => commencerDrag(e, b.id, h.id, poignee)}
                    surMaj={(patch) => void modifierBut(b.id, patch)}
                    surSupprimer={() => {
                      setDeplie(null);
                      void supprimerBut(b.id);
                    }}
                  />
                ))}

                {items.length === 0 && p90.length === 0 && (
                  <div className="rounded-[16px] px-[12px] py-[12px] text-center text-[13px] text-white/35"
                    style={{ border: "1px dashed rgba(255,255,255,0.12)" }}
                  >
                    Rien pour cet horizon.
                  </div>
                )}
              </div>

              <form
                className="mt-[12px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const texte = nouveau[h.id].trim();
                  if (!texte) return;
                  setNouveau((p) => ({ ...p, [h.id]: "" }));
                  void ajouterBut(texte, h.id).then((ok) => {
                    // Un échec rend le texte : rien de ce qui a été tapé ne se perd.
                    if (!ok) setNouveau((p) => ({ ...p, [h.id]: texte }));
                  });
                }}
              >
                <Champ
                  valeur={nouveau[h.id]}
                  onChange={(v) => setNouveau((p) => ({ ...p, [h.id]: v }))}
                  placeholder={`+ Objectif ${h.nom.toLowerCase()}`}
                  aria={`Ajouter un objectif — ${h.nom.toLowerCase()}`}
                  className="w-full"
                />
              </form>
            </Carte>
          );
        })}
      </div>

      {!pret && buts.length === 0 && objectifs.length === 0 && (
        <Carte>
          <Vide>Lecture des objectifs…</Vide>
        </Carte>
      )}

    </div>
  );
}

/** La progression d'un objectif du Projet 90, de 0 à 100. */
function pctP90(
  def: ObjectifP90,
  suivi: ObjectifVue | undefined,
  tresor: { valeur: number; cible: number; pct: number },
): number {
  if (def.calcule) return tresor.pct;
  return progression(nombreDe(suivi?.valeur ?? ""), def);
}

/** Un des cinq objectifs du Projet 90, en carte compacte qui se déplie. */
function CarteP90({
  def,
  suivi,
  tresor,
  aujourdhui,
  pret,
  ouvert,
  surOuvrir,
  surValeur,
  surJalon,
}: {
  def: ObjectifP90;
  suivi: ObjectifVue | undefined;
  /** Non nul pour la trésorerie seulement : sa valeur est déduite des OP. */
  tresor: { valeur: number; cible: number; pct: number } | null;
  aujourdhui: string;
  pret: boolean;
  ouvert: boolean;
  surOuvrir: () => void;
  surValeur: (v: string) => void;
  surJalon: (texte: string, fait: boolean) => void;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);

  const valeur = tresor ? tresor.valeur : nombreDe(suivi?.valeur ?? "");
  const cible = tresor && tresor.cible > 0 ? tresor.cible : def.cible;
  const pct = tresor ? tresor.pct : progression(valeur, def);
  const euros = def.unite === "€";
  const restant = ecartJours(aujourdhui, def.echeance) ?? 0;

  const coches = new Map((suivi?.jalons ?? []).map((j) => [j.texte, j.fait]));
  const faits = def.jalons.filter((j) => coches.get(j.texte)).length;
  const couleur = pct >= 100 ? "var(--color-ver)" : restant < 0 ? "var(--color-mag)" : def.couleur;

  return (
    <div className="carte-haute px-[13px] py-[12px]">
      <button type="button" onClick={surOuvrir} className="w-full cursor-pointer text-left">
        <div className="flex items-center gap-[8px]">
          <span
            className="nombres flex h-[22px] min-w-[22px] flex-none items-center justify-center rounded-full text-[12px] font-bold"
            style={{
              color: def.rang === 1 ? "#07121d" : def.couleur,
              background: def.rang === 1 ? def.couleur : "rgba(255,255,255,0.06)",
              border: `1px solid ${def.rang === 1 ? def.couleur : "rgba(255,255,255,0.14)"}`,
            }}
            title={def.rang === 1 ? "Objectif n°1 du Projet 90" : `Rang ${def.rang} du Projet 90`}
          >
            {def.rang}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{def.nom}</span>
          <span className="nombres flex-none text-[13px] font-semibold" style={{ color: couleur }}>
            {pct} %
          </span>
        </div>
        <div className="mt-[9px]">
          <Barre pct={pct} couleur={couleur} etiquette={`Progression ${def.nom}`} />
        </div>
        <div className="nombres mt-[6px] flex items-baseline justify-between gap-2 text-[12px] text-white/45">
          <span className="truncate">
            {euros ? <Euros valeur={valeur} /> : formaterNombre(valeur)} /{" "}
            {euros ? <Euros valeur={cible} /> : `${formaterNombre(cible)} ${def.unite}`}
          </span>
          <span className="flex-none">
            {faits}/{def.jalons.length} jalons
          </span>
        </div>
      </button>

      {ouvert && (
        <div className="sas-in mt-[11px] space-y-[9px] border-t pt-[11px]" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="text-[12px] text-white/45">
            {def.kpi} · {def.detail} · {restant >= 0 ? `J-${restant}` : `${-restant} j de retard`}
          </div>

          {tresor ? (
            <div className="text-[13px] text-white/50">Calculée depuis les OP passées en « Payé ».</div>
          ) : saisie === null ? (
            <Bouton onClick={() => setSaisie(suivi?.valeur ?? "")} titre="Mettre à jour le chiffre atteint">
              Mettre à jour {pret ? "" : "…"}
            </Bouton>
          ) : (
            <div className="flex items-center gap-[8px]">
              <Champ
                valeur={saisie}
                onChange={setSaisie}
                autoFocus
                aria={`Valeur atteinte pour ${def.nom}`}
                className="w-[150px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setSaisie(null);
                }}
                onBlur={() => {
                  surValeur(saisie);
                  setSaisie(null);
                }}
              />
              <span className="text-[13px] text-white/45">{def.unite}</span>
            </div>
          )}

          <div className="space-y-[4px]">
            {def.jalons.map((j) => {
              const fait = Boolean(coches.get(j.texte));
              const jours = j.date ? ecartJours(aujourdhui, j.date) : null;
              return (
                <button
                  key={j.texte}
                  type="button"
                  onClick={() => surJalon(j.texte, !fait)}
                  className="flex w-full cursor-pointer items-center gap-[9px] rounded-[12px] px-[4px] py-[6px] text-left transition-colors hover:bg-white/5"
                >
                  <CaseRonde fait={fait} couleur="var(--color-ver)" petite />
                  <span className={`min-w-0 flex-1 text-[13.5px] ${fait ? "line-through opacity-45" : ""}`}>
                    {j.texte}
                  </span>
                  {j.date && (
                    <Puce
                      ton={
                        fait ? "succes" : jours !== null && jours < 0 ? "danger" : jours !== null && jours <= 7 ? "alerte" : "neutre"
                      }
                    >
                      {formaterJour(j.date)}
                    </Puce>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Une case ronde, comme celles de la todo. */
function CaseRonde({ fait, couleur, petite = false }: { fait: boolean; couleur: string; petite?: boolean }) {
  return (
    <span
      className="case-ronde"
      aria-hidden
      style={{
        ...(petite ? { width: 18, height: 18, fontSize: 10 } : {}),
        ...(fait ? { background: couleur, borderColor: couleur } : {}),
      }}
    >
      {fait ? "✓" : ""}
    </span>
  );
}

/** Un objectif de Twaylo : la carte lisible, et ses étapes quand on la déplie. */
function CarteBut({
  but,
  couleur,
  tire,
  ouvert,
  surOuvrir,
  refLigne,
  surPrise,
  surMaj,
  surSupprimer,
}: {
  but: ButVue;
  couleur: string;
  tire: boolean;
  ouvert: boolean;
  surOuvrir: () => void;
  refLigne: (el: HTMLDivElement | null) => void;
  surPrise: (e: React.PointerEvent, depuisPoignee: boolean) => void;
  surMaj: (patch: Partial<Pick<ButVue, "titre" | "horizon" | "statut" | "pct" | "valeur" | "etapes">>) => void;
  surSupprimer: () => void;
}) {
  const [etape, setEtape] = useState("");
  const [confirme, setConfirme] = useState(false);

  /*
   * Cocher une étape recalcule la progression. Tant qu'il y a des étapes,
   * elles font foi : régler la barre à la main pendant que trois étapes sur
   * cinq sont cochées afficherait deux vérités côte à côte.
   */
  const majEtapes = (etapes: ButVue["etapes"]) => {
    if (etapes.length === 0) {
      surMaj({ etapes, valeur: `${but.pct} %` });
      return;
    }
    const faites = etapes.filter((e) => e.fait).length;
    surMaj({ etapes, pct: Math.round((faites / etapes.length) * 100), valeur: `${faites}/${etapes.length}` });
  };

  const atteint = but.pct >= 100;

  return (
    <div
      ref={refLigne}
      className="group relative flex items-stretch gap-[4px]"
      style={tire ? { visibility: "hidden" } : undefined}
    >
      {/* La poignée, comme dans la todo : `touch-action: none`, et c'est d'elle
          que part un glisser vers un autre horizon. */}
      <button
        type="button"
        aria-label={`Déplacer ${but.titre}`}
        title="Glisser vers un autre horizon"
        onPointerDown={(e) => {
          e.stopPropagation();
          surPrise(e, true);
        }}
        className="poignee-tache flex flex-none items-center justify-center text-[14px] leading-none text-white/25 transition-colors hover:text-white/60"
      >
        ⠿
      </button>

      <div
        className="carte-haute min-w-0 flex-1 px-[13px] py-[12px]"
        style={atteint ? { borderColor: couleur } : undefined}
      >
        <button type="button" onClick={surOuvrir} className="w-full cursor-pointer text-left">
          <div className="flex items-baseline justify-between gap-[8px]">
            <span className="min-w-0 text-[14px] font-medium leading-[1.3]">{but.titre}</span>
            <span className="nombres flex-none text-[13px] font-semibold" style={{ color: atteint ? couleur : "rgba(255,255,255,0.6)" }}>
              {but.valeur || `${but.pct} %`}
            </span>
          </div>
          <div className="mt-[9px]">
            <Barre pct={but.pct} couleur={couleur} etiquette={`Progression ${but.titre}`} />
          </div>
        </button>

        {ouvert && (
          <div className="sas-in mt-[11px] space-y-[10px] border-t pt-[11px]" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            {but.etapes.length === 0 && (
              <div>
                <div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">
                  Progression
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={but.pct}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    surMaj({ pct, valeur: `${pct} %` });
                  }}
                  aria-label={`Progression de ${but.titre}`}
                  className="w-full cursor-pointer"
                  style={{ accentColor: couleur }}
                />
              </div>
            )}

            {but.etapes.length > 0 && (
              <div className="space-y-[4px]">
                {but.etapes.map((e, i) => (
                  <div key={i} className="flex items-center gap-[9px]">
                    <button
                      type="button"
                      onClick={() => majEtapes(but.etapes.map((x, j) => (j === i ? { ...x, fait: !x.fait } : x)))}
                      aria-pressed={e.fait}
                      aria-label={`${e.fait ? "Décocher" : "Cocher"} ${e.texte}`}
                      className="flex cursor-pointer items-center"
                    >
                      <CaseRonde fait={e.fait} couleur={couleur} petite />
                    </button>
                    <span
                      className="min-w-0 flex-1 text-[13.5px]"
                      style={{
                        color: e.fait ? "rgba(255,255,255,0.4)" : "var(--color-fg)",
                        textDecoration: e.fait ? "line-through" : "none",
                      }}
                    >
                      {e.texte}
                    </span>
                    <button
                      type="button"
                      onClick={() => majEtapes(but.etapes.filter((_, j) => j !== i))}
                      aria-label={`Retirer ${e.texte}`}
                      className="flex-none cursor-pointer px-[4px] text-[15px] font-bold text-white/30 hover:text-[color:var(--color-mag-soft)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                const texte = etape.trim();
                // Même plafond que le serveur : au-delà, il tronquait en silence.
                if (!texte || but.etapes.length >= MAX_ETAPES) return;
                majEtapes([...but.etapes, { texte, fait: false }]);
                setEtape("");
              }}
            >
              <Champ
                valeur={etape}
                onChange={setEtape}
                placeholder={but.etapes.length >= MAX_ETAPES ? `${MAX_ETAPES} étapes maximum` : "+ Étape"}
                aria={`Ajouter une étape à ${but.titre}`}
                className="w-full"
              />
            </form>

            {/* Changer d'horizon sans glisser : c'est le geste du téléphone,
                où les colonnes ne tiennent pas toutes à l'écran. */}
            <div className="flex flex-wrap gap-[6px]">
              {HORIZONS.filter((h) => h.id !== but.horizon).map((h) => (
                <Bouton key={h.id} onClick={() => surMaj({ horizon: h.id })}>
                  → {h.nom}
                </Bouton>
              ))}
            </div>

            <div className="flex flex-wrap gap-[6px]">
              <Bouton ton="succes" onClick={() => surMaj({ statut: "atteint" })}>
                ✓ Atteint
              </Bouton>
              <Bouton onClick={() => surMaj({ statut: "abandonne" })}>Abandonner</Bouton>
              {confirme ? (
                <Bouton ton="danger" onClick={surSupprimer}>
                  Confirmer la suppression
                </Bouton>
              ) : (
                <Bouton ton="danger" onClick={() => setConfirme(true)}>
                  Supprimer
                </Bouton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
