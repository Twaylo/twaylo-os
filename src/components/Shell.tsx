"use client";

import { OsProvider, useOs } from "@/lib/os-context";
import { ProgressionProvider } from "@/lib/progression-context";
import { Recompense } from "@/components/Recompense";
import { TopRail } from "@/components/TopRail";
import { AccueilView } from "@/components/views/AccueilView";
import { ContactsView } from "@/components/views/ContactsView";
import { SponsorsView } from "@/components/views/SponsorsView";
import { ContenuView } from "@/components/views/ContenuView";
import { RevenusView } from "@/components/views/RevenusView";
import { JournalView } from "@/components/views/JournalView";
import { ObjectifsView } from "@/components/views/ObjectifsView";
import { SkillView } from "@/components/views/SkillView";
import { RevueView } from "@/components/views/RevueView";
import { OubliesView } from "@/components/views/OubliesView";
import { BrainView } from "@/components/views/BrainView";
import { BilanView } from "@/components/views/BilanView";
import { JourneeTypeView } from "@/components/views/JourneeTypeView";

const VIEWS = {
  Accueil: AccueilView,
  Brain: BrainView,
  Bilan: BilanView,
  "Journée type": JourneeTypeView,
  Contacts: ContactsView,
  Sponsors: SponsorsView,
  Contenu: ContenuView,
  Revenus: RevenusView,
  Journal: JournalView,
  Objectifs: ObjectifsView,
  Skill: SkillView,
  Revue: RevueView,
  Oubliés: OubliesView,
} as const;

function ActiveView() {
  const { activeTab } = useOs();
  const View = VIEWS[activeTab];
  /*
   * Pas de `key` ici, volontairement.
   *
   * J'avais mis `key={activeTab}` pour rejouer l'animation d'entrée à chaque
   * onglet. Résultat mesuré : chaque clic détruisait et reconstruisait toute
   * la vue, puis imposait 320 ms d'animation avant que le contenu se pose —
   * ce qui donnait la sensation de saccade et d'attente. La navigation doit
   * être instantanée ; l'animation ne joue qu'au premier affichage.
   */
  return <View />;
}

/**
 * Les trois halos flous en fond. Purement décoratifs (spec Partie 3).
 * Leurs couleurs viennent des variables `--halo-N`, posées sur la racine par
 * l'ambiance choisie dans « Personnaliser » — les valeurs par défaut vivent
 * dans globals.css.
 */
function Glow() {
  return (
    <>
      <div
        className="pointer-events-none absolute -right-[100px] -top-[140px] h-[460px] w-[460px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-1), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[160px] -left-20 h-[440px] w-[440px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-2), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-3), transparent 70%)",
        }}
      />
    </>
  );
}

export function Shell() {
  return (
    <OsProvider>
      <ProgressionProvider>
        {/*
          `overflow-x-clip` et non `-hidden` : `hidden` aurait fait de ce cadre
          une seconde zone défilante verticale (la spécification bascule l'axe
          laissé en `visible` vers `auto`), empilée sous celle de la fenêtre —
          d'où le défilement qui repartait en plusieurs fois. `clip` se contente
          de couper les halos qui dépassent, sans créer d'ascenseur.
        */}
        <div className="relative min-h-screen overflow-x-clip">
          <Glow />
          <TopRail />
          <main
            className="relative z-[1] mx-auto max-w-[1500px] px-6 pb-[30px] pt-4"
            style={{
              /*
               * En mode application, la barre de gestes d'iOS mange le bas de
               * l'écran et l'encoche les côtés en paysage. Hors de ce mode, les
               * `safe-area-inset-*` valent 0 : la mise en page ne change pas.
               */
              paddingBottom: "calc(30px + env(safe-area-inset-bottom, 0px))",
              paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
              paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
            }}
          >
            <ActiveView />
          </main>
        </div>
        {/* Les fenêtres de récompense, au-dessus de tout, montées par portail. */}
        <Recompense />
      </ProgressionProvider>
    </OsProvider>
  );
}
