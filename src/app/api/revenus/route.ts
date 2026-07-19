import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireRevenu, lireRevenus, supprimerRevenu } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un nombre, ou null. Une chaîne vide vaut « non renseigné », pas zéro. */
function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, releves: [] });
  }
  try {
    return NextResponse.json({ connecte: true, releves: await lireRevenus() });
  } catch (err) {
    console.error("[revenus] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // La date est ramenée au premier du mois : un relevé mensuel n'a pas de jour,
  // et sans ça deux saisies du même mois créeraient deux lignes.
  const brut = typeof corps.date === "string" ? corps.date : "";
  if (!/^\d{4}-\d{2}/.test(brut)) {
    return NextResponse.json({ error: "Date invalide (AAAA-MM)." }, { status: 400 });
  }
  const date = `${brut.slice(0, 7)}-01`;

  const sources: Record<string, number> = {};
  if (typeof corps.sources === "object" && corps.sources !== null) {
    for (const [k, v] of Object.entries(corps.sources as Record<string, unknown>)) {
      const n = nombre(v);
      if (n !== null) sources[k.slice(0, 40)] = n;
    }
  }

  try {
    await ecrireRevenu({
      date,
      revenu_estime: nombre(corps.revenu),
      rpm: nombre(corps.rpm),
      vues_monetisees: nombre(corps.vues),
      objectif_mois: nombre(corps.objectif),
      sources,
    });
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[revenus] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
  try {
    await supprimerRevenu(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[revenus] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
