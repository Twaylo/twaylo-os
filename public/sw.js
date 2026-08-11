/*
 * Le service worker : ce qui fait qu'ouvrir l'OS sans réseau affiche l'OS,
 * et non la page d'erreur d'iOS.
 *
 * Sans lui, une application posée sur l'écran d'accueil reste un site web
 * déguisé : coupe la connexion, et il ne reste rien à afficher — pas même le
 * squelette. Les données, elles, étaient déjà gardées sur le téléphone ; ce
 * qui manquait, c'était de quoi les afficher.
 *
 * AUCUN PRÉCHARGEMENT. La liste des fichiers change à chaque construction :
 * une liste écrite à la main serait fausse dès le déploiement suivant. Le
 * cache se remplit à l'usage, ce qui suffit — l'app est ouverte tous les
 * jours avec du réseau, et c'est là qu'elle se prépare pour les fois où il
 * n'y en aura pas.
 */

/*
 * La version vient de l'adresse du script (`/sw.js?v=…`), posée par la page.
 *
 * Un fichier statique ne change jamais d'un déploiement à l'autre : le
 * navigateur n'aurait donc aucune raison de le réinstaller, et les caches de
 * l'ancienne version resteraient en place. En faisant varier l'adresse, on
 * force la réinstallation, et le nom des caches change avec elle.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PAGES = `twaylo-pages-${VERSION}`;
const CACHE_FICHIERS = `twaylo-fichiers-${VERSION}`;

/* La page de secours, si même la coquille n'a jamais été mise en cache. */
const SECOURS = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Twaylo OS</title></head>
<body style="margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;
background:#07121d;color:#eef3f8;font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:34px">📡</div>
<h1 style="font-size:19px;margin:10px 0 8px">Pas de réseau</h1>
<p style="font-size:13px;line-height:1.5;color:rgba(255,255,255,0.5);margin:0">
Rouvre l'OS une fois connecté : il se gardera ensuite en mémoire pour marcher sans réseau.</p>
</div></body></html>`;

self.addEventListener("install", () => {
  // Prendre la main tout de suite : la version d'après ne doit pas attendre
  // que toutes les fenêtres soient fermées, il n'y en a qu'une.
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) {
        if (nom.startsWith("twaylo-") && !nom.endsWith(`-${VERSION}`)) {
          await caches.delete(nom);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/** Les fichiers dont le nom porte déjà une empreinte : ils ne changent jamais. */
function estUnFichierFige(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/icon" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/splash" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

/**
 * Une page : le réseau d'abord, le cache en secours.
 *
 * Le réseau d'abord, parce qu'une version déployée doit arriver dès la
 * prochaine ouverture. Le cache en secours, parce que c'est tout l'objet.
 */
async function page(requete) {
  const cle = new URL(requete.url).pathname;
  const cache = await caches.open(CACHE_PAGES);
  const copie = (await cache.match(cle)) ?? (await cache.match("/"));

  const reseau = fetch(requete).then(async (reponse) => {
    /*
     * On ne garde PAS une redirection.
     *
     * Sans cookie valable, le serveur renvoie l'écran de connexion : le mettre
     * en cache sous la clé « / » ferait afficher « connecte-toi » à chaque
     * ouverture hors réseau, sans aucun moyen de le faire.
     */
    if (reponse.ok && !reponse.redirected) await cache.put(cle, reponse.clone());
    return reponse;
  });

  /*
   * Sans copie de secours, le réseau a tout son temps.
   *
   * C'est le premier lancement : le limiter afficherait « pas de réseau » à
   * quelqu'un qui en a, simplement lent. Mieux vaut attendre que mentir.
   */
  if (!copie) {
    try {
      return await reseau;
    } catch {
      return new Response(SECOURS, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  }

  /*
   * Avec une copie, le réseau a deux secondes et demie.
   *
   * « Réseau d'abord » sans limite de temps veut dire : sur une 4G qui
   * accroche à peine — le cas réel, en déplacement — l'application reste sur
   * un écran vide tant que la requête n'a pas abouti, alors qu'une copie
   * parfaitement utilisable dort dans le cache. Passé le délai on sert la
   * copie ; la requête continue en arrière-plan et remplit le cache pour le
   * lancement suivant.
   */
  try {
    return await Promise.race([
      reseau,
      new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("délai")), 2500)),
    ]);
  } catch {
    return copie;
  }
}

/** Un fichier figé : le cache d'abord, c'est gratuit et c'est le même. */
async function fichier(requete) {
  const cache = await caches.open(CACHE_FICHIERS);
  const connu = await cache.match(requete);
  if (connu) return connu;
  try {
    const reponse = await fetch(requete);
    if (reponse.ok && !reponse.redirected) await cache.put(requete, reponse.clone());
    return reponse;
  } catch {
    // Un morceau de code manquant hors réseau : rien à afficher de mieux, mais
    // au moins pas d'erreur non gérée dans la console.
    return Response.error();
  }
}

/* ------------------------------------------------------------------ */
/* Les notifications                                                    */
/* ------------------------------------------------------------------ */

self.addEventListener("push", (evt) => {
  /*
   * Une notification DOIT être affichée à chaque message reçu.
   *
   * Les navigateurs révoquent l'autorisation d'une application qui reçoit des
   * messages sans rien montrer. D'où le repli : si la charge est illisible,
   * on affiche quand même quelque chose plutôt que rien.
   */
  let contenu = { titre: "Twaylo OS", corps: "", etiquette: "twaylo" };
  try {
    if (evt.data) contenu = { ...contenu, ...evt.data.json() };
  } catch {
    contenu.corps = "Ouvre l'OS.";
  }

  evt.waitUntil(
    self.registration.showNotification(contenu.titre, {
      body: contenu.corps,
      icon: "/icon",
      badge: "/icon",
      // Même étiquette = la nouvelle remplace l'ancienne. Trois relances non
      // lues empilées sur l'écran de verrouillage, on les balaie sans les lire.
      tag: contenu.etiquette || "twaylo",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (evt) => {
  evt.notification.close();
  evt.waitUntil(
    (async () => {
      // Rouvrir une seconde fenêtre alors que l'app est déjà ouverte serait
      // déroutant : on remet celle qui existe au premier plan.
      const fenetres = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const f of fenetres) {
        if (new URL(f.url).origin === self.location.origin) return f.focus();
      }
      return self.clients.openWindow("/");
    })(),
  );
});

self.addEventListener("fetch", (evt) => {
  const requete = evt.request;

  // Les écritures ne passent JAMAIS par ici : rejouer un POST depuis un cache
  // écrirait deux fois.
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  /*
   * La carte de la piraterie ne passe JAMAIS par ici.
   *
   * Elle partage le domaine de l'OS mais n'en fait pas partie : c'est un site
   * public, servi à des spectateurs venus de YouTube, avec sa propre stratégie
   * de cache posée dans les en-têtes HTTP.
   *
   * Sans cette sortie, le défaut était sévère et silencieux : `carte.js` et
   * `carte.css` finissent par « .js » et « .css », donc `estUnFichierFige` les
   * déclarait figés, et `fichier()` les sert depuis le cache SANS JAMAIS
   * revérifier. Leur adresse ne changeant pas d'une version à l'autre, la
   * toute première carte chargée restait affichée pour toujours — un
   * déploiement pouvait passer, le téléphone montrait encore l'ancienne.
   *
   * Ces fichiers n'ont rien à faire dans le cache hors-ligne de l'OS : personne
   * n'a besoin de consulter la carte des attaques dans un tunnel.
   */
  if (url.pathname === "/piraterie" || url.pathname.startsWith("/piraterie/")) return;

  /*
   * Les données ne sont jamais mises en cache.
   *
   * L'application garde déjà, elle-même, ce qu'il faut pour se peindre hors
   * réseau (progression, journée type, objectifs, état du jour). Un second
   * cache ici, invisible depuis le code, ressortirait des chiffres périmés
   * sans que rien ne le signale — et servirait une réponse d'hier à une
   * écriture d'aujourd'hui.
   */
  if (url.pathname.startsWith("/api/")) return;

  if (requete.mode === "navigate") {
    evt.respondWith(page(requete));
    return;
  }
  if (estUnFichierFige(url)) {
    evt.respondWith(fichier(requete));
  }
});
