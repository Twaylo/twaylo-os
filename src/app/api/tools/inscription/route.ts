import { NextResponse } from "next/server";

import { envoiConfigure, envoyerConfirmation } from "@/lib/courriel";
import { adresse, souslaLimite } from "@/lib/limite";
import { adressePlausible, inscrire, normaliserEmail } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'inscription à la newsletter, porte d'entrée des Tway'tools.
 *
 * Publique par nature — c'est la première chose que fait un visiteur venu de
 * YouTube. Donc freinée : trois adresses par quart d'heure et par adresse IP,
 * cent pour tout le monde. Sans ce frein, une boucle inscrirait des milliers
 * d'adresses inventées, ferait exploser la facture d'envoi et surtout
 * détruirait la réputation d'expéditeur — donc la capacité des VRAIS messages
 * de Twaylo à arriver en boîte de réception.
 */
export async function POST(req: Request) {
  const ip = adresse(req);
  if (!souslaLimite(`inscription:${ip}`, 3, 900_000, 100)) {
    return NextResponse.json(
      { erreur: "trop_de_tentatives" },
      { status: 429, headers: { "retry-after": "900" } },
    );
  }

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ erreur: "requete_invalide" }, { status: 400 });
  }

  const { email, source, langue, piege } = (corps ?? {}) as Record<string, unknown>;

  /*
   * Le champ-piège.
   *
   * Un champ invisible que personne ne voit ni ne remplit — sauf un robot,
   * qui remplit tout ce qu'il trouve. Rempli, on répond « c'est envoyé » sans
   * rien faire : le robot croit avoir réussi et ne réessaie pas autrement.
   * Coût pour un humain : zéro.
   */
  if (typeof piege === "string" && piege.trim() !== "") {
    return NextResponse.json({ etat: "envoye" });
  }

  if (typeof email !== "string" || !adressePlausible(email)) {
    return NextResponse.json({ erreur: "adresse_invalide" }, { status: 400 });
  }

  if (!envoiConfigure() && process.env.NODE_ENV === "production") {
    console.error("[inscription] RESEND_API_KEY manquante");
    return NextResponse.json({ erreur: "envoi_indisponible" }, { status: 503 });
  }

  const langueSure = langue === "en" ? "en" : "fr";
  const sourceSure =
    typeof source === "string" && /^[a-z0-9-]{1,40}$/.test(source) ? source : "inconnue";

  try {
    const { jeton, dejaConfirme } = await inscrire(email, sourceSure, langueSure);

    /*
     * Déjà confirmée : on répond exactement comme pour une nouvelle
     * inscription, sans renvoyer de message. Répondre différemment
     * apprendrait à un inconnu qui tape une adresse au hasard si elle figure
     * ou non sur la liste.
     */
    if (dejaConfirme || !jeton) return NextResponse.json({ etat: "envoye" });

    const origine = new URL(req.url).origin;
    const lien = `${origine}/tway-tools/confirmation?jeton=${encodeURIComponent(jeton)}`;
    await envoyerConfirmation(normaliserEmail(email), lien, langueSure);

    return NextResponse.json({ etat: "envoye" });
  } catch (erreur) {
    // L'adresse n'apparaît pas dans le journal : elle n'a rien à y faire.
    console.error("[inscription] échec", erreur instanceof Error ? erreur.message : erreur);
    return NextResponse.json({ erreur: "envoi_impossible" }, { status: 502 });
  }
}
