"use client";

import { useState } from "react";
import { useOs, type DealVue } from "@/lib/os-context";
import { localDateKey, localDateKeyOffset } from "@/lib/local-date";
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
        // La carte parente est `draggable` : sans ces gardes, cliquer dans le
        // champ (surtout en bougeant un peu) démarre un glissé de carte au lieu
        // d'éditer. On coupe le glissé sur ce champ et on l'empêche d'atteindre
        // le parent.
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
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
      // Sans montant, « — € » ressemblait à un champ mort : rien n'indiquait
      // qu'on pouvait cliquer, et les totaux du haut restaient donc vides
      // pendant que les prix s'écrivaient dans le nom du deal. « + prix » dit
      // ce qu'il faut faire, comme « + date » juste à côté.
      className={`flex-none cursor-pointer rounded-[6px] px-[5px] font-extrabold transition-all hover:brightness-125 ${
        deal.montant ? "font-mono text-[12px]" : "text-[11px]"
      }`}
      style={{ color: deal.montant ? "var(--color-ver-soft)" : "rgba(255,255,255,0.3)" }}
    >
      {deal.montant ? `${deal.montant.toLocaleString("fr-FR")} €` : "+ prix"}
    </button>
  );
}

/**
 * Combien de jours avant l'échéance — négatif si elle est passée.
 *
 * Les deux dates sont ancrées à midi UTC avant d'être soustraites : en partant
 * de minuit, un changement d'heure décale le résultat d'un jour entier, et une
 * échéance « demain » s'afficherait « aujourd'hui » deux fois par an.
 */
function joursAvant(echeance: string): number {
  const cible = Date.parse(`${echeance}T12:00:00Z`);
  const aujourdhui = Date.parse(`${localDateKey()}T12:00:00Z`);
  return Math.round((cible - aujourdhui) / 86_400_000);
}

/**
 * La couleur de l'échéance : calme quand c'est loin, rouge quand ça brûle.
 *
 * On interpole en continu plutôt que par paliers — le but est de voir d'un
 * coup d'œil, sur tout le tableau, lequel des deals chauffe le plus. Au-delà
 * d'un mois c'est vert franc ; le rouge arrive le jour J ; passé la date, on
 * sature et on l'annonce en toutes lettres.
 */
function couleurEcheance(jours: number): { teinte: string; libelle: string | null } {
  if (jours < 0) return { teinte: "hsl(0,85%,62%)", libelle: "en retard" };
  const t = Math.max(0, Math.min(1, 1 - jours / 30));
  // 145° (vert) → 0° (rouge). La saturation monte avec l'urgence pour que le
  // rouge saute aux yeux là où le vert reste discret.
  const teinte = `hsl(${Math.round(145 - 145 * t)},${Math.round(55 + 30 * t)}%,${Math.round(64 - 4 * t)}%)`;
  return { teinte, libelle: jours === 0 ? "aujourd'hui" : null };
}

const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 12 août » — court, sans l'année quand c'est l'année en cours. */
function formaterEcheance(echeance: string): string {
  const [a, m, j] = echeance.split("-").map(Number);
  const anneeCourante = Number(localDateKey().slice(0, 4));
  const base = `${j} ${MOIS_COURTS[m - 1] ?? ""}`.trim();
  return a === anneeCourante ? base : `${base} ${a}`;
}

/**
 * Le bouton d'échéance : cliquer ouvre un sélecteur de date natif (donc le
 * calendrier du téléphone sur mobile), vider le champ efface la date.
 */
function EcheanceEditable({ deal }: { deal: DealVue }) {
  const { majEcheanceDeal } = useOs();
  const [edite, setEdite] = useState(false);

  if (edite) {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={deal.echeance ?? ""}
        // Même précaution que pour le montant : la carte est `draggable`, et un
        // léger mouvement en ouvrant le calendrier lancerait un glissé.
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          majEcheanceDeal(deal.id, e.target.value || null);
          setEdite(false);
        }}
        onBlur={() => setEdite(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEdite(false);
        }}
        aria-label={`Échéance de ${deal.nom}`}
        className="w-[128px] rounded-[6px] px-[6px] py-[2px] font-mono text-[11px] font-extrabold text-white outline-none"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.22)",
          colorScheme: "dark",
        }}
      />
    );
  }

  if (!deal.echeance) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEdite(true);
        }}
        title="Fixer une échéance"
        className="flex-none cursor-pointer rounded-[6px] px-[5px] py-[1px] text-[11px] font-extrabold text-white/30 transition-all hover:text-white/60"
      >
        + date
      </button>
    );
  }

  const jours = joursAvant(deal.echeance);
  const { teinte, libelle } = couleurEcheance(jours);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEdite(true);
      }}
      title={
        jours < 0
          ? `En retard de ${-jours} jour${jours < -1 ? "s" : ""}`
          : jours === 0
            ? "C'est aujourd'hui"
            : `Dans ${jours} jour${jours > 1 ? "s" : ""}`
      }
      className="flex-none cursor-pointer rounded-[6px] px-[6px] py-[1px] font-mono text-[11px] font-extrabold transition-all hover:brightness-125"
      style={{
        color: teinte,
        background: `color-mix(in srgb, ${teinte} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${teinte} 45%, transparent)`,
      }}
    >
      {formaterEcheance(deal.echeance)}
      {libelle && <span className="ml-[4px] font-sans font-bold">· {libelle}</span>}
    </button>
  );
}

/** Le libellé de la case chiffrée qui surplombe chaque colonne. */
const LIBELLE_STAT: Record<string, string> = {
  prospect: "Prospects",
  negociation: "En négociation",
  signe: "Argent signé",
  livre: "Livré",
};

const somme = (deals: DealVue[], etapes: string[]) =>
  deals.filter((d) => etapes.includes(d.etape)).reduce((n, d) => n + (d.montant ?? 0), 0);

const euro = (n: number) => (n === 0 ? "—" : `${n.toLocaleString("fr-FR")} €`);

/**
 * Une case chiffrée par colonne, dans le MÊME ordre que le tableau.
 *
 * Les cases affichaient auparavant « Argent signé » avant « En négociation »,
 * alors que le tableau range Négociation avant Signé : chaque chiffre
 * surplombait la mauvaise colonne. Ici la liste est dérivée de `ETAPES`, donc
 * l'alignement ne peut plus se défaire — ajouter une étape ajoute sa case au
 * bon endroit.
 *
 * Plus de « Pipeline total » non plus : additionner un deal en négociation avec
 * un deal signé fabrique un chiffre auquel on se met à croire, alors que l'un
 * peut encore tomber à l'eau. L'acquis et l'attente sont désormais annoncés
 * séparément, dans le sous-titre.
 *
 * Recalculées depuis la liste affichée à chaque rendu : déplacer un deal ou
 * corriger un montant met les chiffres à jour dans le même geste.
 */
function calculerStats(deals: DealVue[]) {
  return ETAPES.map((e) => ({
    label: LIBELLE_STAT[e.id] ?? e.nom,
    value: euro(somme(deals, [e.id])),
    color: e.couleur,
  }));
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
      // Échéances échelonnées : de quoi montrer tout le dégradé vert → rouge
      // sur une prise de vue, sans exposer de vraies dates.
      echeance: localDateKeyOffset([2, 9, 21, 40][(i + j) % 4]),
    })),
  );

  const liste = demoMode ? listeDemo : (deals ?? []);
  // Toujours recalculées depuis la liste affichée — y compris en démo, pour que
  // les cases restent alignées sur les colonnes qu'elles surplombent.
  const stats = calculerStats(liste);
  const total = liste.length;

  // L'acquis d'un côté, l'attente de l'autre : un deal en négociation n'est pas
  // de l'argent, et le mélanger au signé ferait croire à un chiffre plus gros
  // qu'il n'est.
  const acquis = somme(liste, ["signe", "livre"]);
  const attente = somme(liste, ["prospect", "negociation"]);
  const clos = liste.filter((d) => d.etape === "signe" || d.etape === "livre").length;
  const taux = total > 0 ? Math.round((clos / total) * 100) : null;

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
            ? [
                `${total} deal${total > 1 ? "s" : ""}`,
                acquis > 0 ? `${euro(acquis)} acquis` : null,
                attente > 0 ? `${euro(attente)} en attente` : null,
                taux === null ? null : `${taux} % de closing`,
              ]
                .filter(Boolean)
                .join(" · ")
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
        // Assez pour accueillir une carte sans que les colonnes vides ne
        // creusent un trou sur toute la page.
        hauteurMin={150}
        rendre={(d) => (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[13.5px] font-extrabold">{d.nom}</div>
              <MontantEditable deal={d} />
            </div>
            <div className="mt-[5px] flex items-center justify-between gap-2">
              <EcheanceEditable deal={d} />
            </div>
            {d.note && <div className="mt-1 text-[11.5px] text-white/50">{d.note}</div>}
          </>
        )}
      />
    </>
  );
}
