import { NextResponse } from "next/server";
import { envoyerNotification } from "@/lib/push";

/**
 * Envoie une notification de test.
 *
 * Elle existe pour une raison pratique : sans elle, la seule façon de savoir
 * si les notifications marchent serait d'attendre le lendemain matin. Le
 * bouton « Tester » répond en trois secondes.
 */
export async function POST() {
  const atteints = await envoyerNotification({
    titre: "Twaylo OS",
    corps: "Les notifications marchent. À demain 6 h pour ta to-do.",
    etiquette: "test",
  });
  return NextResponse.json({ ok: atteints > 0, appareils: atteints });
}
