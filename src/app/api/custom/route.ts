import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireCustom, lireCustom } from "@/lib/custom-db";
import { CUSTOM_DEFAUT, bornerCustom, type CustomConfig } from "@/lib/custom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les réglages de personnalisation — ambiance, onglets, identité. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, custom: CUSTOM_DEFAUT });
  }
  try {
    return NextResponse.json({ connecte: true, custom: await lireCustom() });
  } catch (err) {
    console.error("[custom] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Enregistre le réglage complet — il est petit, on le revalide entièrement. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: Partial<CustomConfig>;
  try {
    corps = (await req.json()) as Partial<CustomConfig>;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    const propre = bornerCustom(corps);
    await ecrireCustom(propre);
    return NextResponse.json({ persiste: true, custom: propre });
  } catch (err) {
    console.error("[custom] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
