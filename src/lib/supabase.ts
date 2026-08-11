import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SESSION_COOKIE, lireUtilisateur, verifySessionToken } from "./auth";

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

/**
 * L'utilisateur par défaut : le compte historique, et le repli.
 *
 * Il sert quand aucun cookie n'accompagne la requête — les tâches planifiées
 * de Vercel et le webhook Telegram, qui s'authentifient par un secret d'en-tête
 * et non par une session.
 */
export const USER_ID = process.env.USER_ID ?? "twaylo";

/**
 * L'utilisateur de la requête EN COURS.
 *
 * C'est la pièce qui rend plusieurs OS possibles sur la même base. Chaque
 * table porte déjà une colonne `user_id` depuis le premier jour ; il ne
 * manquait qu'une chose : que sa valeur vienne de QUI EST CONNECTÉ, et non
 * d'une constante lue au démarrage du serveur.
 *
 * Le nom est lu dans le cookie de session, qui est signé : il ne peut pas
 * être fabriqué depuis le navigateur. Sans cookie — tâche planifiée, webhook
 * Telegram — on retombe sur le compte par défaut, ce qui préserve exactement
 * le comportement d'avant.
 *
 * Volontairement asynchrone : `cookies()` l'est depuis Next 15. Le compilateur
 * s'en sert d'ailleurs comme garde-fou — un appel oublié dans une fonction non
 * asynchrone ne compile pas, ce qui est précisément la vérification qu'on veut
 * sur les quatre-vingt-quatorze endroits concernés.
 */
export async function uid(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const jeton = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!jeton) return USER_ID;

    /*
     * LA SIGNATURE EST VÉRIFIÉE ICI, et pas seulement par le middleware.
     *
     * S'en remettre au middleware paraissait suffisant : il tourne avant
     * chaque requête et refuse un jeton invalide. Sauf que certaines routes
     * sont PUBLIQUES, donc ne passent pas par lui — le webhook Telegram en
     * premier. Un cookie fabriqué à la main portant le nom de quelqu'un
     * d'autre y aurait été cru sur parole, et aurait écrit dans l'OS de cette
     * personne.
     *
     * Le coût est un calcul HMAC par requête. Il est dérisoire, et il
     * transforme « c'est vérifié ailleurs » — une garantie qui se périme au
     * premier chemin public ajouté — en « c'est vérifié ici ».
     */
    const secret = process.env.AUTH_SECRET;
    const mdp = process.env.DASHBOARD_PASSWORD;
    if (!secret || !mdp) return USER_ID;
    if (!(await verifySessionToken(jeton, secret, mdp))) return USER_ID;

    return lireUtilisateur(jeton) ?? USER_ID;
  } catch {
    /*
     * Hors contexte de requête — une tâche planifiée, un script. `cookies()`
     * lève dans ce cas plutôt que de renvoyer vide, et c'est tant mieux : on
     * veut le compte par défaut, pas une erreur.
     */
    return USER_ID;
  }
}

/**
 * Contourne le cache edge de PostgREST, qui ressert volontiers des snapshots
 * périmés sur les SELECT en masse (spec Partie 10, bug 5).
 *
 * `now` est injectable pour rester testable.
 */
export function cacheBustLimit(now: number = Date.now()): number {
  return 100000 + (now % 100000);
}
