import { NextResponse } from "next/server";
import { USER_ID, isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { REVUE_VIDE, type Revue } from "@/lib/types";

/**
 * La revue de semaine.
 *
 * Rangée dans `daily_logs`, sur la ligne du LUNDI de la semaine concernée,
 * sous la clé `revue`. Pourquoi pas une table dédiée : elle aurait demandé
 * une migration, et le jeton d'accès de Twaylo a été révoqué — à juste titre,
 * je le lui avais conseillé. Ancrer la revue sur le premier jour de sa
 * semaine est défendable en soi : une revue appartient à une semaine, et une
 * semaine commence un lundi.
 *
 * Le jour est fourni par le client, qui seul connaît le fuseau réel de
 * Twaylo — le serveur pourrait être ailleurs.
 */

function estUnJour(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function lireLigne(lundi: string) {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", lundi)
    .maybeSingle();

  if (error) throw error;
  return (data?.habitudes ?? {}) as Record<string, unknown>;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, revue: REVUE_VIDE });
  }

  const lundi = new URL(req.url).searchParams.get("lundi");
  if (!estUnJour(lundi)) {
    return NextResponse.json({ error: "Paramètre `lundi` invalide." }, { status: 400 });
  }

  try {
    const etat = await lireLigne(lundi);
    return NextResponse.json({
      connecte: true,
      revue: { ...REVUE_VIDE, ...((etat.revue ?? {}) as Partial<Revue>) },
    });
  } catch (err) {
    console.error("[revue] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, revue: REVUE_VIDE, error: "Lecture impossible." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false });
  }

  let corps: { lundi?: unknown; revue?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (!estUnJour(corps.lundi)) {
    return NextResponse.json({ error: "Paramètre `lundi` invalide." }, { status: 400 });
  }
  if (typeof corps.revue !== "object" || corps.revue === null) {
    return NextResponse.json({ error: "Revue manquante." }, { status: 400 });
  }

  try {
    // Fusion : la ligne du lundi porte aussi les compteurs d'habitudes et les
    // repas de ce jour-là. Écrire la revue ne doit pas les effacer.
    const etat = await lireLigne(corps.lundi);

    const { error } = await supabaseAdmin()
      .from("daily_logs")
      .upsert(
        {
          user_id: USER_ID,
          jour: corps.lundi,
          habitudes: { ...etat, revue: corps.revue },
        },
        { onConflict: "user_id,jour" },
      );

    if (error) throw error;
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[revue] écriture impossible :", err);
    return NextResponse.json(
      { persiste: false, error: "Écriture impossible." },
      { status: 500 },
    );
  }
}
