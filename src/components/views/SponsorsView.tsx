"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CHAINES,
  ETAPES_OP,
  SEUIL_MONTANT_TEXTE,
  SEUIL_RETARD,
  alertesOp,
  bilanEncaissement,
  commissionOp,
  netOp,
  nomChaine,
  type Alerte,
  type EtapeOp,
  type IdChaine,
  type Op,
} from "@/lib/p90";
import { useCockpit } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import { Bouton, Carte, Champ, Euros, Puce, Surtitre, Vide, formaterEuros } from "@/components/p90/ui";

/**
 * LES SPONSORS — le pipeline des OP, une colonne par étape.
 *
 * Prospect, Négo, Signé, Livré, Facturé, Payé : six colonnes à l'horizontale,
 * et une OP passe d'une étape à l'autre en la glissant. C'est la vue d'avant
 * que Twaylo a redemandée (« remets comme avant, vue horizontale, où l'on peut
 * déplacer selon l'état ») — une liste verticale obligeait à ouvrir chaque OP
 * pour changer son étape.
 *
 * Glisser : à la souris d'emblée, au doigt par un appui long — un simple
 * glissement du doigt fait défiler, comme partout ailleurs. Un appui court
 * ouvre la fiche de l'OP.
 *
 * L'argent qui est dehors reste en tête : le total à encaisser et ce qui est en
 * retard de plus de 30 jours. LE NET N'EST JAMAIS SAISI : Expandia prend 30 %,
 * sur Twaylo seulement et seulement quand l'OP passe par elle — le calcul vit
 * dans le domaine.
 */

/** L'alerte en version courte, pour une carte de 220 px de large. */
function alerteCourte(a: Alerte): string {
  const retard = a.texte.match(/retard de (\d+) jours/);
  if (retard) return `${retard[1]} j de retard`;
  if (a.texte.startsWith("Date de paiement")) return "Date de paiement ?";
  return a.texte;
}

export function SponsorsView() {
  const { aujourdhui, ops, pret, ajouterOp, modifierOp, supprimerOp, verrouSync } = useCockpit();
  const [nouvelle, setNouvelle] = useState("");
  /** L'OP ouverte dans la fiche. */
  const [fiche, setFiche] = useState<string | null>(null);

  const bilan = useMemo(() => bilanEncaissement(ops, aujourdhui), [ops, aujourdhui]);
  const total = useMemo(() => ops.reduce((s, o) => s + netOp(o), 0), [ops]);

  /*
   * LE GLISSER-DÉPOSER, avec le moteur de la todo. Seul le CHANGEMENT
   * D'ÉTAPE s'enregistre : l'ordre à l'intérieur d'une colonne n'a pas de
   * sens à garder pour des OP.
   */
  const etapeParId = useMemo(() => new Map(ops.map((o) => [o.id, o.etape])), [ops]);
  const { dragId, ordreVisuel, zoneCourante, commencerDrag, setRowRef, setZoneRef, grilleRef, glissementArmeRef } =
    useGlisser<EtapeOp>({
      ordre: ops.map((o) => o.id),
      zoneDe: (id) => etapeParId.get(id) ?? "prospect",
      onDepot: (_ids, changement) => {
        if (changement) void modifierOp(changement.id, { etape: changement.zone });
      },
      zoneParDefaut: "prospect",
    });

  useEffect(() => {
    verrouSync("glisser", dragId !== null);
    return () => verrouSync("glisser", false);
  }, [dragId, verrouSync]);

  const parId = useMemo(() => new Map(ops.map((o) => [o.id, o])), [ops]);
  const affichees: Op[] = dragId
    ? ordreVisuel.map((id) => parId.get(id)).filter((o): o is Op => Boolean(o))
    : ops;
  const etapeAffichee = (o: Op): EtapeOp => (o.id === dragId ? zoneCourante : o.etape);
  const ouverte = fiche ? parId.get(fiche) : undefined;

  return (
    <div className="entree-vue space-y-[14px]">
      {/* ---------- En tête : l'argent dehors, et l'ajout ---------- */}
      <Carte survol={false}>
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[10px]">
          <div>
            <div className="text-[12.5px] text-white/45">À encaisser · {bilan.lignes.length} OP livrées ou facturées</div>
            <Euros valeur={bilan.total} className="text-[24px] font-semibold tracking-[-0.01em]" />
          </div>
          {bilan.enRetard > 0 && (
            <div role="alert">
              <div className="text-[12.5px] text-white/45">En retard de plus de {SEUIL_RETARD} jours</div>
              <Euros valeur={bilan.enRetard} className="text-[24px] font-semibold" ton="var(--color-mag-soft)" />
            </div>
          )}
          <div>
            <div className="text-[12.5px] text-white/45">Tout le pipeline · {ops.length} OP</div>
            <span className="nombres text-[24px] font-semibold text-white/70">{formaterEuros(total)}</span>
          </div>
          <span className="flex-1" />
          <form
            className="flex w-full items-center gap-[7px] sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              const nom = nouvelle.trim();
              if (!nom) return;
              setNouvelle("");
              void ajouterOp(nom);
            }}
          >
            <Champ
              valeur={nouvelle}
              onChange={setNouvelle}
              placeholder="Nouvelle marque…"
              className="min-w-0 flex-1 sm:w-[220px]"
              aria="Nouvelle OP"
            />
            <Bouton type="submit" ton="plein" disabled={!nouvelle.trim()}>
              Ajouter
            </Bouton>
          </form>
        </div>
      </Carte>

      {!pret && ops.length === 0 && (
        <Carte>
          <Vide>Lecture des OP…</Vide>
        </Carte>
      )}

      {/* ---------- Les six étapes, à l'horizontale ---------- */}
      <div ref={grilleRef} className="colonnes-etapes">
        {ETAPES_OP.map((e) => {
          const items = affichees.filter((o) => etapeAffichee(o) === e.id);
          const somme = items.reduce((s, o) => s + netOp(o), 0);
          const vise = Boolean(dragId) && zoneCourante === e.id;
          return (
            <Carte
              key={e.id}
              survol={false}
              innerRef={setZoneRef(e.id)}
              zone={e.id}
              className={`zone-depot ${vise ? "zone-visee" : ""}`}
              style={{ padding: 12 }}
            >
              <div className="flex items-baseline justify-between gap-2 px-[2px]">
                <Surtitre couleur={e.couleur}>{e.nom}</Surtitre>
                <span className="nombres text-[13px] text-white/45">{items.length}</span>
              </div>
              <div className="nombres mt-[1px] px-[2px] text-[12.5px] text-white/45">
                {somme > 0 ? formaterEuros(somme) : "—"}
              </div>

              <div className="mt-[10px] flex flex-col gap-[7px]">
                {items.map((o) => {
                  const alertes = alertesOp(o, aujourdhui);
                  return (
                    <div
                      key={o.id}
                      ref={setRowRef(o.id)}
                      // Toute la carte est une prise : six pixels à la souris,
                      // un appui long au doigt. PAS de `touch-action: none` :
                      // c'est ce qui rendait l'ancien Kanban impossible à
                      // faire défiler au téléphone.
                      onPointerDown={(ev) => commencerDrag(ev, o.id, o.etape, false)}
                      className="carte-haute cursor-grab select-none"
                      style={dragId === o.id ? { opacity: 0 } : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (glissementArmeRef.current) {
                            glissementArmeRef.current = false;
                            return;
                          }
                          setFiche(o.id);
                        }}
                        className="block w-full cursor-pointer px-[11px] py-[9px] text-left"
                      >
                        <div className="flex items-baseline justify-between gap-[8px]">
                          <span className="min-w-0 text-[13.5px] font-medium leading-[1.3]">{o.marque}</span>
                          <Euros valeur={netOp(o)} className="flex-none text-[13px] font-semibold" />
                        </div>
                        {(o.meta.chaine || o.meta.expandia || alertes.length > 0) && (
                          <div className="mt-[6px] flex flex-wrap gap-[4px]">
                            {o.meta.chaine && <Puce>{nomChaine(o.meta.chaine)}</Puce>}
                            {o.meta.expandia && <Puce titre="Commission Expandia 30 %">Expandia</Puce>}
                            {alertes.map((a) => (
                              <Puce key={a.texte} ton={a.ton} titre={a.texte}>
                                {alerteCourte(a)}
                              </Puce>
                            ))}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div
                    className="rounded-[12px] px-[10px] py-[14px] text-center text-[12.5px] text-white/30"
                    style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
                  >
                    Glisse une OP ici
                  </div>
                )}
              </div>
            </Carte>
          );
        })}
      </div>

      {ouverte && (
        <FicheOp
          key={ouverte.id}
          op={ouverte}
          aujourdhui={aujourdhui}
          surFermer={() => setFiche(null)}
          surModifier={(patch) => void modifierOp(ouverte.id, patch)}
          surSupprimer={() => {
            setFiche(null);
            void supprimerOp(ouverte.id);
          }}
        />
      )}
    </div>
  );
}

/**
 * LA FICHE D'UNE OP — une feuille de verre, par-dessus le tableau.
 *
 * Une colonne de 220 px ne peut pas porter un éditeur : la fiche s'ouvre au
 * centre sur un grand écran, en bas de l'écran sur un téléphone — la feuille
 * des applications d'Apple. Échap, la croix ou un appui à côté la referment.
 */
function FicheOp({
  op,
  aujourdhui,
  surFermer,
  surModifier,
  surSupprimer,
}: {
  op: Op;
  aujourdhui: string;
  surFermer: () => void;
  surModifier: (patch: Parameters<ReturnType<typeof useCockpit>["modifierOp"]>[1]) => void;
  surSupprimer: () => void;
}) {
  const [brut, setBrut] = useState(String(op.brut || ""));
  const [enSaisie, setEnSaisie] = useState(false);
  const [confirme, setConfirme] = useState(false);

  /*
   * Le montant suit la base TANT QU'ON N'EST PAS EN TRAIN DE LE TAPER : changé
   * sur l'autre appareil, il était sinon réécrit avec l'ancien chiffre au
   * premier passage dans le champ. Recalé pendant le rendu, comme le
   * recommande React.
   */
  const [brutConnu, setBrutConnu] = useState(op.brut);
  if (op.brut !== brutConnu && !enSaisie) {
    setBrutConnu(op.brut);
    setBrut(String(op.brut || ""));
  }

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") surFermer();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [surFermer]);

  const alertes = alertesOp(op, aujourdhui);
  const commission = commissionOp(op);

  /*
   * DANS UN PORTAIL, directement sous `<body>` — et c'était un vrai défaut.
   *
   * Rendue à l'intérieur de la vue, la feuille héritait d'un ancêtre animé
   * (l'entrée de la vue anime une transformation, et un élément ainsi animé
   * devient le repère des éléments `fixed` qu'il contient). Elle se plaçait
   * donc par rapport à la PAGE et non à l'écran : au téléphone elle flottait
   * au milieu au lieu de se poser en bas, et sur une longue page elle pouvait
   * s'ouvrir hors de vue.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`OP ${op.marque}`}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={surFermer}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(0,0,0,0.42)", WebkitBackdropFilter: "blur(6px)", backdropFilter: "blur(6px)" }}
      />
      <div
        className="carte sas-in relative w-full space-y-[14px] rounded-b-none p-[18px] sm:max-w-[480px] sm:rounded-b-[22px]"
        style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))", background: "rgba(28,29,36,0.82)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold leading-[1.25]">{op.marque}</div>
            <div className="nombres mt-[2px] text-[13px] text-white/50">
              {commission > 0 ? (
                <>
                  <Euros valeur={op.brut} /> brut − {formaterEuros(commission)} Expandia ={" "}
                  <Euros valeur={netOp(op)} className="text-white/80" /> net
                </>
              ) : (
                <>
                  <Euros valeur={netOp(op)} className="text-white/80" /> net
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={surFermer}
            aria-label="Fermer la fiche"
            className="capsule flex-none"
            style={{ width: 32, minHeight: 32, padding: 0 }}
          >
            ✕
          </button>
        </div>

        {alertes.length > 0 && (
          <div className="flex flex-wrap gap-[5px]">
            {alertes.map((a) => (
              <Puce key={a.texte} ton={a.ton}>
                {a.texte}
              </Puce>
            ))}
          </div>
        )}

        <Rangee titre="Étape">
          {ETAPES_OP.map((e) => (
            <Puce
              key={e.id}
              actif={op.etape === e.id}
              couleur={e.couleur}
              onClick={() => surModifier({ etape: e.id as EtapeOp })}
            >
              {e.nom}
            </Puce>
          ))}
        </Rangee>

        <Rangee titre="Chaîne">
          {CHAINES.map((c) => (
            <Puce
              key={c.id}
              actif={op.meta.chaine === c.id}
              onClick={() => surModifier({ meta: { ...op.meta, chaine: c.id as IdChaine } })}
            >
              {c.nom}
            </Puce>
          ))}
          <Puce
            actif={op.meta.expandia}
            ton="alerte"
            titre="30 % de commission, sur la chaîne Twaylo uniquement"
            onClick={() => surModifier({ meta: { ...op.meta, expandia: !op.meta.expandia } })}
          >
            via Expandia
          </Puce>
          <Puce
            actif={op.meta.litige}
            ton="danger"
            onClick={() => surModifier({ meta: { ...op.meta, litige: !op.meta.litige } })}
          >
            litige
          </Puce>
        </Rangee>

        <Rangee titre="Brut">
          <div onFocus={() => setEnSaisie(true)}>
            <Champ
              type="number"
              valeur={brut}
              onChange={setBrut}
              aria="Montant brut"
              className="w-[140px]"
              onBlur={() => {
                setEnSaisie(false);
                const v = Number(brut);
                if (Number.isFinite(v) && v !== op.brut) surModifier({ brut: Math.max(0, v) });
              }}
            />
          </div>
          <span className="text-[13px] text-white/45">€</span>
        </Rangee>

        <Rangee titre="Diffusion">
          <Champ
            type="date"
            valeur={op.meta.diffusion ?? ""}
            onChange={(v) => surModifier({ meta: { ...op.meta, diffusion: v || undefined } })}
            aria="Date de diffusion"
            className="w-[170px]"
          />
        </Rangee>

        <Rangee titre="Paiement">
          <Champ
            type="date"
            valeur={op.meta.paiement ?? ""}
            onChange={(v) => surModifier({ meta: { ...op.meta, paiement: v || undefined } })}
            aria="Date de paiement attendue"
            className="w-[170px]"
          />
        </Rangee>

        <div className="flex flex-wrap items-center justify-between gap-[8px] pt-[2px]">
          <span className="max-w-[260px] text-[12px] leading-[1.4] text-white/40">
            Alerte si l&apos;OP est sous {SEUIL_MONTANT_TEXTE} une fois engagée, ou si son paiement a plus de{" "}
            {SEUIL_RETARD} jours de retard.
          </span>
          {/* En deux temps : c'est un effacement DÉFINITIF. */}
          {confirme ? (
            <span className="flex gap-[6px]">
              <Bouton ton="danger" onClick={surSupprimer}>
                Confirmer la suppression
              </Bouton>
              <Bouton onClick={() => setConfirme(false)}>Annuler</Bouton>
            </span>
          ) : (
            <Bouton ton="danger" onClick={() => setConfirme(true)}>
              Supprimer
            </Bouton>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Une rangée de la fiche : l'intitulé à gauche, les réglages à droite. */
function Rangee({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <span className="w-[74px] flex-none text-[12.5px] text-white/45">{titre}</span>
      {children}
    </div>
  );
}
