import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireHabitudesDef, lireHabitudesDef, type HabitudeDef } from "@/lib/db";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ connecte: false });
  try {
    return NextResponse.json({ connecte: true, habitudes: await lireHabitudesDef() });
  } catch (err) {
    console.error("[habitudes] lecture impossible :", err);
    return NextResponse.json({ connecte: false }, { status: 500 });
  }
}

/** Remplace la liste entière — l'écran envoie toujours l'état complet. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let habitudes: unknown;
  try {
    ({ habitudes } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (!Array.isArray(habitudes)) {
    return NextResponse.json({ error: "Liste attendue." }, { status: 400 });
  }

  // Validation : une définition mal formée casserait l'affichage au prochain
  // chargement, bien après l'écriture fautive.
  const propres: HabitudeDef[] = [];
  for (const h of habitudes) {
    if (
      typeof h?.id !== "string" ||
      typeof h?.nom !== "string" ||
      h.nom.trim().length === 0
    ) {
      return NextResponse.json({ error: "Habitude invalide." }, { status: 400 });
    }
    propres.push({
      id: h.id,
      nom: h.nom.trim(),
      categorie: typeof h.categorie === "string" && h.categorie.trim() ? h.categorie.trim() : "Divers",
      options: Array.isArray(h.options)
        ? h.options.filter((o: unknown) => typeof o === "string" && o.trim()).map((o: string) => o.trim())
        : [],
    });
  }

  try {
    await ecrireHabitudesDef(propres);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[habitudes] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
