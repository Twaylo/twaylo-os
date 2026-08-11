/**
 * Le laissez-passer des Tway'tools.
 *
 * Une fois l'adresse confirmée, un cookie signé ouvre les outils. Il est
 * volontairement ANONYME : il ne porte ni l'adresse, ni un identifiant qui y
 * mènerait, seulement une date d'expiration. Personne n'a besoin de savoir
 * QUI regarde une carte d'attaques maritimes, et ce qui n'est pas écrit ne
 * peut pas fuiter.
 *
 * Signé, parce qu'un simple drapeau « j'ai confirmé » se falsifierait en
 * trois secondes depuis la console du navigateur. Ici, sans `AUTH_SECRET`,
 * on ne peut pas fabriquer un cookie valable.
 *
 * Tout passe par l'API Web Crypto : le middleware tourne sur le runtime edge,
 * où le module `crypto` de Node n'existe pas.
 */

const encoder = new TextEncoder();

export const ACCES_COOKIE = "tway_acces";
/*
 * Un an. Ce cookie ne protège rien de sensible : il évite seulement de
 * redemander son adresse à quelqu'un qui l'a déjà donnée. Le faire expirer
 * vite ne protégerait personne et agacerait tout le monde.
 */
export const ACCES_MAX_AGE = 60 * 60 * 24 * 365;

const versBase64Url = (octets: Uint8Array) => {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function depuisBase64Url(valeur: string): Uint8Array<ArrayBuffer> {
  const complete = valeur.replace(/-/g, "+").replace(/_/g, "/");
  const binaire = atob(complete.padEnd(Math.ceil(complete.length / 4) * 4, "="));
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

const cle = (secret: string, usages: KeyUsage[]) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);

/** Émet un laissez-passer valable un an. */
export async function creerAcces(secret: string): Promise<string> {
  const charge = versBase64Url(
    encoder.encode(JSON.stringify({ exp: Date.now() + ACCES_MAX_AGE * 1000 })),
  );
  const signature = await crypto.subtle.sign("HMAC", await cle(secret, ["sign"]), encoder.encode(charge));
  return `${charge}.${versBase64Url(new Uint8Array(signature))}`;
}

/** Vrai si le laissez-passer tient et n'a pas expiré. */
export async function accesValide(jeton: string | undefined, secret: string): Promise<boolean> {
  if (!jeton) return false;
  const [charge, signature] = jeton.split(".");
  if (!charge || !signature) return false;

  try {
    const bon = await crypto.subtle.verify(
      "HMAC",
      await cle(secret, ["verify"]),
      depuisBase64Url(signature),
      encoder.encode(charge),
    );
    if (!bon) return false;
    const lu = JSON.parse(new TextDecoder().decode(depuisBase64Url(charge)));
    return typeof lu.exp === "number" && lu.exp > Date.now();
  } catch {
    // Cookie illisible : traité comme absent, jamais comme une erreur serveur.
    return false;
  }
}
