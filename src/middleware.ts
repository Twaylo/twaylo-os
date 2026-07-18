import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasValidApiSecret, verifySessionToken } from "@/lib/auth";

/**
 * Routes ouvertes. Les webhooks doivent rester publics : Telegram s'authentifie
 * avec son propre secret d'en-tête, pas avec le cookie de session.
 */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/telegram"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
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

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret)) {
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
