import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  creerObjectif,
  ecrireOrdreObjectifs,
  lireCible,
  lireOrdreObjectifs,
  majObjectif,
  supprimerObjectif,
  type ContenuCible,
} from "@/lib/db";
import { estHorizon } from "@/lib/p90";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * LES OBJECTIFS DE TWAYLO, PAR HORIZON — semaine, mois, trimestre, année.
 *
 * L'onglet d'avant le Projet 90 les gérait déjà, dans la table `goals` ; cette
 * route en reprend les gestes : créer, cocher une étape, régler la
 * progression, changer d'horizon, archiver, effacer, ranger.
 *
 * La lecture n'est pas ici : elle passe par `/api/p90`, avec tout le reste,
 * pour que la relecture vivante couvre aussi les objectifs.
 */

/** Ce qui vient du navigateur, borné avant d'être écrit. */
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
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { titre?: unknown; horizon?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const titre = typeof corps.titre === "string" ? corps.titre.trim().slice(0, 160) : "";
  if (!titre) return NextResponse.json({ error: "Objectif manquant." }, { status: 400 });
  const horizon = estHorizon(corps.horizon) ? corps.horizon : "mois";

  try {
    const ligne = await creerObjectif(titre, horizon, { pct: 0, valeur: "", etapes: [] });
    const cible = lireCible(ligne.cible);
    return NextResponse.json({
      persiste: true,
      but: {
        id: ligne.id,
        titre: ligne.objectif,
        horizon: ligne.portee,
        statut: ligne.statut,
        ...cible,
      },
    });
  } catch (err) {
    console.error("[p90/buts] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: {
    id?: unknown;
    titre?: unknown;
    horizon?: unknown;
    statut?: unknown;
    cible?: unknown;
    ordre?: unknown;
  };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    /*
     * L'ordre : fusionné avec celui que le serveur connaît.
     *
     * Le navigateur n'envoie que ce qu'il voyait. Un objectif créé entre-temps
     * sur l'autre appareil en serait absent — l'écrire tel quel le renverrait
     * en fin de colonne. On le réinsère à son ancien rang.
     */
    if (Array.isArray(corps.ordre)) {
      const ids = corps.ordre.filter((x): x is string => typeof x === "string").slice(0, 200);
      const anciens = await lireOrdreObjectifs();
      const envoyes = new Set(ids);
      const fusion = [...ids];
      anciens.forEach((id, rang) => {
        if (!envoyes.has(id)) fusion.splice(Math.min(rang, fusion.length), 0, id);
      });
      await ecrireOrdreObjectifs([...new Set(fusion)]);
      return NextResponse.json({ persiste: true });
    }

    if (typeof corps.id !== "string" || !corps.id) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    await majObjectif(corps.id, {
      objectif:
        typeof corps.titre === "string" && corps.titre.trim() ? corps.titre.trim().slice(0, 160) : undefined,
      portee: estHorizon(corps.horizon) ? corps.horizon : undefined,
      statut:
        corps.statut === "en_cours" || corps.statut === "atteint" || corps.statut === "abandonne"
          ? corps.statut
          : undefined,
      cible: corps.cible !== undefined ? cibleValide(corps.cible) : undefined,
    });
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/buts] modification impossible :", err);
    return NextResponse.json({ error: "Modification impossible." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  try {
    await supprimerObjectif(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[p90/buts] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
