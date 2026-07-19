/**
 * Porte à mot de passe unique (spec Partie 7, étape 1).
 *
 * Pour un dashboard perso mono-utilisateur, OAuth est disproportionné : un
 * cookie signé HMAC suffit. Tout passe par l'API Web Crypto — et pas par le
 * module `crypto` de Node — parce que le middleware tourne sur le runtime edge.
 */

const encoder = new TextEncoder();

export const SESSION_COOKIE = "twaylo_session";
/*
 * Sept jours, et non trente. Sur un dashboard ouvert quotidiennement, une
 * reconnexion hebdomadaire ne coûte presque rien et divise par quatre la
 * fenêtre pendant laquelle un cookie volé reste utilisable.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Le retour est explicitement adossé à un ArrayBuffer (et non un
// SharedArrayBuffer) : crypto.subtle n'accepte que le premier.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

/**
 * Empreinte du mot de passe courant, embarquée dans le jeton.
 *
 * Sans elle, une session ne pouvait pas être révoquée : le payload ne portait
 * que son expiration, donc un cookie copié sur une machine partagée restait
 * valide jusqu'au bout, et changer le mot de passe n'y changeait rien —
 * seul `AUTH_SECRET` entre dans la signature. Avec cette empreinte, changer
 * le mot de passe invalide d'un coup toutes les sessions ouvertes, sans avoir
 * à tenir une table de sessions.
 */
async function versionSession(secret: string, motDePasse: string): Promise<string> {
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`v1:${motDePasse}`));
  return toBase64Url(new Uint8Array(sig)).slice(0, 16);
}

/** Émet un jeton `<payload>.<signature>` dont la charge utile porte l'expiration. */
export async function createSessionToken(
  secret: string,
  motDePasse: string,
  maxAgeSeconds: number = SESSION_MAX_AGE,
): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        exp: Date.now() + maxAgeSeconds * 1000,
        v: await versionSession(secret, motDePasse),
      }),
    ),
  );
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Vrai si la signature tient ET que le jeton n'a pas expiré. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  motDePasse: string,
): Promise<boolean> {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await hmacKey(secret, ["verify"]);
    // crypto.subtle.verify compare en temps constant.
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return false;

    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof decoded.exp !== "number" || decoded.exp <= Date.now()) return false;
    // Le mot de passe a changé depuis l'émission : le jeton ne vaut plus rien.
    return decoded.v === (await versionSession(secret, motDePasse));
  } catch {
    // Jeton illisible : traité comme invalide, jamais comme une erreur serveur.
    return false;
  }
}

/**
 * Comparaison à durée constante. Un `===` sur le mot de passe fuiterait sa
 * longueur et son préfixe via le temps de réponse.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  // On compare toujours la même quantité d'octets, quelle que soit la longueur.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Accès programmatique (CLI, cron, scripts) via l'en-tête x-api-secret,
 * en plus du cookie de session.
 */
export function hasValidApiSecret(headerValue: string | null): boolean {
  const secret = process.env.API_SECRET;
  if (!secret || !headerValue) return false;
  return timingSafeEqual(headerValue, secret);
}
