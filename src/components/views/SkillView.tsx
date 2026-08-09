"use client";

import { useEffect, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { useProgression } from "@/lib/progression-context";
import { localDateKey } from "@/lib/local-date";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { Eclats } from "@/components/ui";
import type { Skill } from "@/lib/types";

/**
 * SKILL — la fenêtre de statut, façon Solo Leveling.
 *
 * Chaque compétence a une maîtrise 0-100, d'où un rang (E→S) et une barre
 * d'XP. Un instantané par mois trace la montée : Twaylo voit, mois après mois,
 * de combien il a grimpé. Rien ne redescend tout seul — c'est lui qui règle.
 *
 * La vue est construite comme le jeu : une fenêtre de statut (rang global,
 * titre, radar des domaines), les quêtes d'entraînement que « le Système »
 * recommande (les compétences les plus faibles), puis l'arbre de compétences.
 * Franchir un rang déclenche l'annonce — c'est rare, donc c'est spectaculaire.
 */

const RANGS = [
  { min: 90, rang: "S", couleur: "#ffd23d" },
  { min: 72, rang: "A", couleur: "#ff3d8b" },
  { min: 54, rang: "B", couleur: "#b06bff" },
  { min: 36, rang: "C", couleur: "#22d3ee" },
  { min: 18, rang: "D", couleur: "#3ddc84" },
  { min: 0, rang: "E", couleur: "rgba(255,255,255,0.45)" },
] as const;

function rangDe(niveau: number) {
  return RANGS.find((r) => niveau >= r.min) ?? RANGS[RANGS.length - 1];
}

/** Le prochain palier à franchir, ou null au rang S. */
function prochainRang(niveau: number) {
  return [...RANGS].reverse().find((r) => r.min > niveau) ?? null;
}

/** Le titre du chasseur — l'échelle de Solo Leveling, en français. */
const TITRES: Record<string, string> = {
  E: "Éveillé",
  D: "Chasseur confirmé",
  C: "Chasseur d'élite",
  B: "Maître chasseur",
  A: "Rang national",
  S: "Monarque",
};

const ORDRE_CAT = ["Langues", "Création", "Business", "Corps", "Autre"];

function borner(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function moisCourant(): string {
  return localDateKey().slice(0, 7);
}

/** Met à jour (ou crée) l'instantané du mois courant dans l'historique. */
function majMois(historique: Skill["historique"], mois: string, niveau: number) {
  return [...historique.filter((h) => h.mois !== mois), { mois, niveau }].sort((a, b) =>
    a.mois.localeCompare(b.mois),
  );
}

/** Ce qui a été gagné depuis le dernier mois enregistré, ou null si nouveau. */
function progressionMois(s: Skill): number | null {
  const mois = moisCourant();
  const anterieurs = s.historique.filter((h) => h.mois < mois);
  if (anterieurs.length === 0) return null;
  return s.niveau - anterieurs[anterieurs.length - 1].niveau;
}

/* Jeu de démonstration, pour filmer sans exposer la vraie progression.
   L'historique est fourni sur plusieurs mois pour que les courbes vivent. */
const DEMO: Skill[] = [
  { id: "d1", nom: "Anglais", categorie: "Langues", niveau: 74, historique: [{ mois: "2026-03", niveau: 58 }, { mois: "2026-04", niveau: 62 }, { mois: "2026-05", niveau: 65 }, { mois: "2026-06", niveau: 68 }, { mois: "2026-07", niveau: 74 }] },
  { id: "d2", nom: "Espagnol", categorie: "Langues", niveau: 41, historique: [{ mois: "2026-04", niveau: 25 }, { mois: "2026-05", niveau: 30 }, { mois: "2026-06", niveau: 33 }, { mois: "2026-07", niveau: 41 }] },
  { id: "d3", nom: "Montage", categorie: "Création", niveau: 88, historique: [{ mois: "2026-03", niveau: 80 }, { mois: "2026-05", niveau: 83 }, { mois: "2026-06", niveau: 85 }, { mois: "2026-07", niveau: 88 }] },
  { id: "d4", nom: "Storytelling", categorie: "Création", niveau: 62, historique: [{ mois: "2026-04", niveau: 44 }, { mois: "2026-05", niveau: 48 }, { mois: "2026-06", niveau: 51 }, { mois: "2026-07", niveau: 62 }] },
  { id: "d5", nom: "Branding", categorie: "Création", niveau: 55, historique: [{ mois: "2026-05", niveau: 50 }, { mois: "2026-06", niveau: 55 }] },
  { id: "d6", nom: "Discipline", categorie: "Business", niveau: 47, historique: [{ mois: "2026-05", niveau: 34 }, { mois: "2026-06", niveau: 40 }, { mois: "2026-07", niveau: 47 }] },
  { id: "d7", nom: "Muscu", categorie: "Corps", niveau: 70, historique: [{ mois: "2026-03", niveau: 55 }, { mois: "2026-04", niveau: 60 }, { mois: "2026-05", niveau: 62 }, { mois: "2026-06", niveau: 64 }, { mois: "2026-07", niveau: 70 }] },
  { id: "d8", nom: "Physique", categorie: "Corps", niveau: 66, historique: [{ mois: "2026-05", niveau: 58 }, { mois: "2026-06", niveau: 60 }, { mois: "2026-07", niveau: 66 }] },
];

export function SkillView() {
  const { demoMode, data } = useOs();
  // Même compteur de série que le reste de l'OS (voir OperateurCard).
  const { serie: serieVive, pret: progressionPrete } = useProgression();
  const serie = !demoMode && progressionPrete ? serieVive : data.operator.streakDays;
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [nouvelle, setNouvelle] = useState<Record<string, string>>({});
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compteur = useRef(0);

  useEffect(() => {
    if (demoMode) {
      setSkills(DEMO);
      return;
    }
    let annule = false;
    void fetch("/api/skills")
      .then((r) => r.json())
      .then((d) => {
        if (!annule) setSkills(Array.isArray(d.skills) ? d.skills : []);
      })
      .catch((err) => {
        console.error("[skills] lecture impossible :", err);
        if (!annule) setSkills([]);
      });
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /** Écrit à l'écran tout de suite, la base suit (débouncée). */
  function appliquer(next: Skill[]) {
    setSkills(next);
    if (demoMode) return;
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      void fetch("/api/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skills: next }),
      }).catch((err) => console.error("[skills] enregistrement impossible :", err));
    }, 600);
  }

  function reglerNiveau(id: string, niveau: number) {
    if (!skills) return;
    const n = borner(niveau);
    const mois = moisCourant();
    appliquer(
      skills.map((s) =>
        s.id === id ? { ...s, niveau: n, historique: majMois(s.historique, mois, n) } : s,
      ),
    );
  }

  function ajouter(categorie: string) {
    const propre = (nouvelle[categorie] ?? "").trim();
    if (!propre || !skills) return;
    const skill: Skill = {
      id: `nouv-${compteur.current++}-${propre.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}`,
      nom: propre.slice(0, 60),
      categorie,
      niveau: 0,
      historique: [],
    };
    appliquer([...skills, skill]);
    setNouvelle((p) => ({ ...p, [categorie]: "" }));
  }

  function supprimer(id: string) {
    if (!skills) return;
    appliquer(skills.filter((s) => s.id !== id));
  }

  if (skills === null) {
    return (
      <Panel accent="var(--color-vio)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Ouverture de la fenêtre de statut…
        </div>
      </Panel>
    );
  }

  // Catégories dans l'ordre voulu, puis toute autre dans l'ordre d'apparition.
  const cats = [...new Set(skills.map((s) => s.categorie))].sort((a, b) => {
    const ia = ORDRE_CAT.indexOf(a);
    const ib = ORDRE_CAT.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  // On veut aussi pouvoir ajouter dans les catégories par défaut même vides.
  for (const c of ORDRE_CAT) if (c !== "Autre" && !cats.includes(c)) cats.push(c);

  return (
    <div className="flex flex-col gap-[14px]">
      <ViewHeader
        title="Skill"
        subtitle="Ta fenêtre de statut — le Système suit ta montée, mois après mois."
      />

      <FenetreStatut skills={skills} serie={serie} />
      <QuetesEntrainement skills={skills} />

      {cats.map((cat) => {
        const items = skills
          .filter((s) => s.categorie === cat)
          .sort((a, b) => b.niveau - a.niveau);
        return (
          <Panel key={cat} accent="var(--color-vio)" size="sm">
            <div
              className="mb-[10px] text-[10px] font-black tracking-[0.12em]"
              style={{ color: "var(--color-vio-soft)" }}
            >
              {cat.toUpperCase()}
            </div>

            <div className="flex flex-col gap-[8px]">
              {items.map((s) => (
                <CarteSkill
                  key={s.id}
                  skill={s}
                  onRegler={(n) => reglerNiveau(s.id, n)}
                  onSupprimer={() => supprimer(s.id)}
                />
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ajouter(cat);
              }}
              className="mt-[9px]"
            >
              <input
                value={nouvelle[cat] ?? ""}
                onChange={(e) => setNouvelle((p) => ({ ...p, [cat]: e.target.value }))}
                placeholder={`+ compétence ${cat.toLowerCase()}`}
                aria-label={`Ajouter une compétence — ${cat}`}
                className="w-full rounded-[8px] px-[9px] py-[6px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px dashed rgba(255,255,255,0.13)",
                }}
              />
            </form>
          </Panel>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* La fenêtre de statut — rang global, titre, radar des domaines       */
/* ================================================================== */

function FenetreStatut({ skills, serie }: { skills: Skill[]; serie: number }) {
  const niveauGlobal = skills.length
    ? Math.round(skills.reduce((n, s) => n + s.niveau, 0) / skills.length)
    : 0;
  const rangGlobal = rangDe(niveauGlobal);
  const suivant = prochainRang(niveauGlobal);

  // La progression totale du mois : la somme de ce qui a bougé.
  const deltas = skills
    .map(progressionMois)
    .filter((d): d is number => d !== null && d !== 0);
  const progresMois = deltas.reduce((n, d) => n + d, 0);

  // Moyenne par domaine, pour le radar — l'équivalent des stats FOR/AGI/INT.
  const parCat = new Map<string, number[]>();
  for (const s of skills) {
    parCat.set(s.categorie, [...(parCat.get(s.categorie) ?? []), s.niveau]);
  }
  const axes = [...parCat.entries()]
    .map(([nom, niveaux]) => ({
      nom,
      valeur: Math.round(niveaux.reduce((a, b) => a + b, 0) / niveaux.length),
    }))
    .sort((a, b) => {
      const ia = ORDRE_CAT.indexOf(a.nom);
      const ib = ORDRE_CAT.indexOf(b.nom);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .slice(0, 6);

  return (
    <Panel
      accent={rangGlobal.couleur}
      className="flex flex-wrap items-center gap-x-[26px] gap-y-[16px]"
      style={{ border: `1px solid ${rangGlobal.couleur}44` }}
    >
      {/* Le halo du rang, purement décoratif. */}
      <div
        className="pointer-events-none absolute -left-10 -top-10 h-[180px] w-[180px] rounded-full blur-[70px]"
        style={{ background: `${rangGlobal.couleur}22` }}
        aria-hidden
      />

      <div className="flex min-w-[240px] flex-1 items-center gap-[18px]">
        <BadgeRang niveau={niveauGlobal} taille={72} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black tracking-[0.16em] text-white/40">
            FENÊTRE DE STATUT
          </div>
          <div className="flex flex-wrap items-baseline gap-x-[10px]">
            <span className="font-mono text-[32px] font-black leading-[1.15] tracking-[-0.02em]">
              {niveauGlobal}
              <span className="ml-1 text-[15px] text-white/30">/ 100</span>
            </span>
            <span
              className="text-[12.5px] font-black tracking-[0.04em]"
              style={{ color: rangGlobal.couleur, textShadow: `0 0 12px ${rangGlobal.couleur}66` }}
            >
              TITRE : {TITRES[rangGlobal.rang]}
            </span>
          </div>
          <div className="mt-[7px]">
            <BarreXp niveau={niveauGlobal} couleur={rangGlobal.couleur} />
          </div>
          <div className="mt-[8px] flex flex-wrap gap-x-[16px] gap-y-[4px]">
            <StatStatut
              label="PROGRESSION DU MOIS"
              valeur={progresMois > 0 ? `+${progresMois}` : String(progresMois)}
              couleur={progresMois >= 0 ? "var(--color-ver-soft)" : "var(--color-mag-soft)"}
            />
            <StatStatut label="COMPÉTENCES" valeur={String(skills.length)} />
            <StatStatut label="SÉRIE" valeur={`${serie} j`} />
            {suivant && (
              <StatStatut
                label={`RANG ${suivant.rang} DANS`}
                valeur={`${suivant.min - niveauGlobal} pts`}
                couleur={suivant.couleur}
              />
            )}
          </div>
        </div>
      </div>

      {axes.length >= 3 && (
        <div className="flex flex-none flex-col items-center gap-[2px]">
          <RadarDomaines axes={axes} couleur={rangGlobal.couleur} />
          <div className="text-[8.5px] font-black tracking-[0.14em] text-white/25">
            ÉQUILIBRE DES DOMAINES
          </div>
        </div>
      )}
    </Panel>
  );
}

function StatStatut({
  label,
  valeur,
  couleur,
}: {
  label: string;
  valeur: string;
  couleur?: string;
}) {
  return (
    <div className="leading-[1.25]">
      <div className="text-[8.5px] font-black tracking-[0.12em] text-white/30">{label}</div>
      <div className="font-mono text-[13px] font-black" style={couleur ? { color: couleur } : undefined}>
        {valeur}
      </div>
    </div>
  );
}

/**
 * Le radar des domaines — la lecture d'un coup d'œil de ce qui est fort et de
 * ce qui traîne. SVG à la main : trois polygones de grille, la surface, et un
 * point par sommet. Les angles partent du haut et tournent dans le sens
 * horaire ; tout est déterministe, donc aucune divergence d'hydratation.
 */
function RadarDomaines({
  axes,
  couleur,
}: {
  axes: { nom: string; valeur: number }[];
  couleur: string;
}) {
  const C = 70;
  const R = 46;
  const point = (i: number, portee: number) => {
    const angle = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return `${C + Math.cos(angle) * R * portee},${C + Math.sin(angle) * R * portee}`;
  };
  const surface = axes.map((a, i) => point(i, Math.max(a.valeur, 4) / 100)).join(" ");

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Radar des domaines">
      {[1, 2 / 3, 1 / 3].map((portee) => (
        <polygon
          key={portee}
          points={axes.map((_, i) => point(i, portee)).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, i) => (
        <line
          key={i}
          x1={C}
          y1={C}
          x2={point(i, 1).split(",")[0]}
          y2={point(i, 1).split(",")[1]}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}
      <polygon
        points={surface}
        fill={`color-mix(in srgb, ${couleur} 22%, transparent)`}
        stroke={couleur}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {axes.map((a, i) => {
        const [x, y] = point(i, Math.max(a.valeur, 4) / 100).split(",");
        return <circle key={a.nom} cx={x} cy={y} r="2.4" fill={couleur} />;
      })}
      {axes.map((a, i) => {
        const angle = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        const lx = C + Math.cos(angle) * (R + 13);
        const ly = C + Math.sin(angle) * (R + 13);
        return (
          <text
            key={a.nom}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.45)"
            fontSize="7.5"
            fontWeight="800"
            letterSpacing="0.08em"
          >
            {a.nom.toUpperCase().slice(0, 8)}
          </text>
        );
      })}
    </svg>
  );
}

/* ================================================================== */
/* Les quêtes d'entraînement — ce que le Système recommande            */
/* ================================================================== */

function QuetesEntrainement({ skills }: { skills: Skill[] }) {
  /*
   * Les trois compétences les plus basses : c'est là que chaque point est le
   * moins cher et rapporte le plus au niveau global. Le rang S est exclu —
   * il n'y a plus de quête au sommet.
   */
  const quetes = [...skills]
    .filter((s) => s.niveau < 90)
    .sort((a, b) => a.niveau - b.niveau)
    .slice(0, 3);

  if (quetes.length === 0) return null;

  return (
    <Panel accent="var(--color-amb)" size="sm">
      <div
        className="mb-[9px] text-[10px] font-black tracking-[0.12em]"
        style={{ color: "var(--color-amb-soft)" }}
      >
        QUÊTES D&apos;ENTRAÎNEMENT — LE SYSTÈME RECOMMANDE
      </div>
      <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-3">
        {quetes.map((s) => {
          const r = rangDe(s.niveau);
          const suivant = prochainRang(s.niveau);
          const prog = progressionMois(s);
          return (
            <div
              key={s.id}
              className="subpanel flex items-center gap-[10px] px-[11px] py-[9px]"
            >
              <BadgeRang niveau={s.niveau} taille={32} />
              <div className="min-w-0 flex-1 leading-[1.3]">
                <div className="truncate text-[12.5px] font-extrabold">{s.nom}</div>
                <div className="text-[10px] font-bold text-white/40">
                  {suivant ? (
                    <>
                      <span style={{ color: suivant.couleur }}>
                        +{suivant.min - s.niveau} pts
                      </span>{" "}
                      → rang {suivant.rang}
                    </>
                  ) : (
                    "au sommet"
                  )}
                  {prog === 0 && s.historique.length > 1 && (
                    <span className="text-white/30"> · en sommeil ce mois</span>
                  )}
                </div>
              </div>
              <span className="font-mono text-[13px] font-black" style={{ color: r.couleur }}>
                {s.niveau}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function BadgeRang({ niveau, taille = 40 }: { niveau: number; taille?: number }) {
  const r = rangDe(niveau);
  return (
    <div
      className="flex flex-none items-center justify-center rounded-[14px] font-mono font-black"
      style={{
        width: taille,
        height: taille,
        fontSize: taille * 0.5,
        color: r.couleur,
        background: `radial-gradient(circle at 50% 35%, ${r.couleur}33, transparent 70%)`,
        border: `2px solid ${r.couleur}`,
        boxShadow: `0 0 18px -4px ${r.couleur}`,
        textShadow: `0 0 10px ${r.couleur}`,
      }}
    >
      {r.rang}
    </div>
  );
}

function BarreXp({ niveau, couleur }: { niveau: number; couleur: string }) {
  return (
    <div
      className="h-[7px] w-full overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${niveau}%`,
          background: `linear-gradient(90deg, ${couleur}99, ${couleur})`,
          boxShadow: `0 0 10px -1px ${couleur}`,
        }}
      />
    </div>
  );
}

/** La trajectoire des derniers mois, en mini-barres. Le présent est plein. */
function Trajectoire({ skill, couleur }: { skill: Skill; couleur: string }) {
  const points = skill.historique.slice(-8);
  if (points.length < 2) return null;
  return (
    <div
      className="hidden h-[20px] items-end gap-[2px] sm:flex"
      title={points.map((p) => `${p.mois} : ${p.niveau}`).join(" · ")}
      aria-hidden
    >
      {points.map((p, i) => (
        <span
          key={p.mois}
          className="w-[4px] rounded-t-[1.5px]"
          style={{
            height: `${Math.max(12, p.niveau)}%`,
            background:
              i === points.length - 1
                ? couleur
                : `color-mix(in srgb, ${couleur} 35%, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

function CarteSkill({
  skill,
  onRegler,
  onSupprimer,
}: {
  skill: Skill;
  onRegler: (niveau: number) => void;
  onSupprimer: () => void;
}) {
  const r = rangDe(skill.niveau);
  const prog = progressionMois(skill);

  /*
   * L'annonce de montée de rang. On compare le rang au rendu précédent :
   * si le seuil vient d'être franchi vers le haut, l'annonce se joue une
   * fois. Jamais au premier rendu (sinon toute la liste s'illumine au
   * chargement), jamais à la descente — on ne célèbre pas une correction.
   */
  const [montee, setMontee] = useState<string | null>(null);
  const [xp, setXp] = useState<{ delta: number; cle: number } | null>(null);
  const rangPrecedent = useRef<number | null>(null);

  useEffect(() => {
    const avant = rangPrecedent.current;
    rangPrecedent.current = r.min;
    if (avant === null || r.min <= avant) return;
    setMontee(r.rang);
    const t = setTimeout(() => setMontee(null), 1500);
    return () => clearTimeout(t);
  }, [r.min, r.rang]);

  function reglerAvecXp(niveau: number, delta: number) {
    onRegler(niveau);
    if (delta > 0) setXp({ delta, cle: (xp?.cle ?? 0) + 1 });
  }

  return (
    <div
      className="group relative flex items-center gap-[11px] overflow-hidden rounded-[12px] px-[11px] py-[9px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {montee && (
        <>
          <span
            className="lueur-rang"
            aria-hidden
            style={{ boxShadow: `inset 0 0 0 2px ${r.couleur}, inset 0 0 26px -6px ${r.couleur}` }}
          />
          <span
            className="rang-up rounded-[10px] px-[14px] py-[5px] font-mono text-[15px] font-black tracking-[0.08em]"
            style={{
              color: "#07121d",
              background: r.couleur,
              boxShadow: `0 0 26px 2px ${r.couleur}88`,
            }}
          >
            RANG {montee} !
          </span>
          <Eclats nombre={14} portee={70} />
        </>
      )}

      <BadgeRang niveau={skill.niveau} taille={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-extrabold">{skill.nom}</span>
          <span className="flex flex-none items-center gap-[7px]">
            {prog !== null && prog !== 0 && (
              <span
                className="font-mono text-[10px] font-black"
                style={{ color: prog > 0 ? "var(--color-ver-soft)" : "var(--color-mag-soft)" }}
              >
                {prog > 0 ? "+" : ""}
                {prog} ce mois
              </span>
            )}
            <Trajectoire skill={skill} couleur={r.couleur} />
            <span className="font-mono text-[12px] font-black" style={{ color: r.couleur }}>
              {skill.niveau}
            </span>
          </span>
        </div>

        <div className="mt-[6px]">
          <BarreXp niveau={skill.niveau} couleur={r.couleur} />
        </div>

        {/* Le curseur pour régler la maîtrise — c'est le geste de progression. */}
        <input
          type="range"
          min={0}
          max={100}
          value={skill.niveau}
          onChange={(e) => onRegler(Number(e.target.value))}
          aria-label={`Niveau de ${skill.nom}`}
          className="mt-[7px] w-full cursor-pointer"
          style={{ accentColor: r.couleur }}
        />
      </div>

      <div className="relative flex flex-none flex-col items-center gap-[3px]">
        {xp && (
          <span
            key={xp.cle}
            className="xp-flottant font-mono text-[10.5px] font-black"
            style={{ color: r.couleur, textShadow: `0 0 8px ${r.couleur}` }}
            aria-hidden
          >
            +{xp.delta} XP
          </span>
        )}
        <button
          type="button"
          onClick={() => reglerAvecXp(skill.niveau + 2, 2)}
          title="Gagner de l'XP (+2)"
          aria-label={`Gagner de l'XP sur ${skill.nom}`}
          className="cursor-pointer rounded-[6px] px-[7px] py-[1px] text-[12px] font-black transition-all hover:brightness-125"
          style={{ color: "#07121d", background: r.couleur }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onRegler(skill.niveau - 2)}
          title="Corriger (-2)"
          aria-label={`Baisser ${skill.nom}`}
          className="cursor-pointer rounded-[6px] px-[7px] py-[1px] text-[12px] font-black text-white/45 transition-all hover:text-white/80"
          style={{ background: "rgba(255,255,255,0.07)" }}
        >
          −
        </button>
        <button
          type="button"
          onClick={onSupprimer}
          title={`Retirer ${skill.nom}`}
          aria-label={`Retirer ${skill.nom}`}
          className="cursor-pointer px-[7px] text-[11px] font-black text-white/15 opacity-0 transition-all hover:text-[color:var(--color-mag-soft)] group-hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
