import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { lireStatsNutrition } from "@/lib/nutrition-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false }, { status: 200 });
  }

  const brut = Number(new URL(req.url).searchParams.get("jours") ?? "120");
  const fenetre = Number.isFinite(brut) ? Math.min(Math.max(brut, 7), 365) : 120;

  try {
    const stats = await lireStatsNutrition(undefined, fenetre);
    return NextResponse.json({ connecte: true, ...stats });
  } catch (err) {
    console.error("[nutrition/stats] lecture impossible :", err);
    return NextResponse.json({ error: "Statistiques illisibles." }, { status: 500 });
  }
}
