import { NextResponse } from "next/server";
import type { PushSubscription } from "web-push";
import { ajouterAbonnement, clesVapid, lireAbonnements, retirerAbonnements } from "@/lib/push";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * L'abonnement de l'iPhone aux notifications.
 *
 * GET    — la clé publique, que le navigateur exige pour s'abonner.
 * POST   — enregistre l'abonnement renvoyé par le navigateur.
 * DELETE — le retire (bouton « désactiver »).
 */

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "base non configurée" }, { status: 503 });
  }
  try {
    const [cles, abos] = await Promise.all([clesVapid(), lireAbonnements()]);
    return NextResponse.json({ clePublique: cles.publicKey, appareils: abos.length });
  } catch (err) {
    console.error("[push] clé publique indisponible :", err);
    return NextResponse.json({ error: "clé indisponible" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "base non configurée" }, { status: 503 });
  }

  let abo: PushSubscription;
  try {
    abo = (await req.json()) as PushSubscription;
  } catch {
    return NextResponse.json({ error: "corps illisible" }, { status: 400 });
  }

  /*
   * L'abonnement est vérifié avant d'être rangé.
   *
   * Il finit dans la sentinelle, une ligne relue et réécrite par six chemins
   * différents : y laisser entrer n'importe quelle forme, c'est risquer de
   * faire échouer une écriture sans rapport, bien plus tard.
   */
  const valide =
    abo &&
    typeof abo.endpoint === "string" &&
    abo.endpoint.startsWith("https://") &&
    abo.endpoint.length < 1000 &&
    typeof abo.keys?.p256dh === "string" &&
    typeof abo.keys?.auth === "string";
  if (!valide) {
    return NextResponse.json({ error: "abonnement invalide" }, { status: 400 });
  }

  try {
    const appareils = await ajouterAbonnement({
      endpoint: abo.endpoint,
      keys: { p256dh: abo.keys.p256dh, auth: abo.keys.auth },
    });
    return NextResponse.json({ ok: true, appareils });
  } catch (err) {
    console.error("[push] enregistrement impossible :", err);
    return NextResponse.json({ error: "enregistrement impossible" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "base non configurée" }, { status: 503 });
  }
  try {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    if (typeof endpoint !== "string") {
      return NextResponse.json({ error: "adresse manquante" }, { status: 400 });
    }
    await retirerAbonnements([endpoint]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[push] retrait impossible :", err);
    return NextResponse.json({ error: "retrait impossible" }, { status: 500 });
  }
}
