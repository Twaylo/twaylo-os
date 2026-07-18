import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  calculerSerie,
  lireBlocages,
  lireCaptures,
  lireContacts,
  lireDeals,
  lireHabitudesDef,
  lireJour,
  lireOrdreTaches,
  lireTaches,
  lireVideos,
  statsDeals,
  versContacts,
  versPipeline,
  versTaches,
} from "@/lib/db";

/**
 * Applique l'ordre choisi par Twaylo. Ce que la liste ne mentionne pas —
 * une tâche créée depuis — vient après, dans son ordre de création.
 */
function trierSelon<T extends { id?: string }>(taches: T[], ordre: string[]): T[] {
  if (ordre.length === 0) return taches;
  const rang = new Map(ordre.map((id, i) => [id, i]));
  return [...taches].sort(
    (a, b) =>
      (rang.get(a.id ?? "") ?? Number.MAX_SAFE_INTEGER) -
      (rang.get(b.id ?? "") ?? Number.MAX_SAFE_INTEGER),
  );
}

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
    // En parallèle : ces lectures ne dépendent pas les unes des autres.
    const [taches, journee, captures, videos, contacts, deals, habitudes, serie, blocages, ordreTaches] =
      await Promise.all([
        lireTaches(),
        lireJour(jour),
        lireCaptures(),
        lireVideos(),
        lireContacts(),
        lireDeals(),
        lireHabitudesDef(),
        calculerSerie(jour),
        lireBlocages(),
        lireOrdreTaches(),
      ]);

    return NextResponse.json({
      connecte: true,
      jour,
      taches: trierSelon(versTaches(taches), ordreTaches),
      habitudes,
      serie,
      blocages,
      faites: journee.etat.faites ?? {},
      journal: journee.journal,
      uneChose: journee.etat.une_chose,
      nutrition: journee.etat.nutrition,
      captures: captures.map((c) => ({ id: c.id, text: c.texte, type: c.type })),
      pipeline: versPipeline(videos),
      contacts: versContacts(contacts),
      deals,
      dealStats: statsDeals(deals),
    });
  } catch (err) {
    console.error("[state] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, error: "Lecture de la base impossible." },
      { status: 500 },
    );
  }
}
