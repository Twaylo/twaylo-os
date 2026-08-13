import { NextResponse, type NextRequest } from "next/server";
import { ACCES_COOKIE, accesValide } from "@/lib/acces";
import { HOTE_OUTILS, estCheminDemenage, estCheminOutil, estHoteOS } from "@/lib/hotes";
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
  // Créer un OS : forcément ouvert, personne n'a encore de compte.
  "/api/auth/creer",
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
  /*
   * Le sas est ouvert : on ne peut pas exiger un compte de quelqu'un qui
   * vient précisément en créer un. Son premier écran demande si l'on continue
   * avec son OS ou si l'on en crée un nouveau, et les routes qui ÉCRIVENT
   * (`/api/sas/appliquer`) restent, elles, derrière la porte.
   */
  "/demarrer",
  // Les crons Vercel ne savent envoyer que `Authorization: Bearer CRON_SECRET`
  // — pas de cookie, pas de x-api-secret. Chaque route vérifie ce secret
  // elle-même et refuse tout si la variable manque.
  "/api/cron/brief-matin",
  "/api/cron/recap-soir",
  /*
   * Les trois fichiers d'un site publié : le plan, les règles pour les
   * robots, et l'image de partage.
   *
   * Ils DOIVENT être ouverts. Un moteur qui reçoit la page de connexion à la
   * place de `robots.txt` considère qu'il n'y a pas de règles et fait ce qu'il
   * veut ; un réseau social qui reçoit du HTML à la place d'une image affiche
   * un lien nu. Aucun ne présente le moindre cookie.
   *
   * Ce qu'on ouvre : une liste de trois adresses publiques, une consigne
   * d'indexation, et une image dessinée à partir de rien.
   */
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  /*
   * « /piraterie » N'EST PLUS listé ici, et c'est délibéré : c'est désormais
   * la porte des Tway'tools qui décide, plus bas. L'y remettre rouvrirait
   * l'outil à tous sans que rien ne le signale.
   */
]);

/**
 * Les Tway'tools : la bibliothèque, sa porte, et l'API qui les sert.
 *
 * Tout est ouvert ici — on ne peut pas demander un compte à quelqu'un qui
 * vient précisément donner son adresse. Les routes qui ÉCRIVENT sont freinées
 * chez elles, par `lib/limite`.
 */
const PREFIXES_OUVERTS = ["/tway-tools", "/api/tools/"];

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

/** La page de l'outil elle-même — la seule chose que la porte protège. */
const PREFIXE_OUTIL = "/piraterie";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  /*
   * Premier tri : sur quel site sommes-nous ?
   *
   * Sur une adresse qui n'est pas celle de l'OS, ce déploiement ne connaît
   * que les Tway'tools. La bibliothèque prend la racine, et tout ce qui
   * appartient à l'OS répond « introuvable » — pas une redirection, qui
   * donnerait l'adresse qu'on cherche justement à ne pas montrer.
   *
   * On sert « /tway-tools/index.html » directement plutôt que « /tway-tools » :
   * la réécriture qui mène de l'un à l'autre est examinée plus loin dans la
   * chaîne, et compter dessus depuis ici serait un pari inutile.
   */
  if (!estHoteOS(req.headers.get("host"))) {
    if (pathname === "/") {
      const accueil = req.nextUrl.clone();
      accueil.pathname = "/tway-tools/index.html";
      return NextResponse.rewrite(accueil);
    }
    if (!estCheminOutil(pathname)) {
      return new NextResponse("Introuvable", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  } else if (estCheminDemenage(pathname)) {
    /*
     * L'ancienne porte, murée.
     *
     * Les Tway'tools répondaient aussi sous l'adresse de l'OS, puisqu'ils y
     * sont nés. On les y a d'abord redirigés vers leur nouvelle adresse —
     * et vu de l'écran, ça donnait : « je tape twaylo-os, ça m'affiche
     * tway-tools ». Deux sites censés être séparés qui se renvoient l'un
     * vers l'autre, c'est exactement l'impression qu'il fallait supprimer.
     *
     * Ils répondent donc « introuvable », comme n'importe quelle page qui
     * n'existe pas. L'adresse de l'OS ne mène plus qu'à l'OS, celle des
     * outils ne mène qu'aux outils, et rien ne circule entre les deux.
     */
    return new NextResponse(
      `Cette page a déménagé sur ${HOTE_OUTILS}.`,
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (
    CHEMINS_PUBLICS.has(pathname) ||
    PREFIXES_OUVERTS.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  /*
   * La porte des Tway'tools.
   *
   * Elle ne tient QUE sur la page de l'outil, jamais sur ses données. Deux
   * raisons, et la seconde compte plus que la première :
   *
   *   · les données sont servies par le CDN, en cache pendant vingt-quatre
   *     heures. Les faire passer par ici, ce serait les faire retraverser le
   *     serveur à chaque visite — exactement ce qu'on vient d'éviter en les
   *     découpant en tranches ;
   *   · ce ne sont pas des secrets. Ce sont les rapports publics d'une agence
   *     américaine. La porte sert à faire connaître la newsletter à qui vient
   *     de YouTube, pas à cadenasser des données que la NGA a publiées.
   *
   * Qui sait fabriquer une requête peut donc lire le JSON brut. C'est assumé :
   * le prix d'un vrai verrou serait payé par tous les visiteurs, à chaque
   * chargement, pour arrêter quelqu'un qui n'a de toute façon pas besoin de
   * l'outil pour lire un fichier public.
   */
  if (pathname === PREFIXE_OUTIL) {
    /*
     * La porte ne se ferme QUE si elle peut s'ouvrir.
     *
     * Une seule condition désormais : `AUTH_SECRET`, qui signe le
     * laissez-passer. Sans elle, aucun cookie valable ne peut être fabriqué,
     * donc fermer reviendrait à condamner l'outil pour tout le monde.
     *
     * La clé d'envoi de courriels ne fait PLUS partie de la condition, et
     * c'est le cœur du changement : l'inscription est immédiate, le courriel
     * n'est qu'un mot de bienvenue. Faire dépendre l'entrée d'un service
     * d'envoi, c'était laisser la porte grande ouverte tant qu'il n'était pas
     * configuré — exactement ce qui se passait.
     */
    const secret = process.env.AUTH_SECRET;
    if (!secret) return NextResponse.next();

    if (await accesValide(req.cookies.get(ACCES_COOKIE)?.value, secret)) {
      return NextResponse.next();
    }
    const porte = req.nextUrl.clone();
    porte.pathname = "/tway-tools/acces";
    porte.search = `?outil=pirats-attack`;

    /*
     * « no-store », et ce n'est pas une précaution de principe.
     *
     * Sans cet en-tête, le navigateur garde la redirection en mémoire. Le
     * parcours réel devient alors : on clique le lien de la vidéo → porte
     * (redirection retenue) → on donne son prénom et son adresse → on revient
     * sur la carte → le navigateur rejoue sa redirection et RENVOIE À LA
     * PORTE, indéfiniment. Reproduit au navigateur, corrigé ici.
     *
     * La réponse dépend d'un cookie : elle ne doit jamais être resservie
     * telle quelle.
     */
    const versLaPorte = NextResponse.redirect(porte);
    versLaPorte.headers.set("cache-control", "no-store");
    return versLaPorte;
  }

  if (pathname.startsWith(PREFIXE_PUBLIC)) return NextResponse.next();

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
