import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { creerVideo, deplacerVideo, renommerVideo, supprimerVideo } from "@/lib/db";

/** Ajoute une idée au pipeline. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let titre: unknown;
  let format: unknown;
  try {
    ({ titre, format } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof titre !== "string" || titre.trim().length === 0) {
    return NextResponse.json({ error: "Titre manquant." }, { status: 400 });
  }

  try {
    const video = await creerVideo(
      titre.trim(),
      format === "short" ? "short" : "long",
    );
    return NextResponse.json({ persiste: true, video });
  } catch (err) {
    console.error("[videos] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/** Déplace une vidéo, la renomme, ou les deux. */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let id: unknown;
  let statut: unknown;
  let titre: unknown;
  try {
    ({ id, statut, titre } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof id !== "string") {
    return NextResponse.json({ error: "`id` invalide." }, { status: 400 });
  }

  try {
    // Les deux opérations sont indépendantes : on peut renommer sans
    // déplacer, déplacer sans renommer, ou faire les deux d'un coup.
    if (typeof titre === "string" && titre.trim().length > 0) {
      await renommerVideo(id, titre.trim());
    }
    if (typeof statut === "string") {
      await deplacerVideo(id, statut);
    }
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[videos] déplacement impossible :", err);
    return NextResponse.json({ error: "Déplacement impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "`id` manquant." }, { status: 400 });

  try {
    await supprimerVideo(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[videos] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
