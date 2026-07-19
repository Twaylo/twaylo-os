import { NextResponse } from "next/server";
import { agendaConfigure, lireAgendaSemaine } from "@/lib/agenda";

// Le parseur ICS est un module Node, et la réponse dépend de l'heure : rien
// ici ne peut être calculé au build.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Les événements de la semaine en cours.
 *
 * L'URL iCal secrète ne quitte jamais le serveur : le navigateur reçoit des
 * événements déjà déroulés, jamais de quoi relire l'agenda entier.
 */
export async function GET() {
  if (!agendaConfigure()) {
    return NextResponse.json({ connecte: false, evenements: [] });
  }

  try {
    return NextResponse.json({
      connecte: true,
      evenements: await lireAgendaSemaine(),
    });
  } catch (err) {
    console.error("[agenda] lecture impossible :", err);
    // Un agenda injoignable ne doit pas casser l'accueil : la carte affichera
    // simplement qu'elle n'est pas connectée.
    return NextResponse.json(
      { connecte: false, evenements: [], error: "Agenda injoignable." },
      { status: 200 },
    );
  }
}
