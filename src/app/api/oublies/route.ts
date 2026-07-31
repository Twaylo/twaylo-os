import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { placerEnTeteOrdre } from "@/lib/db";
import { niveauDepuisUrgence, type Niveau } from "@/lib/types";
import { estQuadrant } from "@/lib/eisenhower";
import {
  archiverTachesOubliees,
  classerOubliee,
  lireOubliees,
  reprendreOubliee,
  supprimerOubliee,
} from "@/lib/oublies-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les oubliés — balayage d'abord, pour que l'archive soit toujours à jour. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ oubliees: [] });
  try {
    await archiverTachesOubliees();
    return NextResponse.json({ oubliees: await lireOubliees() });
  } catch (err) {
    console.error("[oublies] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Remet un oublié dans la todo, compteur remis à zéro. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { id?: unknown; niveau?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (typeof corps.id !== "string" || !corps.id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }
  const niveau = (["principal", "secondaire", "annexe"] as const).includes(
    corps.niveau as Niveau,
  )
    ? (corps.niveau as Niveau)
    : undefined;

  try {
    const reprise = await reprendreOubliee(corps.id, niveau);
    if (!reprise) {
      return NextResponse.json({ error: "Oublié introuvable." }, { status: 404 });
    }
    /*
     * Reprise = « je m'y remets maintenant » : la tâche reparaît EN TÊTE.
     * Sans ce placement elle serait absente de la liste d'ordre, donc renvoyée
     * tout en bas d'une liste de vingt lignes — exactement là où elle s'était
     * fait oublier.
     */
    try {
      await placerEnTeteOrdre(reprise.id);
    } catch (err) {
      console.error("[oublies] placement en tête impossible :", err);
    }
    return NextResponse.json({
      persiste: true,
      tache: {
        id: reprise.id,
        text: reprise.titre,
        done: false,
        niveau: niveauDepuisUrgence(reprise.urgence),
      },
    });
  } catch (err) {
    console.error("[oublies] reprise impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}

/** Déplace un oublié dans une autre case de la matrice. */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { id?: unknown; quadrant?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (typeof corps.id !== "string" || !corps.id || !estQuadrant(corps.quadrant)) {
    return NextResponse.json(
      { error: "Identifiant ou case invalide." },
      { status: 400 },
    );
  }

  try {
    await classerOubliee(corps.id, corps.quadrant);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[oublies] classement impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

  try {
    await supprimerOubliee(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[oublies] suppression impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}
