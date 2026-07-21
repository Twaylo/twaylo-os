import { NextResponse } from "next/server";
import { echangerCode, youtubeConfigure } from "@/lib/youtube";
import { YT_STATE_COOKIE } from "../connect/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le retour de Google après consentement.
 *
 * On vérifie d'abord que le `state` renvoyé correspond à celui qu'on avait
 * posé en cookie : sinon le retour n'a pas été initié par cette session (CSRF),
 * on refuse avant tout échange. Puis on échange le code contre un refresh
 * token. Aucun jeton ne transite par l'URL de redirection.
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

  const attendu = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${YT_STATE_COOKIE}=`))
    ?.slice(YT_STATE_COOKIE.length + 1);
  const recu = params.get("state");

  if (!attendu || !recu || attendu !== recu) {
    console.warn("[youtube] state OAuth invalide — retour rejeté.");
    return NextResponse.redirect(`${base}/?yt=echec`);
  }

  const code = params.get("code");
  if (!code) return NextResponse.redirect(`${base}/?yt=sanscode`);

  try {
    await echangerCode(code);
    const res = NextResponse.redirect(`${base}/?yt=ok`);
    // Le state a fait son office : on le retire.
    res.cookies.set(YT_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[youtube] échange impossible :", err);
    return NextResponse.redirect(`${base}/?yt=echec`);
  }
}
