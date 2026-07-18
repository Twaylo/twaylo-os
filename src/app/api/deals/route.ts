import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ETAPES_DEAL, creerDeal, majDeal, supprimerDeal } from "@/lib/db";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let nom: unknown;
  let etape: unknown;
  try {
    ({ nom, etape } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof nom !== "string" || nom.trim().length === 0) {
    return NextResponse.json({ error: "Nom manquant." }, { status: 400 });
  }

  try {
    const deal = await creerDeal(
      nom.trim(),
      typeof etape === "string" && (ETAPES_DEAL as readonly string[]).includes(etape)
        ? etape
        : "prospect",
    );
    return NextResponse.json({ persiste: true, deal });
  } catch (err) {
    console.error("[deals] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/** Déplace un deal, fixe son montant, ou change sa note. */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { id?: unknown; etape?: unknown; montant?: unknown; note?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof corps.id !== "string") {
    return NextResponse.json({ error: "`id` invalide." }, { status: 400 });
  }

  const patch: { etape?: string; montant?: number | null; note?: string | null } = {};

  if (
    typeof corps.etape === "string" &&
    (ETAPES_DEAL as readonly string[]).includes(corps.etape)
  ) {
    patch.etape = corps.etape;
  }

  // Un montant nul est un choix valide : « on ne sait pas encore ».
  if (corps.montant === null) patch.montant = null;
  else if (typeof corps.montant === "number" && Number.isFinite(corps.montant)) {
    patch.montant = corps.montant;
  }

  if (typeof corps.note === "string") patch.note = corps.note.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }

  try {
    await majDeal(corps.id, patch);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[deals] mise à jour impossible :", err);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "`id` manquant." }, { status: 400 });

  try {
    await supprimerDeal(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[deals] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
