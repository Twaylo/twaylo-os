import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { lireStatsHabitudes } from "@/lib/habitudes-stats";

// Les statistiques dépendent du jour courant : rien à calculer au build.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false }, { status: 200 });
  }

  // La fenêtre est bornée : une valeur absurde ferait lire toute la table.
  const brut = Number(new URL(req.url).searchParams.get("jours") ?? "120");
  const fenetre = Number.isFinite(brut) ? Math.min(Math.max(brut, 7), 365) : 120;

  try {
    const stats = await lireStatsHabitudes(undefined, fenetre);
    return NextResponse.json({ connecte: true, ...stats });
  } catch (err) {
    console.error("[habitudes/stats] lecture impossible :", err);
    return NextResponse.json({ error: "Statistiques illisibles." }, { status: 500 });
  }
}
