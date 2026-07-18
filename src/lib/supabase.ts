import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase à privilèges service role.
 *
 * Il contourne RLS, donc il ne doit JAMAIS être importé depuis un composant
 * client. Le garde ci-dessous transforme une erreur discrète (clé envoyée au
 * navigateur) en plantage bruyant au premier import fautif.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabaseAdmin() a été appelé côté client — la clé service role ne doit jamais quitter le serveur.",
    );
  }

  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase non configuré : renseigne NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/** Vrai si les clés Supabase sont présentes — sert aux écrans de repli. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** V1 mono-utilisateur (spec Partie 4). */
export const USER_ID = process.env.USER_ID ?? "twaylo";

/**
 * Contourne le cache edge de PostgREST, qui ressert volontiers des snapshots
 * périmés sur les SELECT en masse (spec Partie 10, bug 5).
 *
 * `now` est injectable pour rester testable.
 */
export function cacheBustLimit(now: number = Date.now()): number {
  return 100000 + (now % 100000);
}
