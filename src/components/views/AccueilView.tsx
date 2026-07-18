"use client";

import { useOs } from "@/lib/os-context";
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

  return (
    <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-4">
      <CaptureBar />
      <OperateurCard />
      <TachesCard />
      <RevenusCard />
      <HabitudesCard />
      <BlocagesCard />

      {/*
        L'ordre compte : sur une grille à quatre colonnes, une rangée qui n'en
        remplit que trois laisse un vide de la hauteur de toute la rangée.
        C'était le cas ici — Blocages (1) + Pipeline (2) laissaient un trou de
        294 × 497 px à droite. Nutrition le comble, et chaque rangée fait
        maintenant exactement quatre colonnes :

          Blocages 1 + Pipeline 2 + Nutrition 1
          Semaine 2  + Objectifs 2
          Journal 4
      */}
      <Panel accent="var(--color-cya)" className="col-span-full md:col-span-2">
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

      <NutritionCard />
      <SemaineCard />
      <ObjectifsCard />
      <JournalCard />
    </div>
  );
}
