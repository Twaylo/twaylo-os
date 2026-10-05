"use client";

import { useEffect, useRef, useState } from "react";
import { CockpitProvider, useCockpit } from "@/lib/p90-context";
import { compteARebours } from "@/lib/p90";
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
 * LE BANDEAU — où on en est dans les 90 jours, en une ligne.
 *
 * Deux dates comptent : le 1er novembre, quand Momentum ouvre, et le
 * 31 décembre, quand tout se juge. Affichées en jours, pas en dates : « J-27 »
 * se lit sans calculer, « 1er novembre » demande de compter.
 *
 * Il portait aussi les dates de début et de fin, une barre étiquetée et un
 * « jour 3 sur 88 ». Trois façons de dire la même chose au-dessus de la todo,
 * sur l'écran qu'on ouvre quarante fois par jour. Il n'en reste que les deux
 * compteurs, et le temps écoulé passé dans un filet de deux pixels au bord du
 * bandeau — on le voit avancer sans jamais avoir à le lire.
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
      <div className="relative mx-auto flex max-w-[1500px] flex-wrap items-baseline gap-x-[14px] gap-y-[4px] px-[18px] py-[10px]">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">PROJECT 90</span>

        <span className="flex-1" />

        {etatReseau === "hors_ligne" && (
          <span className="text-[10px] font-semibold" style={{ color: "var(--p90-alerte)" }}>
            hors ligne
          </span>
        )}

        <Compteur
          valeur={r.versOuverture}
          libelle="ouverture"
          ton={r.versOuverture <= 7 ? "var(--p90-accent)" : undefined}
        />
        <Compteur valeur={r.versFin} libelle="fin" />

        {/*
          Le filet du temps écoulé, posé SUR la bordure du bandeau.
          Il n'a pas d'étiquette : une barre qui se remplit de gauche à droite
          au fil d'un compte à rebours n'en demande pas.
        */}
        <div
          className="absolute inset-x-0 bottom-[-1px] h-[2px]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(r.pctEcoule)}
          aria-label="Temps écoulé sur les 90 jours"
          title={`Jour ${r.ecoules} sur ${r.total}`}
        >
          <span
            className="block h-full"
            style={{
              width: `${Math.max(0, Math.min(100, r.pctEcoule))}%`,
              background: "var(--p90-texte-2)",
              opacity: 0.5,
              transition: "width var(--p90-vitesse) ease",
            }}
          />
        </div>
      </div>
    </header>
  );
}

function Compteur({ valeur, libelle, ton }: { valeur: number; libelle: string; ton?: string }) {
  const passe = valeur < 0;
  return (
    <span className="flex items-baseline gap-[4px]">
      <span className="nombres text-[15px] font-semibold" style={{ color: ton }}>
        {passe ? `+${-valeur}` : `J-${valeur}`}
      </span>
      <span className="text-[10px] text-[var(--p90-texte-2)]">{libelle}</span>
    </span>
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
      className="rail-onglets mx-auto flex max-w-[1500px] gap-[16px] overflow-x-auto px-[18px] pt-[10px] pb-[2px]"
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
            className="cible-doigt flex-none cursor-pointer px-[2px] text-[12px] font-semibold transition-colors"
            style={{
              color: choisi ? "var(--p90-accent)" : "var(--p90-texte-2)",
              boxShadow: choisi ? "inset 0 -2px 0 0 var(--p90-accent)" : undefined,
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
        className="mx-auto max-w-[1500px] px-[18px] pt-[13px] pb-[30px]"
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
