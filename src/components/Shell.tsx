"use client";

import { OsProvider, useOs } from "@/lib/os-context";
import { ProgressionProvider } from "@/lib/progression-context";
import { Recompense } from "@/components/Recompense";
import { Filet } from "@/components/Filet";
import { TopRail } from "@/components/TopRail";
import { MauvaiseAdresse } from "@/components/MauvaiseAdresse";
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
   * Le filet porte l'onglet en clé : changer d'onglet le remet à neuf.
   *
   * Sans cette clé, un onglet tombé laisserait son message d'erreur en place
   * pour tous les suivants — le filet deviendrait lui-même l'impasse qu'il
   * doit éviter.
   */
  /*
   * La `key` est sur le FILET, pas sur la vue.
   *
   * Sur la vue, elle rejouait l'animation d'entrée à chaque clic : 320 ms
   * d'attente avant que le contenu se pose, une sensation de saccade. Sur le
   * filet, elle ne sert qu'à remettre le garde-fou à neuf quand on change
   * d'onglet — sans quoi un onglet tombé laisserait son message d'erreur en
   * place pour tous les suivants, et le filet deviendrait lui-même l'impasse
   * qu'il doit éviter. La navigation reste instantanée.
   */
  return (
    <Filet key={activeTab} nom={activeTab}>
      <View />
    </Filet>
  );
}

/**
 * Les trois halos flous en fond. Purement décoratifs (spec Partie 3).
 * Leurs couleurs viennent des variables `--halo-N`, posées sur la racine par
 * l'ambiance choisie dans « Personnaliser » — les valeurs par défaut vivent
 * dans globals.css.
 *
 * Ils sont enfermés dans un cadre qui les coupe, et c'est tout l'enjeu.
 *
 * Les trois halos sont posés en débordement volontaire : 100 px à droite,
 * 80 px à gauche, 140 px au-dessus, 160 px SOUS la page. Sans ce cadre, ces
 * débordements agrandissent la zone défilable du document — 160 px de
 * défilement fantôme en bas de CHAQUE onglet, du vide qu'un premier geste
 * consomme avant que la page ne bouge vraiment. C'était aussi la seule
 * raison pour laquelle le `<body>` portait un `overflow-x`, lequel peut, sur
 * WebKit, transformer le corps de page en zone défilante imbriquée.
 *
 * Le cadre est `absolute inset-0` : il épouse exactement la page, ne
 * s'ajoute donc jamais à sa hauteur, et `overflow-hidden` rogne ce qui
 * dépasse. Ce qui est rogné n'était de toute façon pas visible — le rendu à
 * l'écran est identique au pixel près.
 */
function Glow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -right-[100px] -top-[140px] h-[460px] w-[460px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-1), transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-[160px] -left-20 h-[440px] w-[440px] rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-2), transparent 70%)",
        }}
      />
      <div
        className="absolute left-1/2 top-[38%] h-[380px] w-[380px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--halo-3), transparent 70%)",
        }}
      />
    </div>
  );
}

export function Shell() {
  return (
    <OsProvider>
      <ProgressionProvider>
        {/*
          Aucun `overflow` ici, et c'est délibéré.

          Ce cadre en portait un pour rogner les halos du fond. Ce sont
          désormais les halos qui se rognent eux-mêmes (voir `Glow`), si bien
          qu'il ne reste plus une seule déclaration d'`overflow` entre la
          fenêtre et le contenu : la fenêtre est l'unique zone défilante, dans
          tous les navigateurs, sans dépendre de la façon dont chacun
          interprète `clip` ou propage la valeur du corps de page.

          `cadre-appli` remplace `min-h-screen` : voir globals.css — `100vh`
          ment sur iPhone.
        */}
        <div className="cadre-appli relative">
          <Glow />
          <TopRail />
          <MauvaiseAdresse />
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
