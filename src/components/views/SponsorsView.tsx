"use client";

import { useMemo, useState } from "react";
import {
  CHAINES,
  ETAPES_OP,
  SEUIL_MONTANT_TEXTE,
  SEUIL_RETARD,
  alertesOp,
  bilanEncaissement,
  commissionOp,
  joursDeRetard,
  netOp,
  nomChaine,
  paiementAInscrire,
  type EtapeOp,
  type IdChaine,
  type Op,
} from "@/lib/p90";
import { useCockpit } from "@/lib/p90-context";
import { Bouton, Carte, Champ, Euros, Puce, Surtitre, Vide, formaterEuros, formaterJour } from "@/components/p90/ui";

/**
 * LES SPONSORS — le pipeline des OP, et surtout l'argent qui est dehors.
 *
 * Deux écrans en un. En haut « À encaisser » : ce qui est livré, facturé, pas
 * payé, total net, et le retard. C'est la partie qui compte — une OP oubliée
 * trois mois est une OP qu'on ne réclame plus.
 *
 * En dessous, le pipeline complet, de Prospect à Payé.
 *
 * LE NET N'EST JAMAIS SAISI. Expandia prend 30 %, sur la chaîne Twaylo
 * uniquement et seulement quand l'OP passe par elle : le calcul vit dans le
 * domaine, pas dans une case que Twaylo remplirait à la main — un chiffre
 * recopié finit toujours par mentir.
 */

export function SponsorsView() {
  const { aujourdhui, ops, pret, ajouterOp, modifierOp, supprimerOp } = useCockpit();
  const [nouvelle, setNouvelle] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);

  const bilan = useMemo(() => bilanEncaissement(ops, aujourdhui), [ops, aujourdhui]);
  const total = useMemo(() => ops.reduce((s, o) => s + netOp(o), 0), [ops]);

  return (
    <div className="entree-vue space-y-[13px]">
      {/* ---------- À encaisser ---------- */}
      <Carte accent="var(--color-ver)">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Surtitre couleur="var(--color-ver-soft)">À encaisser</Surtitre>
          <div className="flex items-baseline gap-[11px]">
            <span className="text-[11px] text-white/40">
              {bilan.lignes.length} OP · net
            </span>
            <Euros valeur={bilan.total} className="text-[22px] font-semibold" />
          </div>
        </div>

        {bilan.enRetard > 0 && (
          <div
            role="alert"
            className="mt-[9px] rounded-[8px] px-[9px] py-[7px] text-[12px] font-medium"
            style={{ background: "rgba(255,61,139,0.12)", border: "1px solid rgba(255,61,139,0.35)" }}
          >
            <Euros valeur={bilan.enRetard} /> en retard de plus de {SEUIL_RETARD} jours.
          </div>
        )}

        {bilan.lignes.length === 0 ? (
          <Vide indice="Une OP passe ici dès qu'elle est livrée.">Rien à encaisser</Vide>
        ) : (
          <div className="mt-[9px] space-y-[5px]">
            {bilan.lignes.map((op) => {
              const retard = joursDeRetard(op, aujourdhui);
              return (
                <div key={op.id} className="flex flex-wrap items-center gap-[7px] py-[3px]">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{op.marque}</span>
                  <Puce>{nomChaine(op.meta.chaine)}</Puce>
                  {op.meta.expandia && <Puce titre="Commission Expandia 30 %">via Expandia</Puce>}
                  {paiementAInscrire(op) ? (
                    <Puce ton="alerte" titre="Sans cette date, aucun retard ne peut être compté">
                      date de paiement à renseigner
                    </Puce>
                  ) : (
                    <Puce ton={retard > SEUIL_RETARD ? "danger" : retard > 0 ? "alerte" : "neutre"}>
                      {retard > 0 ? `${retard} j de retard` : `attendu le ${formaterJour(op.meta.paiement)}`}
                    </Puce>
                  )}
                  {op.meta.litige && <Puce ton="danger">litige</Puce>}
                  <Euros valeur={netOp(op)} className="w-[90px] flex-none text-right text-[13px] font-semibold" />
                </div>
              );
            })}
          </div>
        )}
      </Carte>

      {/* ---------- Le pipeline ---------- */}
      <Carte accent="var(--color-cor)">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Surtitre couleur="var(--color-cor-soft)">Pipeline des OP</Surtitre>
          <span className="text-[11px] text-white/40">
            {ops.length} OP · {formaterEuros(total)} net au total
          </span>
        </div>

        <form
          className="mt-[9px] flex items-center gap-[6px]"
          onSubmit={(e) => {
            e.preventDefault();
            const nom = nouvelle.trim();
            if (!nom) return;
            setNouvelle("");
            void ajouterOp(nom);
          }}
        >
          <Champ valeur={nouvelle} onChange={setNouvelle} placeholder="Nouvelle marque…" className="flex-1" aria="Nouvelle OP" />
          <Bouton type="submit" ton="plein" disabled={!nouvelle.trim()}>
            Ajouter
          </Bouton>
        </form>

        {!pret && ops.length === 0 && <Vide>Lecture des OP…</Vide>}
        {pret && ops.length === 0 && <Vide indice="Tape une marque ci-dessus.">Aucune OP</Vide>}

        <div className="mt-[11px] space-y-[7px]">
          {ops.map((op) => (
            <LigneOp
              key={op.id}
              op={op}
              aujourdhui={aujourdhui}
              ouverte={ouverte === op.id}
              surOuvrir={() => setOuverte(ouverte === op.id ? null : op.id)}
              surModifier={(patch) => void modifierOp(op.id, patch)}
              surSupprimer={() => {
                setOuverte(null);
                void supprimerOp(op.id);
              }}
            />
          ))}
        </div>
      </Carte>
    </div>
  );
}

/** Une OP : la ligne lisible, et l'éditeur en dessous. */
function LigneOp({
  op,
  aujourdhui,
  ouverte,
  surOuvrir,
  surModifier,
  surSupprimer,
}: {
  op: Op;
  aujourdhui: string;
  ouverte: boolean;
  surOuvrir: () => void;
  surModifier: (patch: Parameters<ReturnType<typeof useCockpit>["modifierOp"]>[1]) => void;
  surSupprimer: () => void;
}) {
  const [brut, setBrut] = useState(String(op.brut || ""));
  const alertes = alertesOp(op, aujourdhui);
  const commission = commissionOp(op);

  return (
    <div className="carte-haute p-[11px]">
      <button type="button" onClick={surOuvrir} className="flex w-full cursor-pointer flex-wrap items-center gap-[7px] text-left">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{op.marque}</span>
        <Puce couleur={ETAPES_OP.find((e) => e.id === op.etape)?.couleur}>
          {ETAPES_OP.find((e) => e.id === op.etape)?.nom}
        </Puce>
        <Puce>{nomChaine(op.meta.chaine)}</Puce>
        <span className="nombres w-[150px] flex-none text-right text-[12px]">
          <Euros valeur={op.brut} className="text-white/40" />
          {commission > 0 && <span className="text-white/40"> − {formaterEuros(commission)}</span>}
        </span>
        <Euros valeur={netOp(op)} className="w-[90px] flex-none text-right text-[13px] font-semibold" />
      </button>

      {alertes.length > 0 && (
        <div className="mt-[5px] flex flex-wrap gap-[4px]">
          {alertes.map((a) => (
            <Puce key={a.texte} ton={a.ton}>
              {a.texte}
            </Puce>
          ))}
        </div>
      )}

      {ouverte && (
        <div className="entree-ligne mt-[9px] space-y-[9px] border-t pt-[9px]" style={{ borderColor: "var(--p90-bord)" }}>
          <div className="flex flex-wrap items-center gap-[5px]">
            <span className="w-[74px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
              Étape
            </span>
            {ETAPES_OP.map((e) => (
              <Puce
                key={e.id}
                actif={op.etape === e.id}
                ton={e.id === "paye" ? "succes" : "accent"}
                onClick={() => surModifier({ etape: e.id as EtapeOp })}
              >
                {e.nom}
              </Puce>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[5px]">
            <span className="w-[74px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
              Chaîne
            </span>
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
          </div>

          <div className="flex flex-wrap items-center gap-[7px]">
            <span className="w-[74px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
              Brut
            </span>
            <Champ
              type="number"
              valeur={brut}
              onChange={setBrut}
              aria="Montant brut"
              className="w-[110px]"
              onBlur={() => {
                const v = Number(brut);
                if (Number.isFinite(v) && v !== op.brut) surModifier({ brut: Math.max(0, v) });
              }}
            />
            <span className="text-[11px] text-white/40">
              net <Euros valeur={netOp(op)} />
              {commission > 0 && ` (commission ${formaterEuros(commission)})`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-[7px]">
            <span className="w-[74px] flex-none text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
              Diffusion
            </span>
            <Champ
              type="date"
              valeur={op.meta.diffusion ?? ""}
              onChange={(v) => surModifier({ meta: { ...op.meta, diffusion: v || undefined } })}
              aria="Date de diffusion"
              className="w-[150px]"
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
              Paiement attendu
            </span>
            <Champ
              type="date"
              valeur={op.meta.paiement ?? ""}
              onChange={(v) => surModifier({ meta: { ...op.meta, paiement: v || undefined } })}
              aria="Date de paiement attendue"
              className="w-[150px]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-[7px] pt-[3px]">
            <span className="text-[10px] text-white/40 opacity-70">
              Alerte si l&apos;OP est sous {SEUIL_MONTANT_TEXTE} une fois engagée, ou payée avec plus de{" "}
              {SEUIL_RETARD} jours de retard.
            </span>
            <Bouton ton="danger" onClick={surSupprimer}>
              Supprimer
            </Bouton>
          </div>
        </div>
      )}
    </div>
  );
}
