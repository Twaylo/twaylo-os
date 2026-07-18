import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  basculerTache,
  creerTache,
  ecrireOrdreTaches,
  renommerTache,
  supprimerTache,
  versTaches,
} from "@/lib/db";

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

/**
 * Modifie une tâche : la cocher, la renommer, ou réordonner la liste entière.
 * Les trois passent par le même verbe parce qu'ils décrivent tous une
 * modification partielle de l'existant.
 */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: { id?: unknown; faite?: unknown; titre?: unknown; ordre?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    // Réordonnancement : une liste d'identifiants, sans id unique.
    if (Array.isArray(corps.ordre)) {
      const ids = corps.ordre.filter((x): x is string => typeof x === "string");
      await ecrireOrdreTaches(ids);
      return NextResponse.json({ persiste: true });
    }

    if (typeof corps.id !== "string") {
      return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
    }

    if (typeof corps.titre === "string") {
      const titre = corps.titre.trim();
      if (titre.length === 0) {
        return NextResponse.json({ error: "Titre vide." }, { status: 400 });
      }
      await renommerTache(corps.id, titre.slice(0, 200));
      return NextResponse.json({ persiste: true });
    }

    if (typeof corps.faite === "boolean") {
      await basculerTache(corps.id, corps.faite);
      return NextResponse.json({ persiste: true });
    }

    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
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
