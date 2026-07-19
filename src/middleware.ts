import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasValidApiSecret, verifySessionToken } from "@/lib/auth";

/**
 * Routes ouvertes, listées une par une.
 *
 * Volontairement des chemins exacts et non des préfixes : avec un
 * `startsWith("/api/telegram")`, une future `/api/telegram/historique` serait
 * publique sans que rien ne le signale — aucun test n'échouerait, la route
 * répondrait simplement à tout le monde. Ouvrir un chemin doit rester un geste
 * délibéré.
 *
 * Le webhook Telegram doit rester public : Telegram s'authentifie avec son
 * propre secret d'en-tête, pas avec le cookie de session.
 */
const CHEMINS_PUBLICS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/telegram/webhook",
]);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (CHEMINS_PUBLICS.has(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET;

  // Ferme la porte si la configuration manque, plutôt que de laisser passer.
  // Un dashboard qui contient revenus et contacts ne doit pas s'ouvrir par
  // défaut sur une erreur de déploiement.
  if (!secret || !process.env.DASHBOARD_PASSWORD) {
    return new NextResponse(
      "Configuration manquante : AUTH_SECRET et DASHBOARD_PASSWORD doivent être définis.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (hasValidApiSecret(req.headers.get("x-api-secret"))) {
    return NextResponse.next();
  }

  // DASHBOARD_PASSWORD est garanti non vide par le garde ci-dessus. Il entre
  // dans la validation pour qu'en changer révoque toutes les sessions.
  const validee = await verifySessionToken(
    req.cookies.get(SESSION_COOKIE)?.value,
    secret,
    process.env.DASHBOARD_PASSWORD,
  );

  if (validee) {
    return NextResponse.next();
  }

  // Les routes API répondent 401 ; les pages redirigent vers le formulaire.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Tout sauf les assets statiques et les fichiers du dossier public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
