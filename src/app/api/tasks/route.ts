import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { basculerTache, creerTache, supprimerTache, versTaches } from "@/lib/db";

/** Crée une tâche. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let titre: unknown;
  let categorie: unknown;
  try {
    ({ titre, categorie } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof titre !== "string" || titre.trim().length === 0) {
    return NextResponse.json({ error: "Titre manquant." }, { status: 400 });
  }

  try {
    const ligne = await creerTache(
      titre.trim(),
      typeof categorie === "string" ? categorie : undefined,
    );
    return NextResponse.json({ persiste: true, tache: versTaches([ligne])[0] });
  } catch (err) {
    console.error("[tasks] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/** Coche ou décoche une tâche. */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let id: unknown;
  let faite: unknown;
  try {
    ({ id, faite } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof id !== "string" || typeof faite !== "boolean") {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  try {
    await basculerTache(id, faite);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[tasks] mise à jour impossible :", err);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

/** Supprime une tâche. */
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
  }

  try {
    await supprimerTache(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[tasks] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
