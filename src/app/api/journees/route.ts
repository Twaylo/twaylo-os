import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireJournees, lireJournees } from "@/lib/journees-db";
import { JOURNEES_DEFAUT, bornerJournees, type JourneesConfig } from "@/lib/journees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les journées types — les modèles de déroulé d'une journée. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, journees: JOURNEES_DEFAUT });
  }
  try {
    return NextResponse.json({ connecte: true, journees: await lireJournees() });
  } catch (err) {
    console.error("[journees] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Enregistre la configuration complète — courte, donc revalidée entièrement. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: Partial<JourneesConfig>;
  try {
    corps = (await req.json()) as Partial<JourneesConfig>;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    const propre = bornerJournees(corps);
    await ecrireJournees(propre);
    return NextResponse.json({ persiste: true, journees: propre });
  } catch (err) {
    console.error("[journees] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
