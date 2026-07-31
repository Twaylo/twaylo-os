import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  archiverTachesOubliees,
  lireOubliees,
  reprendreOubliee,
  supprimerOubliee,
} from "@/lib/oublies-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les oubliés — balayage d'abord, pour que l'archive soit toujours à jour. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ oubliees: [] });
  try {
    await archiverTachesOubliees();
    return NextResponse.json({ oubliees: await lireOubliees() });
  } catch (err) {
    console.error("[oublies] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Remet un oublié dans la todo, compteur remis à zéro. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { id?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (typeof corps.id !== "string" || !corps.id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  try {
    await reprendreOubliee(corps.id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[oublies] reprise impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  try {
    await supprimerOubliee(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[oublies] suppression impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
