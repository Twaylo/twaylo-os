import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireJour } from "@/lib/db";

/**
 * Écrit l'état d'une journée : compteurs d'habitudes, journal, unique chose,
 * repas.
 *
 * Appelée en différé par le navigateur, jamais à chaque frappe — le stockage
 * local sert de tampon instantané, cette route de mémoire durable.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: {
    jour?: string;
    faites?: Record<string, string[]>;
    journal?: string;
    uneChose?: { texte: string; fait: boolean };
    nutrition?: { repas: unknown[] };
  };

  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const { jour } = corps;
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre `jour` invalide." }, { status: 400 });
  }

  // On ne construit le patch qu'avec ce qui a été fourni : un champ absent
  // ne doit pas être écrasé par une valeur vide.
  const etat: Record<string, unknown> = {};
  if (corps.faites !== undefined) etat.faites = corps.faites;
  if (corps.uneChose !== undefined) etat.une_chose = corps.uneChose;
  if (corps.nutrition !== undefined) etat.nutrition = corps.nutrition;

  try {
    await ecrireJour(jour, {
      etat: Object.keys(etat).length > 0 ? etat : undefined,
      journal: corps.journal,
    });
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[daily] écriture impossible :", err);
    return NextResponse.json(
      { persiste: false, error: "Écriture impossible." },
      { status: 500 },
    );
  }
}
