"use client";

import { OsProvider, useOs } from "@/lib/os-context";
import { TopRail } from "@/components/TopRail";
import { AccueilView } from "@/components/views/AccueilView";
import { ContactsView } from "@/components/views/ContactsView";
import { SponsorsView } from "@/components/views/SponsorsView";
import { ContenuView } from "@/components/views/ContenuView";
import { RevenusView } from "@/components/views/RevenusView";
import { JournalView } from "@/components/views/JournalView";
import { ObjectifsView } from "@/components/views/ObjectifsView";
import { RevueView } from "@/components/views/RevueView";

const VIEWS = {
  Accueil: AccueilView,
  Contacts: ContactsView,
  Sponsors: SponsorsView,
  Contenu: ContenuView,
  Revenus: RevenusView,
  Journal: JournalView,
  Objectifs: ObjectifsView,
  Revue: RevueView,
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

/** Les trois halos flous en fond. Purement décoratifs (spec Partie 3). */
function Glow() {
  return (
    <>
      <div
        className="pointer-events-none absolute -right-[100px] -top-[140px] h-[460px] w-[460px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(255,61,139,0.13), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-[160px] -left-20 h-[440px] w-[440px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.11), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(255,198,61,0.07), transparent 70%)",
        }}
      />
    </>
  );
}

export function Shell() {
  return (
    <OsProvider>
      <div className="relative min-h-screen overflow-x-hidden">
        <Glow />
        <TopRail />
        <main className="relative z-[1] mx-auto max-w-[1500px] px-6 pb-[30px] pt-4">
          <ActiveView />
        </main>
      </div>
    </OsProvider>
  );
}
