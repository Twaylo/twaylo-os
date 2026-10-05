import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  archiverTache,
  basculerTacheGelee,
  creerTache,
  ecrireOrdreTaches,
  majTache,
  supprimerTache,
  supprimerTachesFaites,
  versTaches,
  type TacheDB,
} from "@/lib/db";
import { estIdBloc, type IdBloc } from "@/lib/p90";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Le JSON de la meta tient en 300 caractères ; au-delà, ce n'en est plus une. */
const MAX_META = 300;
const MAX_TITRE = 300;

function texte(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Crée une tâche. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { titre?: unknown; meta?: unknown; bloc?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const titre = texte(corps.titre, MAX_TITRE);
  if (!titre) return NextResponse.json({ error: "Titre manquant." }, { status: 400 });

  try {
    const ligne = await creerTache(
      titre,
      texte(corps.meta, MAX_META),
      estIdBloc(corps.bloc) ? corps.bloc : undefined,
    );
    return NextResponse.json({ persiste: true, tache: versTaches([ligne])[0] });
  } catch (err) {
    console.error("[p90/taches] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/**
 * Modifie une tâche, ou réordonne la liste entière.
 *
 * Un seul verbe parce qu'un seul geste : cocher, renommer, changer de bloc,
 * déplacer une carte du Kanban, geler — tout décrit une modification partielle
 * de l'existant, et tout part dans la même écriture.
 */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: {
    id?: unknown;
    statut?: unknown;
    titre?: unknown;
    meta?: unknown;
    bloc?: unknown;
    ordre?: unknown;
    gelee?: unknown;
  };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    // L'ordre complet de la liste : indépendant de toute tâche précise.
    if (Array.isArray(corps.ordre)) {
      const ids = corps.ordre.filter((x): x is string => typeof x === "string").slice(0, 300);
      await ecrireOrdreTaches(ids);
      return NextResponse.json({ persiste: true });
    }

    if (typeof corps.id !== "string" || !corps.id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    if (typeof corps.gelee === "boolean") {
      const gelees = await basculerTacheGelee(corps.id, corps.gelee);
      return NextResponse.json({ persiste: true, gelees });
    }

    const patch: {
      statut?: string;
      titre?: string;
      categorie?: string | null;
      bloc?: IdBloc;
    } = {};
    if (typeof corps.statut === "string") patch.statut = corps.statut;
    const titre = texte(corps.titre, MAX_TITRE);
    if (titre) patch.titre = titre;
    // `null` est une valeur à part entière ici : c'est « vider la meta ».
    if (corps.meta === null) patch.categorie = null;
    else if (typeof corps.meta === "string") patch.categorie = texte(corps.meta, MAX_META);
    if (estIdBloc(corps.bloc)) patch.bloc = corps.bloc;

    await majTache(corps.id, patch);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/taches] modification impossible :", err);
    return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
  }
}

/**
 * Supprimer, c'est ARCHIVER — pas effacer.
 *
 * Une tâche retirée de la todo part aux Oubliés, où un geste la ramène. C'est
 * le filet : un clic de travers sur une liste de vingt lignes ne doit pas
 * détruire ce qui était écrit. L'effacement définitif existe (`definitif=1`),
 * et il se fait depuis l'onglet Oubliés, là où l'on voit ce qu'on vise.
 *
 * `faites=1` vide les tâches cochées — le « passer au jour suivant ».
 */
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (url.searchParams.get("faites") === "1") {
      await supprimerTachesFaites();
      return NextResponse.json({ persiste: true });
    }
    if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });

    if (url.searchParams.get("definitif") === "1") await supprimerTache(id);
    else await archiverTache(id);

    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/taches] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}

export type { TacheDB };
