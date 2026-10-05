import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { creerDeal, majDealP90, supprimerDeal } from "@/lib/db";
import { estEtapeOp, type EtapeOp } from "@/lib/p90";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOM = 120;
const MAX_NOTE = 600;
/** Un million d'euros d'OP : au-delà, c'est une faute de frappe. */
const MAX_MONTANT = 1_000_000;

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { nom?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const nom = typeof corps.nom === "string" ? corps.nom.trim().slice(0, MAX_NOM) : "";
  if (!nom) return NextResponse.json({ error: "Marque manquante." }, { status: 400 });

  try {
    const deal = await creerDeal(nom);
    return NextResponse.json({ persiste: true, op: deal });
  } catch (err) {
    console.error("[p90/ops] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { id?: unknown; nom?: unknown; montant?: unknown; note?: unknown; etape?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (typeof corps.id !== "string" || !corps.id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const patch: { nom?: string; montant?: number | null; note?: string | null; etape?: EtapeOp } = {};
  if (typeof corps.nom === "string" && corps.nom.trim()) patch.nom = corps.nom.trim().slice(0, MAX_NOM);
  if (corps.montant === null) patch.montant = null;
  else if (typeof corps.montant === "number" && Number.isFinite(corps.montant)) {
    // Borné des deux côtés : un montant négatif ferait une commission négative,
    // et toute la vue « À encaisser » compterait à l'envers.
    patch.montant = Math.max(0, Math.min(MAX_MONTANT, Math.round(corps.montant)));
  }
  if (corps.note === null) patch.note = null;
  else if (typeof corps.note === "string") patch.note = corps.note.slice(0, MAX_NOTE);
  if (estEtapeOp(corps.etape)) patch.etape = corps.etape;

  if (Object.keys(patch).length === 0) return NextResponse.json({ persiste: true });

  try {
    await majDealP90(corps.id, patch);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/ops] modification impossible :", err);
    return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  try {
    await supprimerDeal(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/ops] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
