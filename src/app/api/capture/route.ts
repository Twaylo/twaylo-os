import { NextResponse } from "next/server";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { routeCapture } from "@/lib/router/routeCapture";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * L'entrée du pipeline côté web (spec Partie 5, étape 4).
 * Le webhook Telegram appellera la même logique de tri.
 *
 * Tant que Supabase n'est pas configuré, la capture est classée et renvoyée
 * sans être persistée — l'interface reste utilisable, mais elle le dit.
 */
export async function POST(req: Request) {
  let texte: unknown;
  let source: unknown;

  try {
    ({ texte, source } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (typeof texte !== "string" || texte.trim().length === 0) {
    return NextResponse.json({ error: "Texte manquant." }, { status: 400 });
  }
  if (texte.length > 10_000) {
    return NextResponse.json({ error: "Texte trop long." }, { status: 413 });
  }

  const classification = await classifyCapture(texte);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      classification,
      persiste: false,
      note: "Supabase non configuré — la capture n'a pas été enregistrée.",
    });
  }

  try {
    /*
     * Le routage métier, enfin branché.
     *
     * Cette route écrivait sa propre ligne `captures` et s'arrêtait là :
     * `routeCapture` existait, était complet, et n'était appelé de nulle part.
     * Conséquence — dire « appeler le fixeur » rangeait une note dans une
     * boîte de réception que rien n'affiche, sans créer la tâche ; `traite`
     * restait faux et `routed_to` vide, donc le bouton « ⭐ Clé » de Telegram
     * ne pouvait rien corriger. La capture était classée puis oubliée.
     */
    const resultat = await routeCapture(
      texte.trim(),
      classification,
      source === "voix" || source === "texte" || source === "manuel" ? source : "web",
    );

    return NextResponse.json({
      classification,
      persiste: resultat.persiste,
      id: resultat.captureId,
      routedTo: resultat.routedTo,
    });
  } catch (err) {
    // Jamais de catch silencieux (spec Partie 10, bug 3) : la classification
    // est renvoyée quand même pour que l'idée ne soit pas perdue à l'écran.
    console.error("[capture] écriture Supabase impossible :", err);
    return NextResponse.json(
      {
        classification,
        persiste: false,
        note: "Classée, mais l'enregistrement a échoué.",
      },
      { status: 207 },
    );
  }
}
