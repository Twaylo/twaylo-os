import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { majObjectifP90, type JalonDB } from "@/lib/db";
import { OBJECTIFS_P90 } from "@/lib/p90";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLES = new Set<string>(OBJECTIFS_P90.map((o) => o.id));
/** La valeur est saisie à la main : assez pour « 412 000 », pas pour un roman. */
const MAX_VALEUR = 20;

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { cle?: unknown; valeur?: unknown; jalons?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof corps.cle !== "string" || !CLES.has(corps.cle)) {
    return NextResponse.json({ error: "Objectif inconnu." }, { status: 400 });
  }

  const patch: { valeur?: string; jalons?: JalonDB[] } = {};
  if (typeof corps.valeur === "string") patch.valeur = corps.valeur.trim().slice(0, MAX_VALEUR);
  if (Array.isArray(corps.jalons)) {
    patch.jalons = corps.jalons
      .filter(
        (j): j is JalonDB =>
          typeof (j as JalonDB)?.texte === "string" &&
          typeof (j as JalonDB)?.fait === "boolean",
      )
      .slice(0, 12)
      .map((j) => ({ texte: j.texte.slice(0, 120), fait: j.fait }));
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ persiste: true });

  try {
    await majObjectifP90(corps.cle, patch);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/objectifs] modification impossible :", err);
    return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
  }
}
