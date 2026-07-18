"use client";

import { localDateKey } from "./local-date";

/**
 * Persistance navigateur.
 *
 * Sert deux buts :
 *  1. aujourd'hui, c'est la seule mémoire de l'OS ;
 *  2. demain, ce sera le cache local devant Supabase — la spec Partie 6 le
 *     prévoit explicitement pour les habitudes (« cache localStorage pour un
 *     retour instantané, sync Supabase à chaque clic »).
 *
 * Les formes stockées sont donc déjà celles des colonnes Supabase, pour que
 * le branchement de l'étape suivante soit une greffe et non une réécriture.
 */

const PREFIX = "twaylo";

export const KEYS = {
  demo: `${PREFIX}-demo-mode`,
  captures: `${PREFIX}-captures`,
  tasks: `${PREFIX}-tasks-done`,
} as const;

/**
 * Clé datée sur le jour LOCAL de Twaylo, jamais sur UTC.
 *
 * C'est la parade au bug 2 de la spec Partie 10 : avec une clé UTC, les
 * habitudes se remettraient à zéro à 2h du matin en été à Paris. Ici le
 * changement de clé se fait à minuit chez lui, donc la remise à zéro
 * quotidienne est automatique et correcte — il n'y a aucun code de reset.
 */
export function dailyKey(base: string): string {
  return `${PREFIX}-${base}-${localDateKey()}`;
}

/** Lecture tolérante : une valeur corrompue ne doit jamais casser l'app. */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch (err) {
    console.error(`[storage] lecture impossible de ${key} :`, err);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Quota dépassé ou mode privé : on le dit, on ne plante pas.
    console.error(`[storage] écriture impossible de ${key} :`, err);
  }
}

/**
 * Purge les clés datées d'avant aujourd'hui.
 *
 * Sans ça, chaque journée laisserait une entrée derrière elle jusqu'à saturer
 * le quota. On garde uniquement le jour courant : l'historique, c'est le rôle
 * de daily_logs côté Supabase, pas du navigateur.
 */
export function pruneOldDailyKeys(base: string): void {
  if (typeof window === "undefined") return;
  const keep = dailyKey(base);
  const prefix = `${PREFIX}-${base}-`;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix) && key !== keep) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.error("[storage] purge impossible :", err);
  }
}
