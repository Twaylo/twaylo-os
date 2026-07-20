import { NextResponse } from "next/server";
import { urlAutorisation, youtubeConfigure } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Envoie Twaylo sur la page de consentement Google. */
export async function GET() {
  if (!youtubeConfigure()) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans .env.local." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(urlAutorisation());
}
