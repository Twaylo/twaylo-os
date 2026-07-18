import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  timingSafeEqual,
} from "@/lib/auth";

export async function POST(req: Request) {
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
    // Message volontairement neutre : rien qui distingue « champ vide » de
    // « mauvais mot de passe ».
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
