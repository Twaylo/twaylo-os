"use client";

import { useEffect, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { localDateKey } from "@/lib/local-date";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import type { Skill } from "@/lib/types";

/**
 * SKILL — la progression façon RPG (esprit Solo Leveling).
 *
 * Chaque compétence a une maîtrise 0-100, d'où un rang (E→S) et une barre
 * d'XP. Un instantané par mois trace la montée : Twaylo voit, mois après mois,
 * de combien il a grimpé. Rien ne redescend tout seul — c'est lui qui règle.
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

/* Jeu de démonstration, pour filmer sans exposer la vraie progression. */
const DEMO: Skill[] = [
  { id: "d1", nom: "Anglais", categorie: "Langues", niveau: 74, historique: [{ mois: "2026-06", niveau: 68 }] },
  { id: "d2", nom: "Espagnol", categorie: "Langues", niveau: 41, historique: [{ mois: "2026-06", niveau: 33 }] },
  { id: "d3", nom: "Montage", categorie: "Création", niveau: 88, historique: [{ mois: "2026-06", niveau: 85 }] },
  { id: "d4", nom: "Storytelling", categorie: "Création", niveau: 62, historique: [{ mois: "2026-06", niveau: 51 }] },
  { id: "d5", nom: "Branding", categorie: "Création", niveau: 55, historique: [{ mois: "2026-06", niveau: 55 }] },
  { id: "d6", nom: "Financier", categorie: "Business", niveau: 38, historique: [{ mois: "2026-06", niveau: 30 }] },
  { id: "d7", nom: "Muscu", categorie: "Corps", niveau: 70, historique: [{ mois: "2026-06", niveau: 64 }] },
  { id: "d8", nom: "Physique", categorie: "Corps", niveau: 66, historique: [{ mois: "2026-06", niveau: 60 }] },
];

export function SkillView() {
  const { demoMode } = useOs();
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
          Chargement de tes compétences…
        </div>
      </Panel>
    );
  }

  const niveauGlobal = skills.length
    ? Math.round(skills.reduce((n, s) => n + s.niveau, 0) / skills.length)
    : 0;
  const rangGlobal = rangDe(niveauGlobal);

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
        subtitle="Ta montée en compétences, mois après mois — façon RPG."
      />

      {/* Le rang global — le « niveau du joueur ». */}
      <Panel
        accent={rangGlobal.couleur}
        className="flex items-center gap-[18px]"
        style={{ border: `1px solid ${rangGlobal.couleur}44` }}
      >
        <BadgeRang niveau={niveauGlobal} taille={64} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-black tracking-[0.14em] text-white/40">
            NIVEAU GLOBAL
          </div>
          <div className="font-mono text-[30px] font-black leading-none tracking-[-0.02em]">
            {niveauGlobal}
            <span className="ml-1 text-[15px] text-white/30">/ 100</span>
          </div>
          <div className="mt-[7px]">
            <BarreXp niveau={niveauGlobal} couleur={rangGlobal.couleur} />
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="font-mono text-[13px] font-black" style={{ color: rangGlobal.couleur }}>
            RANG {rangGlobal.rang}
          </div>
          <div className="text-[11px] text-white/35">{skills.length} compétences</div>
        </div>
      </Panel>

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

  return (
    <div
      className="group flex items-center gap-[11px] rounded-[12px] px-[11px] py-[9px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
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

      <div className="flex flex-none flex-col items-center gap-[3px]">
        <button
          type="button"
          onClick={() => onRegler(skill.niveau + 2)}
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
