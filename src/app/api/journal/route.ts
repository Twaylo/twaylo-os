import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin, USER_ID } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les entrées de journal des jours passés.
 *
 * Le champ du soir n'écrit que la journée en cours ; sans cette route, tout ce
 * qui a été écrit les jours précédents était en base mais invisible. Twaylo
 * demandait à revoir ses derniers jours — c'est ce qui manquait.
 *
 * La journée en cours est exclue : elle est déjà à l'écran, dans le champ
 * d'écriture juste au-dessus.
 */
export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, entrees: [] });
  }

  const params = new URL(req.url).searchParams;
  const jour = params.get("jour");
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre `jour` invalide." }, { status: 400 });
  }
  // Borné : une valeur absurde ferait lire toute la table.
  const brut = Number(params.get("combien") ?? "30");
  const combien = Number.isFinite(brut) ? Math.min(Math.max(brut, 1), 120) : 30;

  try {
    const { data, error } = await supabaseAdmin()
      .from("daily_logs")
      .select("jour, journal_texte")
      .eq("user_id", USER_ID)
      .neq("jour", "2000-01-01")
      .lt("jour", jour)
      .order("jour", { ascending: false })
      .limit(combien);

    if (error) throw error;

    return NextResponse.json({
      connecte: true,
      entrees: (data ?? [])
        .filter((l) => (l.journal_texte ?? "").trim())
        .map((l) => ({ jour: l.jour as string, texte: (l.journal_texte as string).trim() })),
    });
  } catch (err) {
    console.error("[journal] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}
