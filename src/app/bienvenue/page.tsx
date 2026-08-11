import type { Metadata } from "next";
import Link from "next/link";

import { Mascotte } from "@/components/Mascotte";
import { PROFILS } from "@/lib/sas";

export const metadata: Metadata = {
  title: "Twaylo OS — ton système d'exploitation personnel",
  description:
    "Ta journée, écrite d'avance. Coche, monte de niveau, recommence. Construit pour toi en deux minutes, gratuitement.",
  // La page d'entrée du produit : c'est celle-ci, et elle seule, qu'un moteur
  // doit trouver. Le reste du site reste fermé par le réglage de `layout`.
  robots: { index: true, follow: true },
  alternates: { canonical: "/bienvenue" },
};

/**
 * La page publique.
 *
 * Elle a été refaite dans la langue du sas : très peu d'éléments, du très gros
 * texte, un bouton plein pleine largeur, et le même compagnon qu'à l'ouverture
 * de l'application. La version précédente empilait huit piliers, six profils,
 * six questions et deux appels à l'action sur cinq mille pixels — chaque bloc
 * était juste, l'ensemble ne se lisait pas. Ce qui convainc n'est pas la
 * quantité d'arguments, c'est de comprendre en trois secondes ce que ça fait.
 *
 * Composant serveur, et il le reste : aucune interaction, donc aucune raison
 * d'envoyer du JavaScript. Le compagnon est du SVG animé en CSS, la foire aux
 * questions des `<details>` natifs.
 */

const ETAPES = [
  ["1", "Tu réponds", "Six écrans, une question par écran. Deux minutes, au pouce."],
  ["2", "L'IA monte ton espace", "Journée type, habitudes, objectifs, et les onglets qui te concernent."],
  ["3", "Tu coches", "Chaque jour laisse une trace. La série monte, le niveau suit."],
] as const;

const PILIERS = [
  ["🗓️", "Une journée qui a une forme", "Des blocs à cocher, pas une liste infinie. Elle se termine."],
  ["🔥", "Une série difficile à casser", "Un jour manqué ne l'efface pas : un gel prend le relais."],
  ["🎲", "Trois quêtes chaque matin", "Tirées du jour, jamais les mêmes. De quoi rouvrir l'appli à 21 h."],
  ["📡", "Marche sans réseau", "Métro, avion, étranger. Tu coches, ça part quand le signal revient."],
] as const;

const FAQ = [
  [
    "C'est encore une appli de to-do ?",
    "Non. Une liste de tâches donne l'inventaire de ta journée, pas sa forme. Ici la journée est écrite d'avance, et les tâches viennent se ranger dedans.",
  ],
  [
    "Et si ce qu'on me propose ne me va pas ?",
    "Tout se change, avant comme après : les horaires, les habitudes, les onglets, les cartes de l'accueil et leur ordre.",
  ],
  [
    "Qui voit mes données ?",
    "Toi. Chaque OS est isolé — ses journées, ses tâches, ses objectifs n'appartiennent qu'à lui.",
  ],
  [
    "Si j'oublie un jour, je perds ma série ?",
    "Non. Tu gagnes un gel tous les sept jours ; il se pose tout seul sur le jour manqué quand tu reviens.",
  ],
] as const;

const BLEU = "#4f9cff";

export default function Bienvenue() {
  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -right-[130px] -top-[170px] h-[430px] w-[430px] rounded-full blur-[90px]"
          style={{ background: `radial-gradient(circle, ${BLEU}26, transparent 70%)` }}
        />
        <div
          className="absolute -left-[140px] top-[52%] h-[420px] w-[420px] rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent 70%)" }}
        />
      </div>

      <main
        className="relative z-[1] mx-auto w-full max-w-[560px] px-[20px] pb-[56px] pt-[26px]"
        style={{
          paddingLeft: "max(20px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(20px, env(safe-area-inset-right, 0px))",
          paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* ---------- L'accroche : le compagnon, le nom, la promesse ---------- */}
        <header className="flex flex-col items-center pt-[30px] text-center">
          <Mascotte humeur="salut" couleur={BLEU} taille={132} />
          <h1 className="mt-[22px] text-[42px] font-black leading-[1] tracking-[-0.045em] sm:text-[54px]">
            twaylo os
          </h1>
          <p className="mt-[14px] max-w-[330px] text-[17px] font-bold leading-[1.35] text-white/60">
            Ta journée, écrite d&apos;avance. Coche, monte de niveau, recommence.
          </p>

          <Link
            href="/demarrer"
            className="sas-bouton mt-[26px]"
            style={{ background: BLEU, boxShadow: "0 5px 0 0 #2f6fd0" }}
          >
            Créer mon OS — gratuit
          </Link>
          <Link href="/login" className="sas-bouton sas-bouton-2 mt-[10px]">
            J&apos;ai déjà un OS
          </Link>
          <span className="mt-[12px] text-[12px] font-bold text-white/30">
            Deux minutes. Pas de carte bancaire.
          </span>
        </header>

        {/* ---------- Trois étapes ---------- */}
        <section className="mt-[56px] flex flex-col gap-[10px]">
          {ETAPES.map(([n, titre, texte]) => (
            <div
              key={n}
              className="flex items-start gap-[14px] rounded-[18px] px-[16px] py-[15px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-[15px] font-black text-[#07121d]"
                style={{ background: BLEU }}
              >
                {n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-black leading-[1.2]">{titre}</span>
                <span className="mt-[4px] block text-[13.5px] font-semibold leading-[1.4] text-white/45">
                  {texte}
                </span>
              </span>
            </div>
          ))}
        </section>

        {/* ---------- Pour qui ---------- */}
        <section className="mt-[52px]">
          <h2 className="text-center text-[24px] font-black leading-[1.15] tracking-[-0.03em]">
            Ça commence par qui tu es.
          </h2>
          <p className="mx-auto mt-[9px] max-w-[340px] text-center text-[13.5px] font-semibold leading-[1.4] text-white/40">
            Un étudiant et un indépendant n&apos;ont pas la même journée. Ils n&apos;ont pas
            le même OS non plus.
          </p>
          <div className="mt-[18px] flex flex-wrap justify-center gap-[7px]">
            {PROFILS.map((p) => (
              <span
                key={p.id}
                className="rounded-full px-[13px] py-[9px] text-[13.5px] font-extrabold"
                style={{ color: p.couleur, background: `${p.couleur}18` }}
              >
                {p.emoji} {p.titre}
              </span>
            ))}
          </div>
        </section>

        {/* ---------- Ce qu'il y a dedans ---------- */}
        <section className="mt-[52px] flex flex-col gap-[10px]">
          {PILIERS.map(([emoji, titre, texte]) => (
            <div
              key={titre}
              className="flex items-start gap-[14px] rounded-[18px] px-[16px] py-[15px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span className="text-[26px] leading-none">{emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-black leading-[1.2]">{titre}</span>
                <span className="mt-[4px] block text-[13.5px] font-semibold leading-[1.4] text-white/45">
                  {texte}
                </span>
              </span>
            </div>
          ))}
        </section>

        {/* ---------- Le prix ---------- */}
        <section className="mt-[52px] text-center">
          <div className="text-[64px] font-black leading-[1] tracking-[-0.04em]">0 €</div>
          <p className="mx-auto mt-[12px] max-w-[330px] text-[14px] font-semibold leading-[1.45] text-white/50">
            Tout est ouvert. Pas de carte bancaire, pas d&apos;essai qui se termine, pas de
            publicité.
          </p>
        </section>

        {/* ---------- Les questions ---------- */}
        <section className="mt-[52px] flex flex-col gap-[8px]">
          {/*
            Des `<details>` natifs, pas un accordéon en JavaScript : le
            navigateur sait faire, et la page reste à zéro script.
          */}
          {FAQ.map(([q, r]) => (
            <details
              key={q}
              className="rounded-[18px] px-[16px] py-[14px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14.5px] font-black leading-[1.3]">
                {q}
                <span className="chevron-section flex-none text-[17px] text-white/25">›</span>
              </summary>
              <p className="mt-[9px] text-[13.5px] font-semibold leading-[1.5] text-white/45">{r}</p>
            </details>
          ))}
        </section>

        {/* ---------- L'appel final ---------- */}
        <section className="mt-[56px] flex flex-col items-center text-center">
          <h2 className="max-w-[340px] text-[27px] font-black leading-[1.15] tracking-[-0.03em]">
            Ta première journée commence demain matin.
          </h2>
          <Link
            href="/demarrer"
            className="sas-bouton mt-[22px]"
            style={{ background: BLEU, boxShadow: "0 5px 0 0 #2f6fd0" }}
          >
            Créer mon OS — gratuit
          </Link>
        </section>
      </main>
    </div>
  );
}
