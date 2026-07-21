import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { urlAutorisation, youtubeConfigure } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le cookie qui porte le `state` OAuth le temps de l'aller-retour Google. */
export const YT_STATE_COOKIE = "yt_oauth_state";

/** Envoie Twaylo sur la page de consentement Google. */
export async function GET() {
  if (!youtubeConfigure()) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans .env.local." },
      { status: 503 },
    );
  }

  // Valeur imprévisible, mémorisée côté navigateur dans un cookie httpOnly : le
  // callback exigera qu'elle revienne à l'identique. C'est ce qui empêche un
  // tiers de forger le retour OAuth.
  const state = randomBytes(32).toString("hex");
  const res = NextResponse.redirect(urlAutorisation(state));
  res.cookies.set(YT_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // dix minutes suffisent pour un consentement
  });
  return res;
}
