import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireBlocages, lireBlocages, type BlocageStocke } from "@/lib/db";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ blocages: [] }, { status: 200 });
  }

  try {
    return NextResponse.json({ blocages: await lireBlocages() });
  } catch (err) {
    console.error("[blocages] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: { blocages?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // On valide plutôt que de faire confiance : cette liste est relue à chaque
  // chargement, une entrée mal formée casserait la carte durablement.
  if (!Array.isArray(corps.blocages)) {
    return NextResponse.json({ error: "`blocages` doit être un tableau." }, { status: 400 });
  }

  const propres: BlocageStocke[] = [];
  for (const brut of corps.blocages) {
    if (typeof brut !== "object" || brut === null) continue;
    const b = brut as Record<string, unknown>;
    if (typeof b.texte !== "string" || b.texte.trim() === "") continue;
    if (typeof b.depuis !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.depuis)) continue;
    propres.push({
      id: typeof b.id === "string" && b.id ? b.id : `b${propres.length}`,
      texte: b.texte.trim().slice(0, 200),
      proprietaire:
        typeof b.proprietaire === "string" && b.proprietaire.trim()
          ? b.proprietaire.trim().slice(0, 60)
          : "Toi",
      depuis: b.depuis,
    });
  }

  try {
    await ecrireBlocages(propres);
    return NextResponse.json({ persiste: true, blocages: propres });
  } catch (err) {
    console.error("[blocages] écriture impossible :", err);
    return NextResponse.json({ persiste: false, error: "Écriture impossible." }, { status: 500 });
  }
}
