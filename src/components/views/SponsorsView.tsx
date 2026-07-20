"use client";

import { useState } from "react";
import { useOs, type DealVue } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { Kanban, type ColonneKanban } from "@/components/Kanban";
import { ViewHeader } from "@/components/views/ViewHeader";

/**
 * Sponsors · Deals — le CRM « business ».
 *
 * Les quatre étapes d'une négociation, avec un montant éditable sur chaque
 * carte. Les statistiques du haut sont calculées à partir des deals, jamais
 * saisies : un total recopié à la main finit toujours par mentir.
 */

const ETAPES = [
  { id: "prospect", nom: "Prospect", couleur: "#b48cf0" },
  { id: "negociation", nom: "Négociation", couleur: "#e6c060" },
  { id: "signe", nom: "Signé", couleur: "#5fd39a" },
  { id: "livre", nom: "Livré", couleur: "#61c9db" },
];

function MontantEditable({ deal }: { deal: DealVue }) {
  const { majMontantDeal } = useOs();
  const [edite, setEdite] = useState(false);
  const [brouillon, setBrouillon] = useState("");

  if (edite) {
    return (
      <input
        autoFocus
        type="number"
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        // Le clic dans le champ ne doit pas ouvrir le menu de la carte.
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          majMontantDeal(deal.id, brouillon === "" ? null : Number(brouillon));
          setEdite(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEdite(false);
        }}
        placeholder="€"
        aria-label={`Montant de ${deal.nom}`}
        className="w-[76px] rounded-[6px] px-[6px] py-[2px] text-right font-mono text-[12px] font-extrabold text-white outline-none"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.22)",
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setBrouillon(deal.montant === null ? "" : String(deal.montant));
        setEdite(true);
      }}
      title="Cliquer pour fixer le montant"
      className="flex-none cursor-pointer rounded-[6px] px-[5px] font-mono text-[12px] font-extrabold transition-all hover:brightness-125"
      style={{ color: deal.montant ? "var(--color-ver-soft)" : "rgba(255,255,255,0.3)" }}
    >
      {deal.montant ? `${deal.montant.toLocaleString("fr-FR")} €` : "— €"}
    </button>
  );
}

/**
 * Les quatre statistiques, recalculées à partir des deals affichés.
 *
 * Elles venaient du serveur et n'étaient jamais recalculées après un
 * changement local : déplacer un deal en « Signé » ou corriger un montant
 * laissait le total du haut mentir jusqu'au rechargement. En les dérivant de
 * la liste courante, elles suivent chaque geste. Même logique que `statsDeals`
 * côté serveur, pour que les deux coïncident.
 */
function calculerStats(deals: DealVue[]) {
  const somme = (etapes: string[]) =>
    deals.filter((d) => etapes.includes(d.etape)).reduce((n, d) => n + (d.montant ?? 0), 0);
  const euro = (n: number) => (n === 0 ? "—" : `${n.toLocaleString("fr-FR")} €`);
  const clos = deals.filter((d) => d.etape === "signe" || d.etape === "livre").length;
  const taux = deals.length > 0 ? Math.round((clos / deals.length) * 100) : null;

  return [
    { label: "Pipeline total", value: euro(somme(ETAPES.map((e) => e.id))), color: "#5fd39a" },
    { label: "Signés", value: euro(somme(["signe", "livre"])), color: "#61c9db" },
    { label: "En négociation", value: euro(somme(["negociation"])), color: "#e6c060" },
    {
      label: "Taux de closing",
      value: taux === null ? "—" : `${taux} %`,
      color: "#ff6ba3",
    },
  ];
}

export function SponsorsView() {
  const { deals, ajouterDeal, deplacerDeal, supprimerDeal, demoMode, data } = useOs();

  // En démo, on reconstruit des deals depuis le jeu de démonstration pour que
  // l'écran soit plein quand Twaylo filme.
  const listeDemo: DealVue[] = data.dealColumns.flatMap((col, i) =>
    col.deals.map((d, j) => ({
      id: `demo-${i}-${j}`,
      nom: d.name,
      etape: ETAPES[i]?.id ?? "prospect",
      montant: d.amount === "—" ? null : Number(d.amount.replace(/\D/g, "")) * 1000,
      note: d.note,
    })),
  );

  const liste = demoMode ? listeDemo : (deals ?? []);
  // En démo, les stats factices ; sinon, recalculées à chaque rendu depuis la
  // liste, donc toujours d'accord avec ce qui est affiché.
  const stats = demoMode ? data.dealStats : calculerStats(liste);
  const total = liste.length;

  const colonnes: ColonneKanban<DealVue>[] = ETAPES.map((e) => ({
    id: e.id,
    nom: e.nom,
    couleur: e.couleur,
    items: liste.filter((d) => d.etape === e.id),
  }));

  return (
    <>
      <ViewHeader
        title="Sponsors · Deals"
        subtitle={
          total > 0
            ? `${total} deal${total > 1 ? "s" : ""} · glisse pour changer d'étape`
            : "Aucun deal — écris un nom dans une colonne pour commencer"
        }
      />

      <div className="mb-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} accent={s.color} size="sm" className="px-[17px] py-[15px]">
            <div className="text-[11px] font-bold text-white/45">{s.label}</div>
            <div
              className="mt-[5px] font-mono text-[22px] font-black"
              style={{ color: s.color }}
            >
              {s.value}
            </div>
          </Panel>
        ))}
      </div>

      <Kanban
        colonnes={colonnes}
        cleDe={(d) => d.id}
        onDeplacer={deplacerDeal}
        onSupprimer={supprimerDeal}
        onAjouter={(etape, nom) => void ajouterDeal(nom, etape)}
        placeholderAjout="Nom du sponsor…"
        hauteurMin={280}
        rendre={(d) => (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[13.5px] font-extrabold">{d.nom}</div>
              <MontantEditable deal={d} />
            </div>
            {d.note && <div className="mt-1 text-[11.5px] text-white/50">{d.note}</div>}
          </>
        )}
      />
    </>
  );
}
