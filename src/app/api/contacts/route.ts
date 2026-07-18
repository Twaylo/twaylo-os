import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { creerContact, majContact, supprimerContact, versContacts } from "@/lib/db";

const RELATIONS = ["chaud", "tiede", "froid", "actif"];
const TYPES = ["collab", "sponsor", "investisseur", "fournisseur", "equipe", "audience"];

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let nom: unknown;
  let type: unknown;
  try {
    ({ nom, type } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof nom !== "string" || nom.trim().length === 0) {
    return NextResponse.json({ error: "Nom manquant." }, { status: 400 });
  }

  try {
    const ligne = await creerContact(
      nom.trim(),
      typeof type === "string" && TYPES.includes(type) ? type : "collab",
    );
    return NextResponse.json({ persiste: true, contact: versContacts([ligne])[0] });
  } catch (err) {
    console.error("[contacts] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/** Change la chaleur de la relation, ou la prochaine action. */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let id: unknown;
  let relation: unknown;
  let prochaineAction: unknown;
  try {
    ({ id, relation, prochaineAction } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof id !== "string") {
    return NextResponse.json({ error: "`id` invalide." }, { status: 400 });
  }

  const patch: { relation?: string; prochaine_action?: string | null } = {};
  if (typeof relation === "string" && RELATIONS.includes(relation)) {
    patch.relation = relation;
  }
  if (typeof prochaineAction === "string") {
    // Une chaîne vide efface la prochaine action, ce qui est un choix valide.
    patch.prochaine_action = prochaineAction.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  }

  try {
    await majContact(id, patch);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[contacts] mise à jour impossible :", err);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "`id` manquant." }, { status: 400 });

  try {
    await supprimerContact(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[contacts] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
