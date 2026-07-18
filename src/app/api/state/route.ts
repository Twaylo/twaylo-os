import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  lireCaptures,
  lireContacts,
  lireJour,
  lireTaches,
  lireVideos,
  versContacts,
  versHabitudes,
  versPipeline,
  versTaches,
} from "@/lib/db";

/**
 * L'amorçage du dashboard : tout ce qu'il faut pour peindre l'accueil, en un
 * seul aller-retour.
 *
 * Un seul appel plutôt qu'un par carte — sur une connexion de terrain, cinq
 * requêtes en série coûtent cinq fois la latence.
 */
export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false }, { status: 200 });
  }

  const jour = new URL(req.url).searchParams.get("jour");
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre `jour` invalide." }, { status: 400 });
  }

  try {
    // En parallèle : ces trois lectures ne dépendent pas les unes des autres.
    const [taches, journee, captures, videos, contacts] = await Promise.all([
      lireTaches(),
      lireJour(jour),
      lireCaptures(),
      lireVideos(),
      lireContacts(),
    ]);

    return NextResponse.json({
      connecte: true,
      jour,
      taches: versTaches(taches),
      habitudes: versHabitudes(journee.etat.compteurs),
      journal: journee.journal,
      uneChose: journee.etat.une_chose,
      nutrition: journee.etat.nutrition,
      captures: captures.map((c) => ({ id: c.id, text: c.texte, type: c.type })),
      pipeline: versPipeline(videos),
      contacts: versContacts(contacts),
    });
  } catch (err) {
    console.error("[state] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, error: "Lecture de la base impossible." },
      { status: 500 },
    );
  }
}
