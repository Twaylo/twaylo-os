"use client";

import { useEffect, useRef, useState } from "react";
import { CockpitProvider, useCockpit } from "@/lib/p90-context";
import { compteARebours, P90_DEBUT, P90_FIN } from "@/lib/p90";
import { Barre } from "@/components/p90/ui";
import { TodoView } from "@/components/views/TodoView";
import { KanbanView } from "@/components/views/KanbanView";
import { SponsorsView } from "@/components/views/SponsorsView";
import { ObjectifsView } from "@/components/views/ObjectifsView";
import { RevueView } from "@/components/views/RevueView";
import { OubliesView } from "@/components/views/OubliesView";

/**
 * LE COCKPIT.
 *
 * Six onglets, et la todo en premier parce que c'est 90 % de l'usage réel.
 * Quatre modules portent le PROJECT 90 — todo, Kanban, sponsors, objectifs —
 * et deux restent en appui : la revue de semaine, et les Oubliés qui servent
 * de sauvegarde à ce qu'on supprime.
 *
 * Il y en avait treize. Les sept autres (Brain, Bilan, Journée type, Contacts,
 * Contenu, Revenus, Journal, Habitudes, Skill) ne servaient plus : les garder
 * « au cas où » coûtait une barre de navigation qu'on parcourt des yeux avant
 * de trouver la todo, quarante fois par jour.
 */

const ONGLETS = {
  "To-do": TodoView,
  Kanban: KanbanView,
  Sponsors: SponsorsView,
  Objectifs: ObjectifsView,
  Revue: RevueView,
  Oubliés: OubliesView,
} as const;

type Onglet = keyof typeof ONGLETS;
const NOMS = Object.keys(ONGLETS) as Onglet[];

/** L'onglet ouvert survit au rechargement : on reprend là où on était. */
const CLE_ONGLET = "twaylo-p90-onglet";

/**
 * LE BANDEAU — où on en est dans les 90 jours.
 *
 * Deux dates comptent et une seule barre : le 1er novembre, quand Momentum
 * ouvre, et le 31 décembre, quand tout se juge. Affichées en jours, pas en
 * dates : « J-27 » se lit sans calculer, « 1er novembre » demande de compter.
 */
function Bandeau() {
  const { aujourdhui, etatReseau } = useCockpit();
  const r = compteARebours(aujourdhui);

  return (
    <header
      className="sticky top-0 z-10"
      style={{
        background: "rgba(11,11,12,0.92)",
        borderBottom: "1px solid var(--p90-bord)",
        backdropFilter: "blur(12px)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-[18px] gap-y-[7px] px-[18px] py-[11px]">
        <div className="flex items-baseline gap-[9px]">
          <span className="text-[14px] font-semibold tracking-[-0.01em]">PROJECT 90</span>
          <span className="nombres text-[10px] text-[var(--p90-texte-2)]">
            {P90_DEBUT.slice(8)}/{P90_DEBUT.slice(5, 7)} → {P90_FIN.slice(8)}/{P90_FIN.slice(5, 7)}
          </span>
        </div>

        <div className="flex items-baseline gap-[13px]">
          <Compteur
            valeur={r.versOuverture}
            libelle="Momentum ouvre"
            ton={r.versOuverture <= 7 ? "var(--p90-accent)" : undefined}
          />
          <Compteur valeur={r.versFin} libelle="fin des 90 jours" />
        </div>

        <div className="min-w-[120px] flex-1">
          <Barre pct={r.pctEcoule} couleur="var(--p90-texte-2)" hauteur={4} etiquette="Temps écoulé" />
          <div className="nombres mt-[3px] text-[10px] text-[var(--p90-texte-2)]">
            jour {r.ecoules} sur {r.total}
          </div>
        </div>

        {etatReseau === "hors_ligne" && (
          <span
            className="rounded-[6px] px-[7px] py-[2px] text-[10px] font-semibold"
            style={{ color: "var(--p90-alerte)", border: "1px solid var(--p90-alerte)" }}
          >
            hors ligne
          </span>
        )}
      </div>
    </header>
  );
}

function Compteur({ valeur, libelle, ton }: { valeur: number; libelle: string; ton?: string }) {
  const passe = valeur < 0;
  return (
    <div className="leading-[1.1]">
      <div className="nombres text-[18px] font-semibold" style={{ color: ton }}>
        {passe ? `+${-valeur}` : `J-${valeur}`}
      </div>
      <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--p90-texte-2)]">{libelle}</div>
    </div>
  );
}

function Rail({ actif, surChoix }: { actif: Onglet; surChoix: (o: Onglet) => void }) {
  const railRef = useRef<HTMLDivElement | null>(null);

  /* L'onglet actif est ramené dans le cadre : sur téléphone, le rail défile. */
  useEffect(() => {
    const cadre = railRef.current;
    const bouton = cadre?.querySelector<HTMLButtonElement>(`[data-onglet="${actif}"]`);
    bouton?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [actif]);

  return (
    <nav
      ref={railRef}
      className="rail-onglets mx-auto flex max-w-[1500px] gap-[5px] overflow-x-auto px-[18px] py-[9px]"
      aria-label="Modules"
    >
      {NOMS.map((nom) => {
        const choisi = nom === actif;
        return (
          <button
            key={nom}
            type="button"
            data-onglet={nom}
            onClick={() => surChoix(nom)}
            aria-current={choisi ? "page" : undefined}
            className="cible-doigt flex-none cursor-pointer rounded-[8px] px-[13px] py-[7px] text-[12px] font-semibold transition-all"
            style={{
              color: choisi ? "#0b0b0c" : "var(--p90-texte-2)",
              background: choisi ? "var(--p90-accent)" : "var(--p90-surface)",
              border: `1px solid ${choisi ? "var(--p90-accent)" : "var(--p90-bord)"}`,
              transitionDuration: "var(--p90-vitesse)",
            }}
          >
            {nom}
          </button>
        );
      })}
    </nav>
  );
}

function Cockpit() {
  const [onglet, setOnglet] = useState<Onglet>("To-do");

  /*
   * L'onglet est relu APRÈS le premier rendu, volontairement.
   *
   * Lu pendant le rendu, il ferait diverger le HTML du serveur (qui n'a pas
   * accès au stockage local) de celui du navigateur — React rejetterait
   * l'hydratation et repeindrait toute la page.
   */
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const memo = window.localStorage.getItem(CLE_ONGLET);
        if (memo && (NOMS as string[]).includes(memo)) setOnglet(memo as Onglet);
      } catch {
        /* Mode privé, stockage refusé : on reste sur la todo. */
      }
    });
  }, []);

  const choisir = (o: Onglet) => {
    setOnglet(o);
    try {
      window.localStorage.setItem(CLE_ONGLET, o);
    } catch {
      /* Sans mémoire, l'onglet repart simplement sur la todo. */
    }
  };

  const Vue = ONGLETS[onglet];

  return (
    <div className="cadre-appli">
      <Bandeau />
      <Rail actif={onglet} surChoix={choisir} />
      <main
        className="mx-auto max-w-[1500px] px-[18px] pb-[30px]"
        style={{
          paddingBottom: "calc(30px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(18px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(18px, env(safe-area-inset-right, 0px))",
        }}
      >
        {/* La clé remet la vue à neuf d'un onglet à l'autre. */}
        <Vue key={onglet} />
      </main>
    </div>
  );
}

export function Shell() {
  return (
    <CockpitProvider>
      <Cockpit />
    </CockpitProvider>
  );
}
