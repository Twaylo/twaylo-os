"use client";

import { useOs } from "@/lib/os-context";
import { useMasonry } from "@/lib/use-masonry";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { CaptureBar } from "@/components/cards/CaptureBar";
import { OperateurCard } from "@/components/cards/OperateurCard";
import { TachesCard } from "@/components/cards/TachesCard";
import { RevenusCard } from "@/components/cards/RevenusCard";
import { HabitudesCard } from "@/components/cards/HabitudesCard";
import { PipelineGrid } from "@/components/cards/PipelineGrid";
import { SemaineCard } from "@/components/cards/SemaineCard";
import { ObjectifsCard } from "@/components/cards/ObjectifsCard";
import { JournalCard } from "@/components/cards/JournalCard";
import { NutritionCard } from "@/components/cards/NutritionCard";
import { BlocagesCard } from "@/components/cards/BlocagesCard";

export function AccueilView() {
  const { data } = useOs();
  const videoCount = data.pipeline.reduce((n, c) => n + c.videos.length, 0);

  const grille = useMasonry<HTMLDivElement>();

  /*
   * Trois zones empilées, et une seule est en « masonry ».
   *
   * Le compactage range les cartes colonne par colonne, à la hauteur de leur
   * contenu. Une carte qui occupe PLUSIEURS colonnes casse ce rangement : la
   * grille doit attendre que toutes ses colonnes soient libres en même temps,
   * et laisse au-dessus d'elle un creux que rien ne vient combler — le trou de
   * ~80 px qu'on voyait sous « Ça coince », juste avant Pipeline.
   *
   * On sépare donc les deux familles : les cartes d'une colonne vont dans la
   * grille compactée (qui se remplit alors sans le moindre vide), et les cartes
   * larges vivent en dessous, en pleine largeur. Pipeline y gagne même de la
   * place — ses quatre étapes tiennent enfin côte à côte.
   */
  return (
    <div className="flex flex-col gap-[14px]">
      <CaptureBar />

      <div
        ref={grille}
        // `grid-auto-rows` fin + `items-start` : chaque carte occupe exactement
        // le nombre de micro-rangées que son contenu réclame (voir useMasonry).
        // Les micro-rangées n'existent qu'au format large, là où le compactage a
        // un sens. En dessous, la grille reste une pile normale : appliquer des
        // rangées de 4 px sans span écraserait chaque carte dans 4 px de haut.
        className="grid grid-cols-1 items-start gap-[14px] md:grid-cols-2 xl:grid-cols-4 xl:[grid-auto-flow:row_dense] xl:[grid-auto-rows:4px]">
        <OperateurCard />
        <TachesCard />
        <RevenusCard />
        <HabitudesCard />
        <BlocagesCard />
        <NutritionCard />
        <SemaineCard />
        <ObjectifsCard />
      </div>

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

      <JournalCard />
    </div>
  );
}
