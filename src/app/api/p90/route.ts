import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  lireDealsP90,
  lireObjectifsP90,
  lireOrdreTaches,
  lireTachesGelees,
  lireTaches,
  trierSelon,
  versTaches,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'amorçage du cockpit : tout en un seul aller-retour.
 *
 * Les quatre modules lisent les MÊMES trois tables — la todo et le Kanban
 * partagent `tasks` ligne pour ligne, les Objectifs lisent les OP pour la
 * trésorerie. Une route par module aurait relu trois fois la même chose, et
 * sur une 4G de terrain chaque aller-retour coûte le réveil d'une fonction
 * serverless, pas quelques millisecondes.
 *
 * Rien n'est interprété ici : `statut`, `urgence` et `categorie` partent bruts,
 * et c'est `p90.ts` qui les lit — la même règle des deux côtés du réseau.
 *
 * CETTE ROUTE EST RELUE EN BOUCLE, toutes les quelques secondes, par chaque
 * écran ouvert : c'est ce qui fait que cocher une ligne sur le Mac se voit sur
 * le téléphone sans y toucher. D'où l'empreinte posée ci-dessous.
 */
export async function GET(requete: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ connecte: false }, { status: 200 });
  }

  try {
    const [taches, ops, objectifs, ordre, gelees] = await Promise.all([
      lireTaches(),
      lireDealsP90(),
      lireObjectifsP90(),
      lireOrdreTaches(),
      lireTachesGelees(),
    ]);

    const charge = {
      connecte: true,
      // Le gel est marqué ici, sur la liste déjà triée : il vit sur la
      // sentinelle et non dans la table, `versTaches` ne peut pas le connaître.
      taches: trierSelon(versTaches(taches), ordre).map((t) => ({
        ...t,
        gelee: gelees.includes(t.id),
      })),
      ops,
      objectifs,
    };

    /*
     * L'EMPREINTE : la réponse ne repart que si elle a changé.
     *
     * Chaque écran ouvert relit cette route toutes les quelques secondes, et
     * la très grande majorité du temps rien n'a bougé. Sans empreinte, c'est
     * une dizaine de kilo-octets de JSON renvoyés dans le vide à chaque
     * battement — sur le forfait du téléphone, des mégaoctets par heure
     * d'écran allumé, pour une liste identique.
     *
     * Le navigateur renvoie l'empreinte qu'il a (`if-none-match`) ; si elle
     * correspond, il reçoit un 304 vide et ne touche à rien. La lecture de la
     * base a lieu dans tous les cas — c'est le réseau qu'on économise, pas la
     * base, et c'est le réseau qui coûte en déplacement.
     *
     * `JSON.stringify` est appelé UNE fois, et c'est le texte haché qui part :
     * sérialiser deux fois pourrait donner deux ordres de clés différents, donc
     * deux empreintes différentes pour la même liste, et le 304 ne tomberait
     * jamais.
     */
    const corps = JSON.stringify(charge);
    const empreinte = `"${createHash("sha1").update(corps).digest("base64url")}"`;

    const entetes: Record<string, string> = {
      etag: empreinte,
      // Aucun cache intermédiaire ne doit garder ça : l'empreinte est gérée
      // ici, à la main, et un CDN qui servirait une copie la contournerait.
      "cache-control": "no-store, must-revalidate",
    };

    if (requete.headers.get("if-none-match") === empreinte) {
      return new NextResponse(null, { status: 304, headers: entetes });
    }

    return new NextResponse(corps, {
      status: 200,
      headers: { ...entetes, "content-type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    console.error("[p90] lecture impossible :", err);
    return NextResponse.json(
      { connecte: false, error: "Lecture de la base impossible." },
      { status: 500 },
    );
  }
}
