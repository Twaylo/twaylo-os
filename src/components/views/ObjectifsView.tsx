"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HORIZONS,
  OBJECTIFS_P90,
  compteARebours,
  ecartJours,
  progression,
  tresorerie,
  type Horizon,
  type ObjectifP90,
} from "@/lib/p90";
import { useCockpit, type ButVue, type ObjectifVue } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import {
  Anneau,
  Bouton,
  Carte,
  Champ,
  Coche,
  Depliant,
  EnTeteVue,
  Euros,
  Feuille,
  Puce,
  Surtitre,
  Vide,
  formaterJour,
  formaterNombre,
} from "@/components/p90/ui";

/**
 * LES OBJECTIFS — deux registres, et plus une seule forme répétée.
 *
 * Twaylo : « variations à faire aussi, là ça fait très très bloc ». Tout
 * était une carte dans une carte : quatre colonnes de cartes identiques, un
 * titre, un pourcentage, une barre — dix fois. La page a maintenant deux
 * registres qui ne se ressemblent pas :
 *
 *   — EN TÊTE, les cinq objectifs du Projet 90, en widgets : un grand anneau
 *     de progression (celui de l'app Forme d'Apple), le chiffre, la cible.
 *     C'est le tableau de bord du trimestre, qu'on lit d'un coup d'œil.
 *   — DESSOUS, les quatre horizons de Twaylo (semaine, mois, trimestre,
 *     année), à l'horizontale comme il l'a demandé, en colonnes légères : les
 *     objectifs y sont des RANGÉES de liste, un petit anneau devant, séparées
 *     par un filet. Une rangée se déplie pour ses étapes.
 *
 * Les objectifs de Twaylo se règlent à la main : un calcul automatique
 * supposerait que l'OS sache mesurer « 100k abonnés » ou « tournage en
 * Pologne ». Dès qu'il y a des étapes, ce sont elles qui commandent.
 */

/** Le serveur tronque au-delà : on l'annonce au lieu de le subir. */
const MAX_ETAPES = 12;

/** Le nombre contenu dans une saisie libre (« 412 000 », « 412000 »). */
function nombreDe(valeur: string): number {
  const nu = valeur.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(nu);
  return Number.isFinite(n) ? n : 0;
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
  /** La rangée dépliée : une seule à la fois, la page reste lisible. */
  const [deplie, setDeplie] = useState<string | null>(null);
  /** L'objectif du Projet 90 ouvert dans sa feuille. */
  const [ficheP90, setFicheP90] = useState<string | null>(null);
  const [archiveOuverte, setArchiveOuverte] = useState(false);

  const tresor = useMemo(() => tresorerie(ops), [ops]);
  const suiviP90 = useMemo(() => new Map(objectifs.map((o) => [o.cle, o])), [objectifs]);
  const r = compteARebours(aujourdhui);

  const actifs = useMemo(() => buts.filter((b) => b.statut === "en_cours"), [buts]);
  const archives = useMemo(() => buts.filter((b) => b.statut !== "en_cours"), [buts]);

  /*
   * GLISSER UN OBJECTIF D'UN HORIZON À L'AUTRE — ce qui devait tenir dans la
   * semaine glisse au mois. Même moteur que la todo.
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

  const moyenne = actifs.length ? Math.round(actifs.reduce((n, b) => n + b.pct, 0) / actifs.length) : null;
  const defOuverte = OBJECTIFS_P90.find((d) => d.id === ficheP90);

  return (
    <div className="entree-vue space-y-[18px]">
      <EnTeteVue
        titre="Objectifs"
        sousTitre={
          <>
            <span className="nombres">{actifs.length}</span> objectif{actifs.length > 1 ? "s" : ""} à toi
            {moyenne !== null && (
              <>
                {" "}· <span className="nombres">{moyenne} %</span> en moyenne
              </>
            )}
          </>
        }
      >
        {archives.length > 0 && (
          <Bouton onClick={() => setArchiveOuverte((v) => !v)} titre="Les objectifs atteints ou abandonnés">
            Archive · {archives.length} {archiveOuverte ? "▾" : "▸"}
          </Bouton>
        )}
      </EnTeteVue>

      {/* ---------- L'archive, qui se déplie ---------- */}
      <Depliant ouvert={archiveOuverte && archives.length > 0}>
        <Carte survol={false} className="colonne-legere">
          <Surtitre>Archive</Surtitre>
          <div className="mt-[8px]">
            {archives.map((b) => {
              const couleur = HORIZONS.find((h) => h.id === b.horizon)?.couleur ?? "rgba(255,255,255,0.3)";
              const atteint = b.statut === "atteint";
              return (
                <div key={b.id} className="rangee-but flex items-center gap-[10px] py-[8px]">
                  <span className="h-[8px] w-[8px] flex-none rounded-full" style={{ background: couleur }} />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-white/60">{b.titre}</span>
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
      </Depliant>

      {/* ---------- Le Projet 90, en widgets ---------- */}
      <section aria-label="Projet 90" className="space-y-[10px]">
        <div className="flex items-baseline justify-between px-[2px]">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Projet 90</h2>
          <span className="nombres text-[13px] text-white/45">
            Jour {r.ecoules} sur {r.total}
          </span>
        </div>
        <div className="rangee-widgets">
          {OBJECTIFS_P90.map((def) => {
            const suivi = suiviP90.get(def.id);
            const pct = pctP90(def, suivi, tresor);
            const valeur = def.calcule ? tresor.valeur : nombreDe(suivi?.valeur ?? "");
            const cible = def.calcule && tresor.cible > 0 ? tresor.cible : def.cible;
            const euros = def.unite === "€";
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => setFicheP90(def.id)}
                className="carte carte-hover flex cursor-pointer flex-col items-start gap-[10px] p-[14px] text-left"
                aria-label={`${def.nom} : ${pct} %`}
              >
                <Anneau pct={pct} taille={56} epaisseur={6} couleur={def.couleur} etiquette={`Progression ${def.nom}`}>
                  <span className="nombres text-[13px] font-semibold">{pct}%</span>
                </Anneau>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{def.nom}</div>
                  <div className="nombres mt-[2px] truncate text-[12px] text-white/45">
                    {euros ? <Euros valeur={valeur} /> : formaterNombre(valeur)} /{" "}
                    {euros ? <Euros valeur={cible} /> : formaterNombre(cible)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Les quatre horizons de Twaylo ---------- */}
      <section aria-label="Tes objectifs" className="space-y-[10px]">
        <h2 className="px-[2px] text-[17px] font-semibold tracking-[-0.01em]">Tes objectifs</h2>
        <div ref={grilleRef} className="colonnes-horizontales">
          {HORIZONS.map((h) => {
            const items = affiches.filter((b) => b.horizon === h.id);
            const moyenneH = items.length ? Math.round(items.reduce((n, b) => n + b.pct, 0) / items.length) : null;
            const vise = Boolean(dragId) && zoneCourante === h.id;

            return (
              <Carte
                key={h.id}
                survol={false}
                innerRef={setZoneRef(h.id)}
                zone={h.id}
                className={`colonne-legere zone-depot ${vise ? "zone-visee" : ""}`}
                style={{ padding: 14 }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Surtitre couleur={h.couleur}>{h.nom}</Surtitre>
                  {moyenneH !== null && <span className="nombres text-[13px] text-white/45">{moyenneH} %</span>}
                </div>

                <div className="mt-[8px]">
                  {items.map((b) => (
                    <RangeeBut
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
                  {items.length === 0 && (
                    <div className="py-[10px] text-[13px] text-white/30">Rien pour cet horizon.</div>
                  )}
                </div>

                <form
                  className="mt-[8px]"
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
      </section>

      {!pret && buts.length === 0 && objectifs.length === 0 && (
        <Carte>
          <Vide>Lecture des objectifs…</Vide>
        </Carte>
      )}

      {defOuverte && (
        <FicheP90
          key={defOuverte.id}
          def={defOuverte}
          suivi={suiviP90.get(defOuverte.id)}
          tresor={defOuverte.calcule ? tresor : null}
          aujourdhui={aujourdhui}
          surFermer={() => setFicheP90(null)}
          surValeur={(v) => void modifierObjectif(defOuverte.id, { valeur: v })}
          surJalon={(texte, fait) => {
            const actuels =
              suiviP90.get(defOuverte.id)?.jalons ?? defOuverte.jalons.map((j) => ({ texte: j.texte, fait: false }));
            const connus = new Set(actuels.map((j) => j.texte));
            const complets = [
              ...actuels,
              ...defOuverte.jalons.filter((j) => !connus.has(j.texte)).map((j) => ({ texte: j.texte, fait: false })),
            ];
            void modifierObjectif(defOuverte.id, {
              jalons: complets.map((j) => (j.texte === texte ? { ...j, fait } : j)),
            });
          }}
        />
      )}
    </div>
  );
}

/** Une case ronde, comme celles de la todo, avec la coche dessinée. */
function CaseRonde({ fait, couleur }: { fait: boolean; couleur: string }) {
  return (
    <span
      className="case-ronde"
      aria-hidden
      style={{ width: 18, height: 18, ...(fait ? { background: couleur, borderColor: couleur } : {}) }}
    >
      {fait && <Coche taille={10} />}
    </span>
  );
}

/** Un objectif du Projet 90, dans sa feuille : le chiffre à jour et les jalons. */
function FicheP90({
  def,
  suivi,
  tresor,
  aujourdhui,
  surFermer,
  surValeur,
  surJalon,
}: {
  def: ObjectifP90;
  suivi: ObjectifVue | undefined;
  /** Non nul pour la trésorerie seulement : sa valeur est déduite des OP. */
  tresor: { valeur: number; cible: number; pct: number } | null;
  aujourdhui: string;
  surFermer: () => void;
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

  return (
    <Feuille
      etiquette={`Objectif ${def.nom}`}
      titre={def.nom}
      sousTitre={`${def.kpi} · ${restant >= 0 ? `J-${restant}` : `${-restant} j de retard`}`}
      surFermer={surFermer}
    >
      {() => (
        <>
          <div className="flex items-center gap-[16px]">
            <Anneau pct={pct} taille={78} epaisseur={8} couleur={def.couleur} etiquette={`Progression ${def.nom}`}>
              <span className="nombres text-[17px] font-semibold">{pct}%</span>
            </Anneau>
            <div className="min-w-0">
              <div className="nombres text-[20px] font-semibold tracking-[-0.01em]">
                {euros ? <Euros valeur={valeur} /> : formaterNombre(valeur)}
              </div>
              <div className="nombres text-[13px] text-white/50">
                sur {euros ? <Euros valeur={cible} /> : `${formaterNombre(cible)} ${def.unite}`}
                {def.depart > 0 && ` · départ ${formaterNombre(def.depart)}`}
              </div>
              <div className="mt-[2px] text-[12.5px] text-white/40">{def.detail}</div>
            </div>
          </div>

          {tresor ? (
            <div className="text-[13px] text-white/50">Calculée depuis les OP passées en « Payé ».</div>
          ) : saisie === null ? (
            <Bouton onClick={() => setSaisie(suivi?.valeur ?? "")} titre="Mettre à jour le chiffre atteint">
              Mettre à jour
            </Bouton>
          ) : (
            <div className="flex items-center gap-[8px]">
              <Champ
                valeur={saisie}
                onChange={setSaisie}
                autoFocus
                aria={`Valeur atteinte pour ${def.nom}`}
                className="w-[160px]"
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

          <div>
            <div className="mb-[4px] text-[13px] font-semibold text-white/70">Jalons</div>
            {def.jalons.map((j) => {
              const fait = Boolean(coches.get(j.texte));
              const jours = j.date ? ecartJours(aujourdhui, j.date) : null;
              return (
                <button
                  key={j.texte}
                  type="button"
                  onClick={() => surJalon(j.texte, !fait)}
                  className="rangee-but flex w-full cursor-pointer items-center gap-[10px] py-[8px] text-left"
                >
                  <CaseRonde fait={fait} couleur="var(--color-ver)" />
                  <span className={`min-w-0 flex-1 text-[14px] ${fait ? "text-white/40 line-through" : ""}`}>
                    {j.texte}
                  </span>
                  {j.date && (
                    <Puce
                      ton={
                        fait
                          ? "succes"
                          : jours !== null && jours < 0
                            ? "danger"
                            : jours !== null && jours <= 7
                              ? "alerte"
                              : "neutre"
                      }
                    >
                      {formaterJour(j.date)}
                    </Puce>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </Feuille>
  );
}

/** Un objectif de Twaylo : une rangée de liste, qui se déplie pour ses étapes. */
function RangeeBut({
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
   * elles font foi : régler l'anneau à la main pendant que trois étapes sur
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

  return (
    <div ref={refLigne} className="rangee-but" style={tire ? { visibility: "hidden" } : undefined}>
      <div className="group flex items-start gap-[4px]">
        {/* La poignée : `touch-action: none`, c'est d'elle que part un glisser
            vers un autre horizon. */}
        <button
          type="button"
          aria-label={`Déplacer ${but.titre}`}
          title="Glisser vers un autre horizon"
          onPointerDown={(e) => {
            e.stopPropagation();
            surPrise(e, true);
          }}
          className="poignee-tache flex flex-none items-center justify-center self-stretch text-[13px] leading-none text-white/25 transition-colors hover:text-white/60"
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={surOuvrir}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-[10px] rounded-[10px] px-[4px] py-[9px] text-left transition-colors hover:bg-white/[0.04]"
          aria-expanded={ouvert}
        >
          <Anneau pct={but.pct} taille={22} epaisseur={3} couleur={couleur} etiquette={`Progression ${but.titre}`} />
          <span className="min-w-0 flex-1 text-[14px] leading-[1.35]">{but.titre}</span>
          <span
            className="nombres flex-none pt-[1px] text-[12.5px]"
            style={{ color: but.pct >= 100 ? couleur : "rgba(255,255,255,0.45)" }}
          >
            {but.valeur || `${but.pct} %`}
          </span>
        </button>
      </div>

      <Depliant ouvert={ouvert}>
        <div className="space-y-[10px] pb-[12px] pl-[30px] pr-[4px] pt-[2px]">
          {but.etapes.length === 0 && (
            <div>
              <div className="mb-[4px] text-[12px] text-white/40">Progression · {but.pct} %</div>
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
            <div>
              {but.etapes.map((e, i) => (
                <div key={i} className="flex items-center gap-[9px] py-[4px]">
                  <button
                    type="button"
                    onClick={() => majEtapes(but.etapes.map((x, j) => (j === i ? { ...x, fait: !x.fait } : x)))}
                    aria-pressed={e.fait}
                    aria-label={`${e.fait ? "Décocher" : "Cocher"} ${e.texte}`}
                    className="flex cursor-pointer items-center"
                  >
                    <CaseRonde fait={e.fait} couleur={couleur} />
                  </button>
                  <span className={`min-w-0 flex-1 text-[13.5px] ${e.fait ? "text-white/40 line-through" : ""}`}>
                    {e.texte}
                  </span>
                  <button
                    type="button"
                    onClick={() => majEtapes(but.etapes.filter((_, j) => j !== i))}
                    aria-label={`Retirer ${e.texte}`}
                    className="flex-none cursor-pointer px-[4px] text-[15px] text-white/30 hover:text-[color:var(--color-mag-soft)]"
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

          {/* Changer d'horizon sans glisser : le geste du téléphone, où les
              colonnes ne tiennent pas toutes à l'écran. */}
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
      </Depliant>
    </div>
  );
}
