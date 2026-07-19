import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  creerObjectif,
  lireCible,
  lireObjectifs,
  majObjectif,
  supprimerObjectif,
  type ContenuCible,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les portées que la contrainte `check` de la table accepte. */
const PORTEES = ["semaine", "mois", "trimestre", "annee"];

/** Ce que le navigateur reçoit : la cible déjà décodée. */
function versVue(o: Awaited<ReturnType<typeof lireObjectifs>>[number]) {
  const cible = lireCible(o.cible);
  return {
    id: o.id,
    objectif: o.objectif,
    portee: o.portee,
    statut: o.statut,
    ...cible,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false, objectifs: [] });
  }
  try {
    const lignes = await lireObjectifs();
    return NextResponse.json({ connecte: true, objectifs: lignes.map(versVue) });
  } catch (err) {
    console.error("[objectifs] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Nettoie ce qui vient du navigateur avant de l'écrire. */
function cibleValide(brut: unknown): ContenuCible {
  const o = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  return {
    pct: typeof o.pct === "number" ? Math.min(100, Math.max(0, Math.round(o.pct))) : 0,
    valeur: typeof o.valeur === "string" ? o.valeur.slice(0, 40) : "",
    etapes: Array.isArray(o.etapes)
      ? o.etapes
          .filter(
            (e): e is { texte: string; fait: boolean } =>
              typeof e === "object" &&
              e !== null &&
              typeof (e as { texte?: unknown }).texte === "string" &&
              typeof (e as { fait?: unknown }).fait === "boolean",
          )
          .slice(0, 12)
          .map((e) => ({ texte: e.texte.slice(0, 160), fait: e.fait }))
      : [],
  };
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    /*
     * 503 et non 200.
     *
     * Un 200 sans champ `objectif` faisait pousser `undefined` dans la liste
     * côté navigateur, et la vue Objectifs plantait au rendu suivant. Une
     * création qui n'a pas eu lieu doit se dire comme telle.
     */
    return NextResponse.json(
      { error: "Base non configurée : impossible de créer un objectif." },
      { status: 503 },
    );
  }

  let corps: { objectif?: unknown; portee?: unknown; cible?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const objectif = typeof corps.objectif === "string" ? corps.objectif.trim() : "";
  if (!objectif) {
    return NextResponse.json({ error: "Objectif manquant." }, { status: 400 });
  }
  const portee = typeof corps.portee === "string" && PORTEES.includes(corps.portee)
    ? corps.portee
    : "mois";

  try {
    const ligne = await creerObjectif(objectif.slice(0, 160), portee, cibleValide(corps.cible));
    return NextResponse.json({ persiste: true, objectif: versVue(ligne) });
  } catch (err) {
    console.error("[objectifs] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: { id?: unknown; objectif?: unknown; cible?: unknown; statut?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof corps.id !== "string") {
    return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
  }

  /*
   * La cible réellement écrite est renvoyée au navigateur.
   *
   * `cibleValide` tronque à douze étapes et coupe les textes à 160 caractères.
   * Ces limites sont raisonnables, mais elles s'appliquaient en silence : la
   * réponse annonçait `persiste: true`, le client gardait ses treize étapes,
   * et la treizième disparaissait au rechargement suivant. Une troncature
   * n'est défendable que si le client la voit.
   */
  const cible = corps.cible !== undefined ? cibleValide(corps.cible) : undefined;

  try {
    await majObjectif(corps.id, {
      objectif:
        typeof corps.objectif === "string" ? corps.objectif.trim().slice(0, 160) : undefined,
      cible,
      statut:
        corps.statut === "en_cours" || corps.statut === "atteint" || corps.statut === "abandonne"
          ? corps.statut
          : undefined,
    });
    return NextResponse.json({ persiste: true, cible });
  } catch (err) {
    console.error("[objectifs] mise à jour impossible :", err);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
  }
  try {
    await supprimerObjectif(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[objectifs] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
