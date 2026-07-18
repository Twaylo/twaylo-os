"use client";

import { dailyKey, readJSON, writeJSON } from "./storage";

/**
 * Nutrition (spec Miles Partie 5.5, adaptée).
 *
 * Le couplage bidirectionnel est le cœur de la carte :
 *   - tu corriges une macro  → les kcal se recalculent par la formule
 *   - tu corriges les kcal   → les macros se redistribuent à proportion
 *
 * La formule est exacte et locale : 4 kcal par gramme de protéine et de
 * glucide, 9 par gramme de lipide. Aucun appel réseau pour ça — seule
 * l'estimation d'un repas décrit en français demande l'IA.
 */

export type Repas = {
  id: string;
  /** Heure au format HH:MM, saisie ou déduite du moment de l'ajout. */
  t: string;
  /** Nom du repas tel que décrit. */
  n: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Vrai si les macros viennent d'une estimation IA plutôt que d'une saisie. */
  estimated: boolean;
};

export type Objectifs = {
  kcal: number;
  p: number;
  c: number;
  f: number;
};

/** Cibles par défaut, reprises de la maquette Miles. Éditables plus tard. */
export const OBJECTIFS_DEFAUT: Objectifs = { kcal: 2800, p: 180, c: 300, f: 80 };

export function kcalDepuisMacros(p: number, c: number, f: number): number {
  return Math.round(p * 4 + c * 4 + f * 9);
}

/**
 * Redistribue les macros pour atteindre une cible calorique en gardant leurs
 * proportions. Sert quand Twaylo corrige les kcal à la main.
 *
 * Si le repas est vide de macros, on retombe sur une répartition raisonnable
 * (30 % protéines / 40 % glucides / 30 % lipides) plutôt que de diviser par
 * zéro.
 */
export function redistribuerMacros(
  repas: Pick<Repas, "p" | "c" | "f">,
  kcalCible: number,
): { p: number; c: number; f: number } {
  const actuel = kcalDepuisMacros(repas.p, repas.c, repas.f);

  if (actuel <= 0) {
    return {
      p: Math.round((kcalCible * 0.3) / 4),
      c: Math.round((kcalCible * 0.4) / 4),
      f: Math.round((kcalCible * 0.3) / 9),
    };
  }

  const ratio = kcalCible / actuel;
  return {
    p: Math.round(repas.p * ratio),
    c: Math.round(repas.c * ratio),
    f: Math.round(repas.f * ratio),
  };
}

export function totaux(repas: Repas[]) {
  return repas.reduce(
    (acc, r) => ({
      kcal: acc.kcal + r.kcal,
      p: acc.p + r.p,
      c: acc.c + r.c,
      f: acc.f + r.f,
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

/* ---------- Persistance, datée sur le jour local ---------- */

export function lireRepas(): Repas[] {
  return readJSON<Repas[]>(dailyKey("nutrition"), []);
}

export function ecrireRepas(repas: Repas[]): void {
  writeJSON(dailyKey("nutrition"), repas);
}

/** Les N derniers jours, pour le tableau de l'onglet Santé. */
export function historique(jours: number): { jour: string; repas: Repas[] }[] {
  if (typeof window === "undefined") return [];
  const out: { jour: string; repas: Repas[] }[] = [];
  for (let i = 0; i < jours; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const cle = `twaylo-nutrition-${new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.NEXT_PUBLIC_USER_TIMEZONE ?? "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)}`;
    const repas = readJSON<Repas[]>(cle, []);
    if (repas.length > 0) out.push({ jour: cle.replace("twaylo-nutrition-", ""), repas });
  }
  return out;
}

/**
 * Estime les macros d'un repas décrit en français.
 * Passe par l'API pour que la clé Anthropic reste côté serveur.
 */
export async function estimerRepas(
  texte: string,
): Promise<{ n: string; kcal: number; p: number; c: number; f: number }> {
  const res = await fetch("/api/nutrition/estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texte }),
  });
  if (!res.ok) throw new Error(`Estimation impossible (${res.status})`);
  return res.json();
}
