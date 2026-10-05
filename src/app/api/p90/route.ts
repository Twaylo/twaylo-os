import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  lireDealsP90,
  lireObjectifsP90,
  lireOrdreTaches,
  lireTachesGelees,
  lireTaches,
  trierSelon,
  versTaches,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'amorçage du cockpit : tout en un seul aller-retour.
 *
 * Les quatre modules lisent les MÊMES trois tables — la todo et le Kanban
 * partagent `tasks` ligne pour ligne, les Objectifs lisent les OP pour la
 * trésorerie. Une route par module aurait relu trois fois la même chose, et
 * sur une 4G de terrain chaque aller-retour coûte le réveil d'une fonction
 * serverless, pas quelques millisecondes.
 *
 * Rien n'est interprété ici : `statut`, `urgence` et `categorie` partent bruts,
 * et c'est `p90.ts` qui les lit — la même règle des deux côtés du réseau.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false }, { status: 200 });
  }

  try {
    const [taches, ops, objectifs, ordre, gelees] = await Promise.all([
      lireTaches(),
      lireDealsP90(),
      lireObjectifsP90(),
      lireOrdreTaches(),
      lireTachesGelees(),
    ]);

    return NextResponse.json({
      connecte: true,
      // Le gel est marqué ici, sur la liste déjà triée : il vit sur la
      // sentinelle et non dans la table, `versTaches` ne peut pas le connaître.
      taches: trierSelon(versTaches(taches), ordre).map((t) => ({
        ...t,
        gelee: gelees.includes(t.id),
      })),
      ops,
      objectifs,
    });
  } catch (err) {
    console.error("[p90] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, error: "Lecture de la base impossible." },
      { status: 500 },
    );
  }
}
