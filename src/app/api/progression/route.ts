import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase";
import { lireProgression } from "@/lib/progression-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La progression : XP accumulée, série, records, exploits.
 *
 * Lecture pure — le navigateur y ajoute l'XP du jour, qu'il calcule en direct
 * à chaque coche pour que la barre bouge sous le doigt sans attendre le
 * réseau.
 */
export async function GET(req: Request) {
  const jour = new URL(req.url).searchParams.get("jour") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre `jour` invalide." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false });
  }

  try {
    const progression = await lireProgression(jour);
    return NextResponse.json({ connecte: true, ...progression });
  } catch (err) {
    console.error("[progression] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, error: "Lecture impossible." },
      { status: 500 },
    );
  }
}
