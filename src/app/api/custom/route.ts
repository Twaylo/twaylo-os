import { NextResponse } from "next/server";
import { USER_ID, isSupabaseConfigured, uid } from "@/lib/supabase";
import { ecrireCustom, lireCustom } from "@/lib/custom-db";
import { CUSTOM_DEFAUT, bornerCustom, type CustomConfig } from "@/lib/custom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les réglages de personnalisation — ambiance, modules, blocs, identité.
 *
 * La réponse porte aussi QUI est connecté. C'est ce qui permet à l'écran de
 * savoir s'il montre l'OS historique (dont l'identité est écrite en dur dans
 * le code) ou celui de quelqu'un d'autre. Rien de secret n'en sort : le nom du
 * compte est celui que la personne a elle-même choisi en s'inscrivant.
 */
export async function GET() {
  const compte = await uid();
  const proprietaire = compte === USER_ID;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      connecte: false,
      custom: CUSTOM_DEFAUT,
      compte,
      proprietaire,
    });
  }
  try {
    return NextResponse.json({
      connecte: true,
      custom: await lireCustom(),
      compte,
      proprietaire,
    });
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
