import { NextResponse, type NextRequest } from "next/server";

import { ACCES_COOKIE, ACCES_MAX_AGE, creerAcces } from "@/lib/acces";
import { confirmer } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le clic depuis le courriel : on confirme, on ouvre, on redirige.
 *
 * Une ROUTE et non une page, parce qu'il faut poser un cookie — ce qu'un
 * rendu de page ne peut pas faire depuis Next 15. Le visiteur ne voit rien de
 * ce détour : il clique dans sa boîte mail et atterrit sur les outils, déjà
 * ouverts.
 */
export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("jeton") ?? "";
  const vers = (etat: string) => {
    const url = req.nextUrl.clone();
    url.pathname = "/tway-tools";
    url.search = `?${etat}`;
    return url;
  };

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("[confirmation] AUTH_SECRET manquante");
    return NextResponse.redirect(vers("etat=indisponible"));
  }

  let ok = false;
  try {
    ({ ok } = await confirmer(jeton));
  } catch (erreur) {
    console.error("[confirmation] échec", erreur instanceof Error ? erreur.message : erreur);
    return NextResponse.redirect(vers("etat=indisponible"));
  }

  /*
   * Lien déjà utilisé ou périmé. On ne dit pas lequel des deux : c'est sans
   * intérêt pour la personne, qui n'a qu'une chose à faire — redemander un
   * lien — et ça évite de renseigner qui essaierait des jetons au hasard.
   */
  if (!ok) return NextResponse.redirect(vers("etat=lien-perime"));

  const reponse = NextResponse.redirect(vers("etat=bienvenue"));
  reponse.cookies.set(ACCES_COOKIE, await creerAcces(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCES_MAX_AGE,
  });
  return reponse;
}
