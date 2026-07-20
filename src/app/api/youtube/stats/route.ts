import { NextResponse } from "next/server";
import { lireStatsYoutube, youtubeConnecte } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await youtubeConnecte())) {
    return NextResponse.json({ connecte: false });
  }
  try {
    return NextResponse.json(await lireStatsYoutube());
  } catch (err) {
    console.error("[youtube] stats impossibles :", err);
    // Un jeton révoqué ou expiré ne doit pas casser la page : on retombe sur
    // « non connecté », l'utilisateur pourra relancer la connexion.
    return NextResponse.json(
      { connecte: false, error: "Lecture YouTube impossible. Reconnecte ta chaîne." },
      { status: 200 },
    );
  }
}
