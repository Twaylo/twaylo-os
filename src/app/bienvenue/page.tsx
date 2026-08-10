import Link from "next/link";

import { PROFILS } from "@/lib/sas";

export const metadata = {
  title: "Twaylo OS — ton système d'exploitation personnel",
  description:
    "Un tableau de bord qui tient ta journée, tes objectifs et ta progression. Construit pour toi en deux minutes.",
};

/**
 * La page publique.
 *
 * Pensée pour le pouce d'abord : une colonne, des blocs qu'on traverse en
 * défilant, un bouton d'action qui reste à portée. Le grand écran élargit la
 * grille sans rien réorganiser — l'inverse (dessiner large puis comprimer)
 * donne toujours une page mobile en pagaille.
 *
 * Composant serveur : aucune interaction, donc aucune raison d'envoyer du
 * JavaScript. C'est la page qui doit s'ouvrir le plus vite de tout le site.
 */

const PILIERS = [
  {
    emoji: "🗓️",
    titre: "Ta journée, écrite d'avance",
    texte:
      "Des blocs que tu coches. Pas une liste de tâches infinie : une journée qui a une forme, et qui se termine.",
  },
  {
    emoji: "🔥",
    titre: "Une série que tu ne veux pas casser",
    texte:
      "Chaque jour qui laisse une trace allonge le compteur. C'est bête, et c'est exactement ce qui fait revenir.",
  },
  {
    emoji: "📈",
    titre: "Tes compétences, en courbe",
    texte:
      "Tu te notes chaque semaine. Au bout de trois mois, tu vois enfin si ça monte — au lieu de le supposer.",
  },
  {
    emoji: "🧠",
    titre: "Tu parles, il range",
    texte:
      "Une idée en marchant, un vocal, et elle atterrit au bon endroit. Sans ouvrir l'application.",
  },
  {
    emoji: "📡",
    titre: "Marche sans réseau",
    texte:
      "Dans le métro, en avion, à l'étranger. Tu coches, ça part tout seul quand le signal revient.",
  },
  {
    emoji: "🔔",
    titre: "Il te relance, mais pas pour rien",
    texte:
      "Une notification seulement s'il manque vraiment quelque chose. Le reste du temps, silence.",
  },
];

export default function Bienvenue() {
  return (
    <div className="cadre-appli relative overflow-hidden">
      {/* Le halo, enfermé comme dans l'OS : il ne doit pas allonger la page. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -right-[120px] -top-[160px] h-[420px] w-[420px] rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(255,61,139,0.16), transparent 70%)" }}
        />
        <div
          className="absolute -left-[120px] top-[45%] h-[420px] w-[420px] rounded-full blur-[90px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.13), transparent 70%)" }}
        />
      </div>

      <main
        className="relative z-[1] mx-auto w-full max-w-[1100px] px-[22px] pb-[64px] pt-[42px]"
        style={{
          paddingLeft: "max(22px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(22px, env(safe-area-inset-right, 0px))",
          paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* ---------- L'accroche ---------- */}
        <header className="flex flex-col items-center text-center">
          <div className="flex items-center gap-[10px]">
            <div className="h-[38px] w-[38px] overflow-hidden rounded-[12px]">
              <svg width="38" height="38" viewBox="0 0 38 38" className="block">
                <defs>
                  <linearGradient id="accueilGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#ff3d8b" />
                    <stop offset="0.38" stopColor="#ffc63d" />
                    <stop offset="0.7" stopColor="#3ddc84" />
                    <stop offset="1" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <rect x="1" y="1" width="36" height="36" rx="11" fill="rgba(255,255,255,0.05)" />
                <path d="M14 11 L28 19 L14 27 Z" fill="url(#accueilGrad)" />
              </svg>
            </div>
            <span className="text-[21px] font-black tracking-[-0.02em]">twaylo os</span>
          </div>

          <h1 className="mt-[26px] max-w-[620px] text-[32px] font-black leading-[1.12] tracking-[-0.03em] sm:text-[46px]">
            Ton système d&apos;exploitation
            <span
              className="block bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--grad)" }}
            >
              personnel
            </span>
          </h1>

          <p className="mt-[16px] max-w-[520px] text-[14.5px] font-semibold leading-[1.55] text-white/55 sm:text-[16px]">
            Pas une application de plus. Un seul endroit qui tient ta journée, tes objectifs et ta
            progression — construit autour de <em className="not-italic text-white/80">ta</em> vie,
            en deux minutes.
          </p>

          <Link
            href="/demarrer"
            className="mt-[26px] flex min-h-[52px] items-center justify-center rounded-[14px] px-[26px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110"
            style={{ background: "var(--grad)", boxShadow: "0 14px 40px -18px rgba(255,61,139,0.8)" }}
          >
            Construire mon OS
          </Link>
          <span className="mt-[10px] text-[11.5px] font-bold text-white/30">
            Six questions. Aucune configuration à faire.
          </span>
        </header>

        {/* ---------- Le constat ---------- */}
        <section className="mt-[54px] text-center">
          <p className="mx-auto max-w-[560px] text-[16px] font-bold leading-[1.5] text-white/70 sm:text-[19px]">
            Tu as déjà une appli de notes, une de tâches, un carnet, un tableur, et trois bonnes
            résolutions.
            <span className="mt-[8px] block" style={{ color: "var(--color-mag-soft)" }}>
              Le problème n&apos;a jamais été le manque d&apos;outils.
            </span>
          </p>
        </section>

        {/* ---------- Les profils ---------- */}
        <section className="mt-[54px]">
          <h2 className="text-center text-[10.5px] font-black tracking-[0.16em] text-white/35">
            ÇA COMMENCE PAR QUI TU ES
          </h2>
          <p className="mx-auto mt-[8px] max-w-[460px] text-center text-[13px] font-semibold leading-[1.5] text-white/45">
            Un étudiant et un indépendant n&apos;ont pas la même journée. L&apos;OS ne leur en
            propose pas la même non plus.
          </p>

          <div className="mt-[22px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
            {PROFILS.map((p) => (
              <div
                key={p.id}
                className="panel-sm panel-hover"
                style={{ border: `1px solid ${p.couleur}2e` }}
              >
                <div className="flex items-center gap-[10px]">
                  <span className="text-[22px]">{p.emoji}</span>
                  <span className="text-[15px] font-black" style={{ color: p.couleur }}>
                    {p.titre}
                  </span>
                </div>
                <p className="mt-[7px] text-[12.5px] font-semibold leading-[1.45] text-white/50">
                  {p.accroche}
                </p>
                <div className="mt-[10px] flex flex-wrap gap-[5px]">
                  {p.promesses.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-[8px] py-[3px] text-[10px] font-bold text-white/45"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Ce que l'IA fait, concrètement ---------- */}
        <section className="mt-[54px]">
          <div
            className="panel"
            style={{
              border: "1px solid rgba(176,107,255,0.28)",
              background:
                "linear-gradient(160deg, rgba(176,107,255,0.09), rgba(255,255,255,0.02))",
            }}
          >
            <span
              className="text-[10px] font-black tracking-[0.14em]"
              style={{ color: "var(--color-vio-soft)" }}
            >
              ✦ CE QUE L&apos;IA CONSTRUIT
            </span>
            <h2 className="mt-[9px] text-[21px] font-black leading-[1.2] tracking-[-0.02em] sm:text-[26px]">
              Tu réponds. Elle monte l&apos;espace de travail.
            </h2>
            <p className="mt-[10px] max-w-[560px] text-[13.5px] font-semibold leading-[1.55] text-white/55">
              Pas un thème de couleurs : une journée type avec des horaires qui tiennent compte de
              ton rythme, des habitudes choisies pour ton obstacle à toi, des objectifs découpés en
              étapes, et les compétences à suivre. Prêt à l&apos;usage dès le premier matin.
            </p>

            <div className="mt-[16px] grid grid-cols-2 gap-[8px] sm:grid-cols-4">
              {[
                ["🗓️", "Journée type"],
                ["✅", "Habitudes"],
                ["🎯", "Objectifs"],
                ["📊", "Compétences"],
              ].map(([e, t]) => (
                <div key={t} className="subpanel px-[10px] py-[11px] text-center">
                  <div className="text-[19px]">{e}</div>
                  <div className="mt-[3px] text-[11px] font-black text-white/55">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Les piliers ---------- */}
        <section className="mt-[54px]">
          <h2 className="text-center text-[10.5px] font-black tracking-[0.16em] text-white/35">
            CE QU&apos;IL Y A DEDANS
          </h2>
          <div className="mt-[22px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
            {PILIERS.map((p) => (
              <div key={p.titre} className="panel-sm">
                <div className="text-[22px]">{p.emoji}</div>
                <div className="mt-[7px] text-[14px] font-black leading-[1.25]">{p.titre}</div>
                <p className="mt-[6px] text-[12.5px] font-semibold leading-[1.45] text-white/50">
                  {p.texte}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- L'appel final ---------- */}
        <section className="mt-[58px] flex flex-col items-center text-center">
          <h2 className="max-w-[480px] text-[24px] font-black leading-[1.18] tracking-[-0.02em] sm:text-[30px]">
            Ta première journée commence demain matin.
          </h2>
          <p className="mt-[10px] max-w-[420px] text-[13.5px] font-semibold leading-[1.5] text-white/50">
            Deux minutes maintenant, et elle sera déjà écrite quand tu ouvriras les yeux.
          </p>
          <Link
            href="/demarrer"
            className="mt-[22px] flex min-h-[52px] items-center justify-center rounded-[14px] px-[26px] text-[15px] font-black text-[#07121d] transition-all hover:brightness-110"
            style={{ background: "var(--grad)", boxShadow: "0 14px 40px -18px rgba(34,211,238,0.7)" }}
          >
            Construire mon OS
          </Link>
          <Link
            href="/login"
            className="mt-[14px] text-[12.5px] font-bold text-white/35 underline underline-offset-4 transition-colors hover:text-white/60"
          >
            J&apos;ai déjà un OS
          </Link>
        </section>
      </main>
    </div>
  );
}
