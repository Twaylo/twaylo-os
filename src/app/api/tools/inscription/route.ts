import { NextResponse } from "next/server";

import { ACCES_COOKIE, ACCES_MAX_AGE, creerAcces } from "@/lib/acces";
import { envoiConfigure, envoyerBienvenue } from "@/lib/courriel";
import { adresse, souslaLimite } from "@/lib/limite";
import {
  adressePlausible,
  inscrire,
  nettoyerPrenom,
  normaliserEmail,
  prenomPlausible,
} from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * L'inscription, porte d'entrée des Tway'tools.
 *
 * Publique par nature — c'est la première chose que fait un visiteur venu de
 * YouTube. Donc freinée : trois inscriptions par quart d'heure et par adresse
 * IP, cent pour tout le monde. Sans ce frein, une boucle inscrirait des
 * milliers d'adresses inventées et pourrirait la liste de Twaylo.
 *
 * Prénom et adresse arrivent ensemble, l'inscription est immédiate, et le
 * laissez-passer part dans la même réponse : une seule étape entre le clic
 * dans la description de la vidéo et la carte.
 */
export async function POST(req: Request) {
  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ erreur: "requete_invalide" }, { status: 400 });
  }

  const { email, prenom, source, langue, piege } = (corps ?? {}) as Record<string, unknown>;

  /*
   * Le champ-piège.
   *
   * Un champ invisible que personne ne voit ni ne remplit — sauf un robot,
   * qui remplit tout ce qu'il trouve. Rempli, on répond « c'est bon » sans
   * rien faire ET SANS OUVRIR : le robot croit avoir réussi et ne réessaie
   * pas autrement. Coût pour un humain : zéro.
   */
  if (typeof piege === "string" && piege.trim() !== "") {
    return NextResponse.json({ etat: "inscrit" });
  }

  if (typeof prenom !== "string" || !prenomPlausible(prenom)) {
    return NextResponse.json({ erreur: "prenom_invalide" }, { status: 400 });
  }
  if (typeof email !== "string" || !adressePlausible(email)) {
    return NextResponse.json({ erreur: "adresse_invalide" }, { status: 400 });
  }

  /*
   * Le frein, posé APRÈS les vérifications de forme et pas avant.
   *
   * Deux corrections d'un même défaut, l'une et l'autre mesurées sur cette
   * porte :
   *
   *   · une adresse mal tapée consommait un essai. Trois fautes de frappe et
   *     la personne était bloquée un quart d'heure — sur un lien qui amène
   *     dix mille visiteurs, la faute de frappe est une certitude. Une saisie
   *     refusée ne coûte rien au serveur : elle ne compte donc plus ;
   *   · trois inscriptions par quart d'heure et par adresse IP était un
   *     chiffre pour un site de bureau. Les opérateurs mobiles font passer
   *     des milliers d'abonnés derrière une même adresse IP, et l'essentiel
   *     du public vient de YouTube sur téléphone : à trois, on fermait la
   *     porte à des opérateurs entiers.
   *
   * Vingt par quart d'heure et par adresse, six cents pour tout le monde :
   * assez large pour ne bloquer personne de réel, assez serré pour qu'une
   * boucle ne remplisse pas la liste de Twaylo d'adresses inventées.
   */
  const ip = adresse(req);
  if (!souslaLimite(`inscription:${ip}`, 20, 900_000, 600)) {
    return NextResponse.json(
      { erreur: "trop_de_tentatives" },
      { status: 429, headers: { "retry-after": "900" } },
    );
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Sans secret, aucun laissez-passer signé n'est fabricable. On le dit
    // plutôt que d'inscrire quelqu'un pour le laisser devant la porte.
    console.error("[inscription] AUTH_SECRET manquante");
    return NextResponse.json({ erreur: "indisponible" }, { status: 503 });
  }

  const langueSure = langue === "en" ? "en" : "fr";
  const sourceSure =
    typeof source === "string" && /^[a-z0-9-]{1,40}$/.test(source) ? source : "inconnue";
  const prenomSur = nettoyerPrenom(prenom);

  /*
   * Ce qui suit ne doit JAMAIS laisser quelqu'un dehors.
   *
   * Le jour de la sortie d'une vidéo, une base indisponible — ou une table
   * pas encore créée — ne peut pas se traduire par « accès refusé » pour tout
   * le monde. On enregistre si on peut, on ouvre dans tous les cas, et
   * l'échec part dans les journaux où il sera vu.
   */
  let enregistre = false;
  let jeton: string | null = null;
  try {
    const resultat = await inscrire(email, prenomSur, sourceSure, langueSure);
    jeton = resultat.jeton;
    enregistre = true;
  } catch (erreur) {
    // L'adresse n'apparaît pas dans le journal : elle n'a rien à y faire.
    console.error("[inscription] échec", erreur instanceof Error ? erreur.message : erreur);
  }

  const reponse = NextResponse.json({ etat: "inscrit", enregistre });
  reponse.cookies.set(ACCES_COOKIE, await creerAcces(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCES_MAX_AGE,
  });

  /*
   * Le mot de bienvenue part APRÈS coup et sans qu'on l'attende : la personne
   * a déjà sa réponse et sa carte. Il n'est envoyé que si un service d'envoi
   * est configuré — son absence n'empêche plus rien.
   */
  if (enregistre && jeton && envoiConfigure()) {
    const origine = new URL(req.url).origin;
    void envoyerBienvenue(
      normaliserEmail(email),
      prenomSur,
      `${origine}/piraterie`,
      langueSure,
    );
  }

  return reponse;
}
