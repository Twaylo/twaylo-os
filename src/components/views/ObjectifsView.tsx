"use client";

import { useMemo, useState } from "react";
import {
  OBJECTIFS_P90,
  P90_FIN,
  P90_OUVERTURE,
  ecartJours,
  progression,
  tresorerie,
  type ObjectifP90,
} from "@/lib/p90";
import { useCockpit, type ObjectifVue } from "@/lib/p90-context";
import { Barre, Bouton, Carte, Champ, Euros, Puce, Surtitre, formaterJour, formaterNombre } from "@/components/p90/ui";

/**
 * LES OBJECTIFS — cinq chiffres, et ce qui reste à faire pour les atteindre.
 *
 * La progression se mesure DEPUIS LE DÉPART, jamais depuis zéro. Twaylo part
 * de 316 000 abonnés pour 500 000 : une barre « valeur ÷ cible » afficherait
 * 63 % le premier matin et ne bougerait presque plus de tout le trimestre.
 * Ce qui compte, c'est l'écart à combler.
 *
 * La trésorerie ne se saisit pas : elle se lit sur les OP passées en « Payé ».
 * Un chiffre recopié à la main diverge toujours de celui qui le détermine.
 */

/** Le nombre contenu dans une saisie libre (« 412 000 », « 412000 »). */
function nombreDe(valeur: string): number {
  const nu = valeur.replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(nu);
  return Number.isFinite(n) ? n : 0;
}

export function ObjectifsView() {
  const { aujourdhui, objectifs, ops, pret, modifierObjectif } = useCockpit();

  const tresor = useMemo(() => tresorerie(ops), [ops]);
  const parCle = useMemo(() => new Map(objectifs.map((o) => [o.cle, o])), [objectifs]);

  return (
    <div className="entree-vue space-y-[13px]">
      {OBJECTIFS_P90.map((def) => (
        <BlocObjectif
          key={def.id}
          def={def}
          suivi={parCle.get(def.id)}
          aujourdhui={aujourdhui}
          tresor={def.calcule ? tresor : null}
          pret={pret}
          surValeur={(v) => void modifierObjectif(def.id, { valeur: v })}
          surJalon={(texte, fait) => {
            const actuels = parCle.get(def.id)?.jalons ?? def.jalons.map((j) => ({ texte: j.texte, fait: false }));
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
    </div>
  );
}

function BlocObjectif({
  def,
  suivi,
  aujourdhui,
  tresor,
  pret,
  surValeur,
  surJalon,
}: {
  def: ObjectifP90;
  suivi: ObjectifVue | undefined;
  aujourdhui: string;
  /** Non nul pour la trésorerie seulement : sa valeur est déduite des OP. */
  tresor: { valeur: number; cible: number; pct: number } | null;
  pret: boolean;
  surValeur: (v: string) => void;
  surJalon: (texte: string, fait: boolean) => void;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);

  const valeur = tresor ? tresor.valeur : nombreDe(suivi?.valeur ?? "");
  const cible = tresor && tresor.cible > 0 ? tresor.cible : def.cible;
  const pct = tresor ? tresor.pct : progression(valeur, def);

  const restant = ecartJours(aujourdhui, def.echeance) ?? 0;
  const euros = def.unite === "€";

  /** Les jalons : ceux du code, cochés d'après la base. */
  const coches = new Map((suivi?.jalons ?? []).map((j) => [j.texte, j.fait]));
  const faits = def.jalons.filter((j) => coches.get(j.texte)).length;

  /*
   * La couleur de la barre dit l'ÉTAT, celle de la carte dit l'OBJECTIF.
   * Atteint : vert. En retard : magenta. Sinon, sa propre teinte.
   */
  const couleur = pct >= 100 ? "var(--color-ver)" : restant < 0 ? "var(--color-mag)" : def.couleur;

  return (
    <Carte accent={def.couleur}>
      <div className="flex flex-wrap items-baseline justify-between gap-[7px]">
        <div className="min-w-0">
          <div className="flex items-center gap-[7px]">
            <span
              className="nombres flex-none rounded-[6px] px-[5px] text-[10px] font-bold leading-[18px]"
              style={{
                color: def.rang === 1 ? "#07121d" : def.couleur,
                background: def.rang === 1 ? def.couleur : "transparent",
                border: `1px solid ${def.rang === 1 ? def.couleur : "rgba(255,255,255,0.12)"}`,
              }}
              title={def.rang === 1 ? "Objectif n°1 : il pèse le plus dans la priorisation" : `Rang ${def.rang}`}
            >
              {def.rang}
            </span>
            <h2 className="text-[15px] font-semibold">{def.nom}</h2>
          </div>
          <div className="mt-[2px] text-[11px] text-white/40">{def.detail}</div>
        </div>

        <div className="text-right">
          <div className="nombres text-[20px] font-semibold" style={{ color: couleur }}>
            {euros ? <Euros valeur={valeur} /> : formaterNombre(valeur)}
            <span className="text-[12px] font-normal text-white/40">
              {" / "}
              {euros ? <Euros valeur={cible} /> : `${formaterNombre(cible)} ${def.unite}`}
            </span>
          </div>
          <div className="text-[10px] text-white/40">
            {def.kpi} · {formaterJour(def.echeance)}
            {restant >= 0 ? ` · J-${restant}` : ` · ${-restant} j de retard`}
          </div>
        </div>
      </div>

      <div className="mt-[9px]">
        <Barre pct={pct} couleur={couleur} etiquette={`Progression ${def.nom}`} />
        <div className="mt-[4px] flex items-baseline justify-between text-[10px] text-white/40">
          <span>
            {def.depart > 0 && `départ ${formaterNombre(def.depart)} · `}
            {pct} % du chemin
          </span>
          <span className="nombres">
            {faits}/{def.jalons.length} jalons
          </span>
        </div>
      </div>

      {/* La valeur : saisie à la main, SAUF la trésorerie qui se déduit. */}
      <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
        {tresor ? (
          <span className="text-[11px] text-white/40">
            Calculée depuis les OP passées en « Payé » — rien à saisir ici.
          </span>
        ) : saisie === null ? (
          <Bouton onClick={() => setSaisie(suivi?.valeur ?? "")} titre="Mettre à jour le chiffre atteint">
            Mettre à jour {pret ? "" : "…"}
          </Bouton>
        ) : (
          <>
            <Champ
              valeur={saisie}
              onChange={setSaisie}
              autoFocus
              aria={`Valeur atteinte pour ${def.nom}`}
              className="w-[130px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setSaisie(null);
              }}
              onBlur={() => {
                surValeur(saisie);
                setSaisie(null);
              }}
            />
            <span className="text-[11px] text-white/40">{def.unite}</span>
          </>
        )}
      </div>

      {/* Les jalons, cochables. */}
      <div className="mt-[9px] space-y-[3px] border-t pt-[9px]" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <Surtitre couleur={def.couleur}>Jalons</Surtitre>
        {def.jalons.map((j) => {
          const fait = Boolean(coches.get(j.texte));
          const jours = j.date ? ecartJours(aujourdhui, j.date) : null;
          return (
            <button
              key={j.texte}
              type="button"
              onClick={() => surJalon(j.texte, !fait)}
              className="flex w-full cursor-pointer items-center gap-[7px] rounded-[6px] px-[3px] py-[4px] text-left transition-colors hover:bg-white/5"
            >
              <span
                className="flex-none rounded-[4px] text-center"
                style={{
                  width: 15,
                  height: 15,
                  fontSize: 10,
                  lineHeight: "13px",
                  color: "#07121d",
                  border: `1px solid ${fait ? "var(--color-ver)" : "rgba(255,255,255,0.16)"}`,
                  background: fait ? "var(--color-ver)" : "rgba(255,255,255,0.03)",
                }}
                aria-hidden
              >
                {fait ? "✓" : ""}
              </span>
              <span className={`min-w-0 flex-1 text-[12px] ${fait ? "line-through opacity-40" : ""}`}>{j.texte}</span>
              {j.date && (
                <Puce ton={fait ? "succes" : jours !== null && jours < 0 ? "danger" : jours !== null && jours <= 7 ? "alerte" : "neutre"}>
                  {formaterJour(j.date)}
                </Puce>
              )}
            </button>
          );
        })}
      </div>

      {def.id === "momentum" && (
        <div className="mt-[7px] text-[10px] text-white/40 opacity-70">
          Ouverture le {formaterJour(P90_OUVERTURE)} au soir · tout se juge au {formaterJour(P90_FIN)}.
        </div>
      )}
    </Carte>
  );
}
