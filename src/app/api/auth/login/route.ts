import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  timingSafeEqual,
} from "@/lib/auth";

/**
 * Frein contre le bruteforce.
 *
 * Cette route est publique par nécessité, et le mot de passe est le facteur
 * unique qui protège revenus, contacts, deals et journal. Sans frein, un
 * attaquant teste des millions de candidats par jour sans que rien ne le
 * signale — en commençant, évidemment, par le nom de la marque et ses dérivés.
 *
 * Fenêtre glissante en mémoire : suffisant pour une seule instance servant un
 * seul utilisateur. À déplacer vers Redis le jour où le déploiement se
 * répartit sur plusieurs instances, chacune ayant sinon son propre compteur.
 */
const tentatives = new Map<string, { n: number; jusqua: number }>();
const MAX_TENTATIVES = 5;
const FENETRE_MS = 15 * 60 * 1000;

/** Secondes d'attente restantes, ou `null` si l'adresse peut réessayer. */
function bloque(ip: string): number | null {
  const e = tentatives.get(ip);
  if (!e) return null;
  if (Date.now() > e.jusqua) {
    tentatives.delete(ip);
    return null;
  }
  return e.n >= MAX_TENTATIVES ? Math.ceil((e.jusqua - Date.now()) / 1000) : null;
}

function enregistrerEchec(ip: string): void {
  const e = tentatives.get(ip);
  if (!e || Date.now() > e.jusqua) {
    tentatives.set(ip, { n: 1, jusqua: Date.now() + FENETRE_MS });
    return;
  }
  e.n += 1;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnu";

  const attente = bloque(ip);
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
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (typeof password !== "string" || !timingSafeEqual(password, expected)) {
    enregistrerEchec(ip);
    // Un échec silencieux est un échec qu'on ne verra jamais venir.
    console.warn(`[auth] mot de passe refusé depuis ${ip}`);
    // Message volontairement neutre : rien qui distingue « champ vide » de
    // « mauvais mot de passe ».
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  tentatives.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
