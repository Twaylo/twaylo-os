import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  ecrireBlocsFaits,
  ecrireJournees,
  lireBlocsFaits,
  lireJournees,
} from "@/lib/journees-db";
import { JOURNEES_DEFAUT, bornerJournees, type JourneesConfig } from "@/lib/journees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Les journées types (les modèles), et — si `?jour=` est fourni — les blocs
 * déjà cochés ce jour-là. Un seul aller-retour pour peindre la carte.
 */
export async function GET(req: NextRequest) {
  const jour = req.nextUrl.searchParams.get("jour");
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, journees: JOURNEES_DEFAUT, faits: [] });
  }
  try {
    const journees = await lireJournees();
    const faits = jour && JOUR.test(jour) ? await lireBlocsFaits(jour) : [];
    return NextResponse.json({ connecte: true, journees, faits });
  } catch (err) {
    console.error("[journees] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/**
 * Deux écritures distinctes, selon la forme du corps :
 *   - { jour, faits }   → les coches du jour (la journée vécue)
 *   - { liste, active } → les modèles eux-mêmes (la journée rêvée)
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: Partial<JourneesConfig> & { jour?: unknown; faits?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    if (typeof corps.jour === "string" && Array.isArray(corps.faits)) {
      if (!JOUR.test(corps.jour)) {
        return NextResponse.json({ error: "Jour invalide." }, { status: 400 });
      }
      await ecrireBlocsFaits(corps.jour, corps.faits.map((f) => String(f)));
      return NextResponse.json({ persiste: true });
    }

    const propre = bornerJournees(corps);
    await ecrireJournees(propre);
    return NextResponse.json({ persiste: true, journees: propre });
  } catch (err) {
    console.error("[journees] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
