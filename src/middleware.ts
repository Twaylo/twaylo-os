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
  /*
   * La page publique de présentation : c'est la porte d'entrée, elle ne
   * peut évidemment pas être derrière la porte. Elle n'affiche aucune
   * donnée — uniquement ce que le produit propose.
   */
  "/bienvenue",
  // Les crons Vercel ne savent envoyer que `Authorization: Bearer CRON_SECRET`
  // — pas de cookie, pas de x-api-secret. Chaque route vérifie ce secret
  // elle-même et refuse tout si la variable manque.
  "/api/cron/brief-matin",
  "/api/cron/recap-soir",
  // La carte de la piraterie, servie à « /piraterie » par une réécriture.
  // Ses ressources sont ouvertes juste en dessous, par préfixe.
  "/piraterie",
]);

/**
 * Le site public de la carte des attaques : ouvert en entier, par préfixe.
 *
 * C'est la seule exception à la règle des chemins exacts, et elle est
 * réfléchie. Ce dossier n'existe QUE pour être public — il contient une page,
 * ses deux fichiers de données, le fond de carte et une copie de MapLibre,
 * tous destinés à des spectateurs venus de YouTube qui n'ont aucun compte
 * ici. Les énumérer un par un donnerait six lignes qui se périmeraient à la
 * première ressource ajoutée, avec un symptôme trompeur : la carte
 * renverrait l'écran de connexion au lieu d'un fichier.
 *
 * Ce qui rend le préfixe sûr, c'est que rien de privé ne peut y arriver par
 * accident : le dossier est produit par les scripts de la carte, et le reste
 * de l'OS vit ailleurs.
 */
const PREFIXE_PUBLIC = "/piraterie/";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (CHEMINS_PUBLICS.has(pathname) || pathname.startsWith(PREFIXE_PUBLIC)) {
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

  /*
   * La racine mène à la PRÉSENTATION, pas au mot de passe.
   *
   * Quelqu'un qui arrive sans être connecté n'est pas forcément quelqu'un qui
   * a oublié de se connecter : c'est d'abord quelqu'un qui découvre. Le
   * renvoyer sur un champ de mot de passe, c'est une porte close sans
   * enseigne — et c'est ce qui arrivait aussi après une déconnexion.
   *
   * Les autres chemins gardent la connexion et leur destination : celui qui
   * visait `/demarrer` doit y revenir une fois entré, pas atterrir ailleurs.
   */
  const destination = req.nextUrl.clone();
  destination.search = "";
  if (pathname === "/") {
    destination.pathname = "/bienvenue";
  } else {
    destination.pathname = "/login";
    destination.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(destination);
}

export const config = {
  // Tout sauf les assets statiques et les fichiers du dossier public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
