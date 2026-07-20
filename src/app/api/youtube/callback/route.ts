import { NextResponse } from "next/server";
import { echangerCode, youtubeConfigure } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le retour de Google après consentement.
 *
 * On échange le code contre un refresh token, puis on renvoie Twaylo sur
 * l'onglet Revenus. Aucun jeton ne transite par l'URL de redirection.
 */
export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  if (!youtubeConfigure()) {
    return NextResponse.redirect(`${base}/?yt=config`);
  }

  const params = new URL(req.url).searchParams;
  const erreur = params.get("error");
  if (erreur) {
    console.warn("[youtube] consentement refusé :", erreur);
    return NextResponse.redirect(`${base}/?yt=refus`);
  }

  const code = params.get("code");
  if (!code) return NextResponse.redirect(`${base}/?yt=sanscode`);

  try {
    await echangerCode(code);
    return NextResponse.redirect(`${base}/?yt=ok`);
  } catch (err) {
    console.error("[youtube] échange impossible :", err);
    return NextResponse.redirect(`${base}/?yt=echec`);
  }
}
