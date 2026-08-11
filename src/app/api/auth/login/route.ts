import { NextResponse } from "next/server";

import { normaliserId, verifierCompte } from "@/lib/comptes";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  timingSafeEqual,
} from "@/lib/auth";
import { adresse, creerFrein } from "@/lib/frein";

/**
 * Frein contre le bruteforce.
 *
 * Cette route est publique par nécessité, et le mot de passe est le facteur
 * unique qui protège revenus, contacts, deals et journal. Sans frein, un
 * attaquant teste des millions de candidats par jour sans que rien ne le
 * signale — en commençant, évidemment, par le nom de la marque et ses dérivés.
 *
 * Les compteurs eux-mêmes vivent dans `@/lib/frein`, partagés avec la
 * création de compte : deux portes ouvertes sur le même serveur, freinées de
 * la même façon.
 */
const frein = creerFrein({ parIp: 5, global: 20 });

export async function POST(req: Request) {
  const ip = adresse(req);

  const attente = frein.bloque(ip);
  if (attente !== null) {
    console.warn(`[auth] ${ip} bloqué — trop de tentatives`);
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie dans quelques minutes." },
      { status: 429, headers: { "retry-after": String(attente) } },
    );
  }

  const secret = process.env.AUTH_SECRET;
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!secret || !expected) {
    console.error("[auth] AUTH_SECRET ou DASHBOARD_PASSWORD manquant");
    return NextResponse.json({ error: "Serveur mal configuré." }, { status: 503 });
  }

  let password: unknown;
  let compteBrut: unknown;
  try {
    ({ password, compte: compteBrut } = await req.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  /*
   * Deux façons d'entrer, et une seule porte.
   *
   * Sans identifiant, c'est le compte historique et le mot de passe du
   * serveur : rien ne change pour Twaylo, ni pour les sessions déjà ouvertes.
   * Avec un identifiant, c'est un compte créé par le sas, dont le mot de passe
   * est vérifié contre son empreinte en base.
   */
  const compte = typeof compteBrut === "string" ? normaliserId(compteBrut) : "";

  let ouvre = false;
  if (compte) {
    ouvre = typeof password === "string" && (await verifierCompte(compte, password));
  } else {
    ouvre = typeof password === "string" && timingSafeEqual(password, expected);
  }

  if (!ouvre) {
    frein.echec(ip);
    // Un échec silencieux est un échec qu'on ne verra jamais venir.
    console.warn(`[auth] connexion refusée depuis ${ip}`);
    // Message volontairement neutre : rien qui distingue « nom inconnu » de
    // « mauvais mot de passe ».
    return NextResponse.json({ error: "Nom ou mot de passe incorrect." }, { status: 401 });
  }

  frein.succes(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, expected, undefined, compte || undefined), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
