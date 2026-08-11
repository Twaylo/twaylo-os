"use client";

import type { ComponentType } from "react";

import { useOs } from "@/lib/os-context";
import { useMasonry } from "@/lib/use-masonry";
import { BLOC_PAR_ID } from "@/lib/modules";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { CaptureBar } from "@/components/cards/CaptureBar";
import { RelanceBanner } from "@/components/cards/RelanceBanner";
import { OperateurCard } from "@/components/cards/OperateurCard";
import { ProgressionCard } from "@/components/cards/ProgressionCard";
import { TachesCard } from "@/components/cards/TachesCard";
import { RevenusCard } from "@/components/cards/RevenusCard";
import { HabitudesCard } from "@/components/cards/HabitudesCard";
import { PipelineGrid } from "@/components/cards/PipelineGrid";
import { SemaineCard } from "@/components/cards/SemaineCard";
import { ObjectifsCard } from "@/components/cards/ObjectifsCard";
import { JournalCard } from "@/components/cards/JournalCard";
import { NutritionCard } from "@/components/cards/NutritionCard";
import { JourneeCard } from "@/components/cards/JourneeCard";
import { BlocagesCard } from "@/components/cards/BlocagesCard";

/**
 * La carte de l'accueil correspondant à chaque bloc du catalogue.
 *
 * Le catalogue (`modules.ts`) est pur : il décrit ce qui EXISTE, sans savoir
 * dessiner. Ce registre est le seul endroit qui fait le lien avec un
 * composant, et il vit ici parce que l'accueil est le seul à en avoir besoin.
 *
 * Toute clé du catalogue doit s'y trouver — un bloc proposé dans
 * « Personnaliser » qui ne dessinerait rien serait une case à cocher qui ment.
 * Le compilateur le vérifie : `Record<string, …>` deviendrait trop lâche, on
 * garde donc une recherche explicite et un bloc inconnu est simplement ignoré
 * (cas d'un réglage venu d'une version plus récente que le code servi).
 */
const CARTES: Record<string, ComponentType> = {
  operateur: OperateurCard,
  progression: ProgressionCard,
  taches: TachesCard,
  journee: JourneeCard,
  habitudes: HabitudesCard,
  objectifs: ObjectifsCard,
  blocages: BlocagesCard,
  semaine: SemaineCard,
  nutrition: NutritionCard,
  revenus: RevenusCard,
  pipeline: PipelineContenu,
  journal: JournalCard,
};

/** Le pipeline a besoin de son cadre : la grille compacte ne le porte pas. */
function PipelineContenu() {
  const { data, demoMode, pipeline } = useOs();
  const colonnes = (!demoMode && pipeline) || data.pipeline;
  const videoCount = colonnes.reduce((n, c) => n + c.videos.length, 0);

  return (
    <Panel accent="var(--color-cya)">
      <div className="mb-[11px] flex items-center justify-between gap-3">
        <Eyebrow color="var(--color-cya-soft)" dot="var(--color-cya)">
          PIPELINE CONTENU
        </Eyebrow>
        <div className="flex-none text-[11px] text-white/40">
          {videoCount} {videoCount > 1 ? "vidéos" : "vidéo"}
        </div>
      </div>
      <PipelineGrid compact />
    </Panel>
  );
}

export function AccueilView() {
  const { blocsAccueil } = useOs();

  const grille = useMasonry<HTMLDivElement>();

  /*
   * Deux familles, et c'est le catalogue qui tranche.
   *
   * Le compactage range les cartes colonne par colonne, à la hauteur de leur
   * contenu. Une carte qui occupe PLUSIEURS colonnes casse ce rangement : la
   * grille doit attendre que toutes ses colonnes soient libres en même temps,
   * et laisse au-dessus d'elle un creux que rien ne vient combler — le trou de
   * ~80 px qu'on voyait sous « Ça coince », juste avant Pipeline.
   *
   * Les cartes d'une colonne vont donc dans la grille compactée, les larges
   * en dessous, en pleine largeur. Le drapeau `large` du catalogue décide,
   * plutôt qu'une liste écrite en dur qui aurait divergé du catalogue.
   */
  const rendus: { id: string; large: boolean; Carte: ComponentType }[] = [];
  for (const id of blocsAccueil) {
    const def = BLOC_PAR_ID.get(id);
    const Carte = CARTES[id];
    if (def && Carte) rendus.push({ id, large: Boolean(def.large), Carte });
  }

  const colonne = rendus.filter((b) => !b.large);
  const larges = rendus.filter((b) => b.large);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* La relance passe AVANT tout : si elle a quelque chose à dire, c'est
          la première chose à lire. Elle disparaît à la première coche. */}
      <RelanceBanner />
      <CaptureBar />

      {colonne.length > 0 && (
        <div
          ref={grille}
          // `grid-auto-rows` fin + `items-start` : chaque carte occupe exactement
          // le nombre de micro-rangées que son contenu réclame (voir useMasonry).
          // Les micro-rangées n'existent qu'au format large, là où le compactage a
          // un sens. En dessous, la grille reste une pile normale : appliquer des
          // rangées de 4 px sans span écraserait chaque carte dans 4 px de haut.
          className="grid grid-cols-1 items-start gap-[14px] md:grid-cols-2 xl:grid-cols-4 xl:[grid-auto-flow:row_dense] xl:[grid-auto-rows:4px]">
          {colonne.map(({ id, Carte }) => (
            <Carte key={id} />
          ))}
        </div>
      )}

      {larges.map(({ id, Carte }) => (
        <Carte key={id} />
      ))}

      {rendus.length === 0 && (
        <Panel accent="var(--color-amb)">
          <div className="py-6 text-center">
            <div className="text-[14px] font-black">Ton accueil est vide.</div>
            <div className="mx-auto mt-[6px] max-w-[340px] text-[12px] font-semibold leading-[1.5] text-white/45">
              Ouvre ton avatar en haut à droite, puis « Personnaliser l&apos;OS » pour
              choisir les blocs que tu veux voir ici.
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
