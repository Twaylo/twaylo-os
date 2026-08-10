import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  hasValidApiSecret,
  lireExpiration,
  verifySessionToken,
} from "@/lib/auth";

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
  /*
   * Le manifeste et les icônes : ouverts, et il le FAUT.
   *
   * Le navigateur va chercher `manifest.webmanifest` sans envoyer les
   * cookies (requête sans identifiants, par spécification). Derrière la
   * porte, il recevait donc la page de connexion à la place du JSON — le
   * manifeste était invalide et l'OS ne s'installait pas comme application.
   *
   * Ce qu'on ouvre : un nom, une couleur de fond et un logo. Aucune donnée.
   */
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  /*
   * Le service worker, ouvert lui aussi, et il le FAUT.
   *
   * Le filtre du middleware laisse passer les images et `_next/static`, mais
   * pas un `.js` du dossier public : derrière la porte, `/sw.js` recevait la
   * page de connexion en HTML à la place du script. L'installation échouait,
   * et l'OS restait un site qui a besoin du réseau.
   *
   * Ce qu'on ouvre : une stratégie de mise en cache. Aucune donnée, et le
   * script refuse d'ailleurs de toucher aux routes `/api/`.
   */
  "/sw.js",
  /*
   * L'image de lancement d'iOS : réclamée sans cookie, comme le manifeste.
   * Derrière la porte, elle recevait la page de connexion en HTML, et iOS
   * repeignait alors son fond blanc au démarrage.
   *
   * Ce qu'on ouvre : un logo sur fond sombre, aux dimensions bornées.
   */
  "/splash",
  // Les crons Vercel ne savent envoyer que `Authorization: Bearer CRON_SECRET`
  // — pas de cookie, pas de x-api-secret. Chaque route vérifie ce secret
  // elle-même et refuse tout si la variable manque.
  "/api/cron/brief-matin",
  "/api/cron/recap-soir",
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
  const jeton = req.cookies.get(SESSION_COOKIE)?.value;
  const validee = await verifySessionToken(jeton, secret, process.env.DASHBOARD_PASSWORD);

  if (validee) {
    const res = NextResponse.next();

    /*
     * Session glissante : le cookie se renouvelle quand il a vieilli.
     *
     * Posé sur l'écran d'accueil, l'OS est une application ; une application
     * qui redemande un mot de passe toutes les semaines n'en est pas une.
     * Mais rallonger simplement la durée allongerait aussi la fenêtre pendant
     * laquelle un cookie volé reste utilisable. Le glissement règle les deux :
     * qui ouvre l'OS régulièrement n'est plus jamais déconnecté, et un cookie
     * laissé de côté meurt toujours au bout de sept jours.
     *
     * Renouvelé au plus une fois tous les deux jours — pas à chaque requête,
     * sinon chaque page renverrait un Set-Cookie inutile.
     */
    const exp = lireExpiration(jeton);
    const restant = exp === null ? null : exp - Date.now();
    if (restant !== null && restant < (SESSION_MAX_AGE - 2 * 86_400) * 1000) {
      res.cookies.set(
        SESSION_COOKIE,
        await createSessionToken(secret, process.env.DASHBOARD_PASSWORD),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: SESSION_MAX_AGE,
        },
      );
    }
    return res;
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
