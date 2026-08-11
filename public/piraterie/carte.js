/**
 * Carte mondiale des attaques contre des navires — base ASAM de la NGA.
 *
 * Tout ce qui est affiché vient des fichiers de `donnees/`, produits par
 * `scripts/asam-recuperer.mjs`. Ce script ne fait que dessiner et filtrer. Il
 * n'ajoute aucune donnée, n'en corrige aucune, et laisse vide ce que la
 * source laisse vide.
 *
 * Les textes de l'interface vivent dans `i18n.js`, jamais ici.
 */

/*
 * MapLibre 6 n'expose que des exports nommés — pas d'export par défaut. On
 * prend exactement les quatre pièces utilisées, ce qui a l'avantage de lister
 * en une ligne tout ce que la page emprunte à la bibliothèque.
 *
 * `Map` est renommée : le nom est déjà pris par la structure de données du
 * même nom, utilisée partout ailleurs.
 */
import {
  Map as CarteGL,
  NavigationControl,
  Popup,
  ScaleControl,
} from "/piraterie/vendeur/maplibre-gl.mjs";
import { EQUIVALENTS, TEXTES } from "/piraterie/i18n.js?v=8";

const CHEMIN = "/piraterie";
const $ = (id) => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════════════
   Langue

   Choisie dans cet ordre : l'adresse, puis les préférences du navigateur,
   puis l'anglais. Rien n'est stocké — pas de cookie, pas de mémoire locale ;
   le choix voyage dans l'adresse, ce qui le rend partageable au passage.
   ═══════════════════════════════════════════════════════════════════════ */

let langue = choisirLangue();
let mots = TEXTES[langue];
let nombreLocal = new Intl.NumberFormat(mots.langue);
let dateLocale = formatDate();

function choisirLangue() {
  const demandee = new URLSearchParams(location.search).get("lang");
  if (demandee && TEXTES[demandee]) return demandee;
  for (const etiquette of navigator.languages ?? [navigator.language ?? ""]) {
    if (etiquette.toLowerCase().startsWith("fr")) return "fr";
  }
  return "en";
}

function formatDate() {
  return new Intl.DateTimeFormat(mots.langue, {
    day: "numeric",
    month: "long",
    year: "numeric",
    // En UTC, et il le faut : « 1978-05-01 » lu dans un fuseau à l'ouest de
    // Greenwich deviendrait le 30 avril à l'affichage.
    timeZone: "UTC",
  });
}

/** Traduit une clé, en remplaçant les {jetons} par les valeurs fournies. */
function t(cle, valeurs) {
  let texte = mots[cle] ?? cle;
  if (valeurs) {
    for (const [nom, valeur] of Object.entries(valeurs)) {
      texte = texte.replaceAll(`{${nom}}`, valeur);
    }
  }
  return texte;
}

const jourDe = (iso) => dateLocale.format(new Date(`${iso}T00:00:00Z`));

/** Repeint tous les textes statiques de la page. */
function appliquerLangue() {
  mots = TEXTES[langue];
  nombreLocal = new Intl.NumberFormat(mots.langue);
  dateLocale = formatDate();

  document.documentElement.lang = langue;
  document.title = `${t("titre")} — ${t("carteAria")}`;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  }

  for (const bouton of document.querySelectorAll("#langues button")) {
    bouton.setAttribute("aria-pressed", String(bouton.dataset.langue === langue));
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Catégories de filtres

   La base ne normalise rien : « PIRATES », « Pirates » et « pirates » y sont
   trois entrées distinctes, et le type de navire va jusqu'à
   « Denmark-flagged tanker TORM AMALIE ». Tels quels, 452 libellés
   d'agresseur et 1 778 de navire ne font pas des filtres utilisables.

   On les regroupe par mot-clé, dans l'ordre — le premier motif qui
   correspond gagne, d'où « SUSPICIOUS » avant « CRAFT » et « UNKNOWN » avant
   « VESSEL ».

   Chaque groupe porte une CLÉ stable, jamais un libellé traduit : c'est elle
   qui part dans l'adresse partagée. Sans cela, un lien créé en français
   n'afficherait rien une fois ouvert en anglais.
   ═══════════════════════════════════════════════════════════════════════ */

const REGLES_TYPE = [
  [/PIRAT/i, "pirates"],
  [/SUSPICI/i, "suspect"],
  [/ROBBER|THIEF|THIEVES|THEFT|BURGLAR/i, "vol"],
  [/HIJACK/i, "detournement"],
  [/KIDNAP|ABDUCT|HOSTAGE/i, "enlevement"],
  [/BOARD/i, "abordage"],
  [/ASSAILANT|ATTACK|ARMED/i, "armes"],
  [/INTRUD|STOWAWAY/i, "intrusion"],
  [/SPEED ?BOAT|SKIFF|CANOE|DHOW|CRAFT|BOAT/i, "embarcation"],
  [/MILITAR|NAVY|NAVAL|COAST ?GUARD|GUNBOAT/i, "militaire"],
];

const REGLES_NAVIRE = [
  [/UNKNOWN/i, "inconnu"],
  [/TANKER/i, "petrolier"],
  [/BULK/i, "vraquier"],
  [/CONTAINER/i, "conteneurs"],
  [/FISH|TRAWLER/i, "peche"],
  [/YACHT|SAIL/i, "voilier"],
  [/TUG|BARGE|TOW/i, "remorqueur"],
  [/OFFSHORE|SUPPLY|PLATFORM|DRILL|\bRIG\b/i, "offshore"],
  [/PASSENGER|CRUISE|FERRY/i, "passagers"],
  [/CARGO|FREIGHT/i, "cargo"],
  [/MERCHANT|VESSEL|SHIP|MOTOR/i, "marchand"],
];

const INCONNU = "inconnu";

function categoriser(libelle, regles) {
  if (!libelle) return INCONNU;
  for (const [motif, cle] of regles) {
    if (motif.test(libelle)) return cle;
  }
  return INCONNU;
}

/*
 * L'échelle de gravité. Les couleurs ne servent QUE si l'on active
 * « Colorer » : par défaut la flotte est d'un seul jaune, parce que la
 * première chose à voir est la densité — où le monde est attaqué — et non le
 * détail de chaque coque.
 */
const GRAVITE = [
  { code: 3, couleur: "#f2545b" },
  { code: 2, couleur: "#ff8a5b" },
  { code: 1, couleur: "#ffb35c" },
  { code: 0, couleur: "#ffd98e" },
  { code: -1, couleur: "#7a8fa6" },
];
/*
 * L'ambre de la flotte au repos.
 *
 * Ces cinq valeurs doublent celles de `carte.css` (--ambre, --feu-1..4) :
 * MapLibre peint dans un canevas WebGL, où aucune variable CSS n'entre. Les
 * changer ici sans les changer là-bas, ou l'inverse, ferait diverger la
 * légende de la flotte qu'elle décrit.
 */
const AMBRE = "#ffc266";

const nomGravite = (code, court = false) =>
  (mots.gravites[String(code)] ?? mots.gravites["-1"])[court ? 1 : 0];

/* ═══════════════════════════════════════════════════════════════════════
   État
   ═══════════════════════════════════════════════════════════════════════ */

const etat = {
  debut: 0,
  fin: 0,
  zones: new Set(),
  types: new Set(),
  navires: new Set(),
  gravites: new Set(),
  recherche: "",
  colorer: false,
};

let base = null;
/*
 * Les récits, en deux jeux.
 *
 * `recitsVo` porte le texte d'origine de la NGA, en anglais : c'est la pièce,
 * elle ne bouge jamais. `recitsFr` porte les traductions disponibles, rangées
 * par index — un objet creux, pas un tableau, parce que la traduction avance
 * par lots et que les entrées absentes ne doivent rien peser.
 *
 * Quand la traduction manque, on affiche l'original et on le dit. Jamais de
 * texte inventé pour combler un trou.
 */
let recitsVo = [];
let recitsFr = {};

/*
 * Les récits arrivent par TRANCHES, pas en bloc.
 *
 * En bloc, ils pesaient 927 Ko compressés — 65 % de tout ce qu'une visite
 * télécharge — et partaient chez tout le monde, alors que la carte n'en a
 * besoin d'aucun pour s'afficher et que la plupart des visiteurs ouvriront
 * trois fiches sans jamais se servir de la recherche. Sur une vidéo qui amène
 * dix mille personnes, c'est neuf gigaoctets payés pour du texte que
 * personne n'a demandé.
 *
 * Ouvrir une fiche ne coûte donc plus que sa tranche : 13 Ko. Le fichier
 * entier n'est téléchargé que si l'on tape vraiment dans la recherche — elle
 * seule a besoin de tout lire — et il ne l'est qu'une fois.
 */
const PAR_TRANCHE = 128;
const tranchesVo = new Set();
const tranchesFr = new Set();
let toutVoCharge = false;
let toutFrCharge = false;
let carteGL = null;
let visibles = [];
let parAnneeVisible = new Map();
let lecture = null;
let ficheOuverte = null;

/* ═══════════════════════════════════════════════════════════════════════
   Chargement
   ═══════════════════════════════════════════════════════════════════════ */

appliquerLangue();
$("attente-texte").textContent = t("chargement");

/*
 * Les deux requêtes partent ensemble. La carte a besoin du fond ET des
 * navires ; les enchaîner ajouterait un aller-retour réseau complet au temps
 * d'affichage, sur une liaison mobile où c'est précisément ce qui coûte.
 */
const [reponseIncidents, reponseMonde] = await Promise.all([
  fetch(`${CHEMIN}/donnees/asam-carte.json`),
  fetch(`${CHEMIN}/monde.json`),
]);

if (!reponseIncidents.ok || !reponseMonde.ok) {
  $("attente-texte").textContent = "⚠";
  throw new Error("chargement impossible");
}

const brut = await reponseIncidents.json();
const monde = await reponseMonde.json();

/**
 * Déplie le format colonnaire en objets exploitables.
 *
 * Le fichier est colonnaire et ses libellés répétés sont remplacés par un
 * index vers un dictionnaire — c'est ce qui le tient à 465 Ko pour 8 897
 * incidents. On le déplie une seule fois : refaire ce travail à chaque
 * mouvement du curseur temporel coûterait cher pour rien.
 */
function preparer(source) {
  const col = source.colonnes;
  const dico = source.dictionnaires;
  const total = col.longitude.length;

  // Les catégories sont calculées sur les DICTIONNAIRES, pas sur les
  // incidents : quelques milliers de comparaisons au lieu de quelques
  // dizaines de milliers, pour un résultat identique.
  const catAgresseur = dico.agresseurs.map((v) => categoriser(v, REGLES_TYPE));
  const catNavire = dico.navires.map((v) => categoriser(v, REGLES_NAVIRE));

  /*
   * Les incidents dont la position est contredite par leur propre récit.
   *
   * La NGA a parfois frappé un chiffre de travers : un abordage du golfe
   * d'Aden se retrouvait près des Mariannes, cinq abordages de Chittagong
   * dans la rade de Cochin. La construction des données confronte chaque
   * position au récit du même enregistrement (voir
   * `scripts/positions-verifier.mjs`) ; ce qu'elle n'a pas pu réparer est
   * listé ici et n'est PAS dessiné. Un point faux vaut moins qu'un point
   * absent — c'est précisément ce qu'un lecteur nous a reproché.
   *
   * Les récits, eux, restent en place : les rangs ne bougent pas, et les
   * traductions rangées par rang restent alignées.
   */
  const horsCarte = new Set(source.meta?.positionsEcartees ?? []);
  const corrigees = new Set(source.meta?.positionsCorrigees ?? []);

  // Deux vues sur la même chose : `parIndex` retrouve un incident par son
  // rang d'origine (c'est ce que porte chaque point de la carte), `incidents`
  // est ce qu'on parcourt pour dessiner et compter.
  const parIndex = new Array(total);
  const incidents = [];
  let anneeMin = Infinity;
  let anneeMax = -Infinity;
  const lons = Float64Array.from(col.longitude).sort();

  for (let i = 0; i < total; i += 1) {
    if (horsCarte.has(i)) continue;

    const date = col.date[i];
    const annee = date ? Number(date.slice(0, 4)) : null;
    if (annee !== null) {
      if (annee < anneeMin) anneeMin = annee;
      if (annee > anneeMax) anneeMax = annee;
    }

    const codeAg = col.agresseur[i];
    const codeNv = col.navire[i];
    const codeZone = col.zone[i];

    parIndex[i] = {
      i,
      lon: col.longitude[i],
      lat: col.latitude[i],
      // Position relue dans le récit de la NGA parce que son champ numérique
      // la contredisait. La fiche le dit, plutôt que de faire comme si.
      positionRelue: corrigees.has(i),
      date,
      annee,
      reference: col.reference[i],
      zone: codeZone < 0 ? "" : dico.zones[codeZone],
      sousRegion: col.sousRegion[i] < 0 ? "" : dico.sousRegions[col.sousRegion[i]],
      agresseur: codeAg < 0 ? "" : dico.agresseurs[codeAg],
      navire: codeNv < 0 ? "" : dico.navires[codeNv],
      // -1 quand la source ne fournit aucun récit : l'incident n'est pas
      // classé plutôt que rangé au hasard dans le niveau le plus bas.
      gravite: col.gravite ? col.gravite[i] : -1,
      catAgresseur: codeAg < 0 ? INCONNU : catAgresseur[codeAg],
      catNavire: codeNv < 0 ? INCONNU : catNavire[codeNv],
    };
    incidents.push(parIndex[i]);
  }

  return {
    meta: source.meta,
    incidents,
    parIndex,
    total: incidents.length,
    anneeMin: Number.isFinite(anneeMin) ? anneeMin : 1978,
    anneeMax: Number.isFinite(anneeMax) ? anneeMax : new Date().getUTCFullYear(),
    /*
     * La longitude médiane sert de centre d'ouverture.
     *
     * Un cadrage par emprise (`fitBounds`) a été essayé et abandonné, pour
     * une raison qu'il vaut mieux écrire que redécouvrir : MapLibre impose
     * que le planisphère remplisse la hauteur de la fenêtre. Sur un téléphone
     * en portrait, cette contrainte fixe seule le zoom et écrase toute
     * emprise demandée, marges comprises. Reste la longitude centrale.
     */
    lonMediane: lons[Math.floor(lons.length / 2)],
  };
}

base = preparer(brut);

/* ═══════════════════════════════════════════════════════════════════════
   Carte
   ═══════════════════════════════════════════════════════════════════════ */

/*
 * Le style est écrit ici, en entier, et ne référence aucun serveur de tuiles.
 * Deux raisons également décisives : la page ne doit joindre aucun tiers
 * (donc aucune adresse IP de spectateur qui s'échappe), et un fond de tuiles
 * ajouterait des dizaines de requêtes au chargement.
 */
const STYLE = {
  version: 8,
  sources: { monde: { type: "geojson", data: monde } },
  layers: [
    { id: "mer", type: "background", paint: { "background-color": "#0b1420" } },
    { id: "terres", type: "fill", source: "monde", paint: { "fill-color": "#16233a" } },
    {
      id: "cotes",
      type: "line",
      source: "monde",
      paint: {
        "line-color": "#2c405e",
        // Le trait s'affine quand on s'éloigne : à l'échelle du monde, une
        // ligne d'un pixel partout transforme les archipels en pâtés.
        "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 4, 0.7, 9, 1.1],
      },
    },
  ],
};

carteGL = new CarteGL({
  container: "carte",
  style: STYLE,
  center: [base.lonMediane, 0],
  // Zéro est un plancher, pas une consigne : la contrainte de MapLibre
  // remonte ce zoom d'elle-même au minimum que l'écran autorise.
  zoom: 0,
  maxZoom: 12,
  /*
   * Un seul planisphère. Les copies affichaient deux fois les mêmes foyers
   * sur un écran large — le même millier d'attaques au large de la Somalie à
   * gauche et à droite, ce qui laisse croire à deux zones distinctes. Les
   * contours qui franchissent l'antiméridien sont déroulés à la préparation,
   * dans `scripts/carte-preparer.mjs` : il n'y a plus de raison de les subir.
   */
  renderWorldCopies: false,
  attributionControl: {
    compact: true,
    customAttribution: '<a href="https://msi.nga.mil/Piracy">NGA — ASAM</a> · Natural Earth',
  },
});

carteGL.addControl(new NavigationControl({ showCompass: false }), "top-right");
carteGL.addControl(new ScaleControl({ maxWidth: 88, unit: "metric" }), "bottom-right");

await new Promise((resoudre) => carteGL.on("load", resoudre));

/*
 * Chaque attaque est un navire, et aucune n'est regroupée.
 *
 * Les regroupements chiffrés disaient « 2 716 attaques ici » — un nombre, pas
 * une flotte. Huit mille huit cent quatre-vingt-dix-sept coques dessinées
 * ensemble donnent à voir ce qu'un nombre ne dit pas : la densité, la forme
 * des couloirs maritimes, les mers vides.
 */
carteGL.addSource("incidents", {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
});

/**
 * L'icône de navire, dessinée ici plutôt que chargée.
 *
 * Un fichier de moins à télécharger, et les couleurs restent au même endroit
 * que le reste de la gamme. Un contour sombre entoure chaque coque : sans
 * lui, les navires se fondent les uns dans les autres dès que la carte est
 * dense, et la flotte redevient une tache.
 */
function dessinerNavire(couleur) {
  const L = 30;
  const H = 19;
  const ECHELLE = 3; // Rendu net sur les écrans à forte densité.

  const toile = document.createElement("canvas");
  toile.width = L * ECHELLE;
  toile.height = H * ECHELLE;
  const c = toile.getContext("2d");
  c.scale(ECHELLE, ECHELLE);

  const silhouette = () => {
    c.beginPath();
    // Coque : large sur le pont, effilée sous la ligne de flottaison.
    c.moveTo(1.5, 11.5);
    c.lineTo(28.5, 11.5);
    c.lineTo(24.5, 17);
    c.lineTo(5.5, 17);
    c.closePath();
    // Château arrière et cheminée : ce qui fait lire « navire », pas « barque ».
    c.rect(17.5, 5.5, 7, 6);
    c.rect(19.5, 2.5, 3, 3.2);
  };

  c.lineJoin = "round";
  c.strokeStyle = "rgba(0,0,0,0.9)";
  c.lineWidth = 2.4;
  silhouette();
  c.stroke();

  c.fillStyle = couleur;
  silhouette();
  c.fill();

  return { donnees: c.getImageData(0, 0, toile.width, toile.height), echelle: ECHELLE };
}

for (const niveau of GRAVITE) {
  const { donnees, echelle } = dessinerNavire(niveau.couleur);
  carteGL.addImage(`navire${niveau.code}`, donnees, { pixelRatio: echelle });
}
const uni = dessinerNavire(AMBRE);
carteGL.addImage("navire-uni", uni.donnees, { pixelRatio: uni.echelle });

carteGL.addLayer({
  id: "navires",
  type: "symbol",
  source: "incidents",
  layout: {
    "icon-image": "navire-uni",
    // Petits de loin, lisibles de près. Assez gros au premier écran pour que
    // la flotte se voie, assez petits pour qu'elle ne devienne pas un aplat.
    "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.34, 3, 0.44, 6, 0.62, 10, 0.9],
    /*
     * Tous affichés, sans exception. Par défaut MapLibre écarte les symboles
     * qui se chevauchent — il n'en resterait qu'une poignée là où l'histoire
     * se joue, et la carte mentirait par omission.
     */
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    // Les plus graves passent au-dessus : dans un amas, c'est le mort qu'on
    // doit voir, pas la tentative qui le recouvre.
    "symbol-sort-key": ["get", "g"],
  },
});

/**
 * La couleur de la flotte.
 *
 * Uniforme par défaut : c'est la densité qu'on regarde d'abord.
 *
 * Mais dès qu'on isole une gravité, la couleur suit d'elle-même. Cliquer
 * « Morts » et voir rester 250 navires jaunes, c'est perdre le lien entre le
 * jeton rouge qu'on vient d'enfoncer et ce qui s'affiche : les navires
 * passent au rouge, et le rapport se lit sans explication. Relâcher le filtre
 * remet la flotte au jaune.
 *
 * Le bouton « Colorer » garde son rôle : allumer l'échelle sans rien filtrer,
 * pour comparer les quatre niveaux d'un seul regard.
 */
function majCouleurNavires() {
  const parGravite = etat.colorer || etat.gravites.size > 0;
  carteGL.setLayoutProperty(
    "navires",
    "icon-image",
    parGravite ? ["concat", "navire", ["get", "g"]] : "navire-uni",
  );
  // Le bouton se montre allumé quand la couleur est en service, même
  // lorsqu'elle vient d'un filtre plutôt que de lui.
  $("bascule-couleur").toggleAttribute("data-auto", !etat.colorer && parGravite);
}

/* ═══════════════════════════════════════════════════════════════════════
   Filtrage et rendu
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Les mots à chercher, pour une requête donnée.
 *
 * Calculé UNE fois par recherche, jamais par incident : la fonction de
 * filtrage est appelée 8 897 fois d'affilée, et y refaire ce travail
 * rendrait chaque frappe perceptible.
 *
 * On rend toujours le mot tapé, plus ses équivalents anglais s'il en a. Un
 * francophone qui cherche « Somalie » doit trouver les 400 récits qui disent
 * « Somalia », pas seulement les quelques-uns déjà traduits.
 */
function termesDeRecherche(recherche) {
  if (!recherche) return [];
  const sansAccent = recherche.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const termes = new Set([recherche]);
  if (sansAccent !== recherche) termes.add(sansAccent);
  /*
   * `Object.hasOwn` et non un accès direct : le lexique est un objet
   * ordinaire, donc il hérite d'`Object.prototype`. Chercher « constructor »
   * — un mot qu'on peut taper — aurait rendu la fonction `Object`, que la
   * boucle aurait tenté de parcourir avant de tout arrêter.
   */
  if (Object.hasOwn(EQUIVALENTS, sansAccent)) {
    for (const equivalent of EQUIVALENTS[sansAccent]) termes.add(equivalent);
  }
  return [...termes];
}

/** Tous les filtres sauf le temps : sert aussi à dessiner l'histogramme. */
function passeSaufTemps(incident, recherche, termes) {
  if (etat.zones.size && !etat.zones.has(incident.zone)) return false;
  if (etat.types.size && !etat.types.has(incident.catAgresseur)) return false;
  if (etat.navires.size && !etat.navires.has(incident.catNavire)) return false;
  if (etat.gravites.size && !etat.gravites.has(String(incident.gravite))) return false;

  if (recherche) {
    // La recherche porte sur les récits ; tant qu'ils ne sont pas arrivés,
    // le champ reste désactivé et on n'entre jamais ici.
    // On cherche dans les deux versions : « otage » doit trouver un récit
    // traduit, « hostage » doit trouver le même dans son texte d'origine.
    const recit = recitDe(incident.i);
    const ailleurs = `${incident.navire} ${incident.agresseur} ${incident.reference}`;
    const gisement = `${recit.texte} ${recit.vo} ${ailleurs}`.toLowerCase();
    if (!termes.some((terme) => gisement.includes(terme))) return false;
  }
  return true;
}

function appliquer() {
  const recherche = etat.recherche.trim().toLowerCase();
  const termes = termesDeRecherche(recherche);
  visibles = [];
  parAnneeVisible = new Map();
  const formes = [];

  for (const incident of base.incidents) {
    if (!passeSaufTemps(incident, recherche, termes)) continue;

    // L'histogramme compte AVANT le découpage temporel : il montre ce que les
    // autres filtres laissent sur toute la période, sinon la barre
    // sélectionnée serait la seule visible et la forme disparaîtrait.
    if (incident.annee !== null) {
      parAnneeVisible.set(incident.annee, (parAnneeVisible.get(incident.annee) ?? 0) + 1);
    }

    if (incident.annee !== null && (incident.annee < etat.debut || incident.annee > etat.fin)) {
      continue;
    }

    visibles.push(incident);
    formes.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [incident.lon, incident.lat] },
      // `g` porte la gravité, qui choisit la couleur ; `i` retrouve
      // l'incident complet au moment du toucher.
      properties: { i: incident.i, g: incident.gravite },
    });
  }

  carteGL.getSource("incidents").setData({ type: "FeatureCollection", features: formes });

  majCouleurNavires();
  majCompteur();
  majStats();
  majHistogramme();
  majPastilleFiltres();
  majUrl();
}

/* Le curseur peut bouger vite ; on ne recalcule qu'une fois par image. */
let enAttenteDeRendu = false;
function appliquerBientot() {
  if (enAttenteDeRendu) return;
  enAttenteDeRendu = true;
  requestAnimationFrame(() => {
    enAttenteDeRendu = false;
    appliquer();
  });
}

function majCompteur() {
  const compteur = $("compteur");
  compteur.firstElementChild.textContent = nombreLocal.format(visibles.length);
  compteur.lastElementChild.textContent = visibles.length === 1 ? t("compteurUn") : t("compteur");
}

/**
 * Ce que la sélection en cours raconte, en une ligne.
 *
 * Trois repères recalculés sur les incidents visibles : l'année la plus
 * chargée, la zone la plus touchée, le nombre d'attaques mortelles. Un
 * compteur dit « combien » ; ces trois-là disent « quand, où, à quel point ».
 */
function majStats() {
  const cible = $("stats");
  if (visibles.length === 0) {
    cible.textContent = t("aucun");
    return;
  }

  const parAnnee = new Map();
  const parZone = new Map();
  let morts = 0;

  for (const incident of visibles) {
    if (incident.annee !== null) {
      parAnnee.set(incident.annee, (parAnnee.get(incident.annee) ?? 0) + 1);
    }
    if (incident.zone) parZone.set(incident.zone, (parZone.get(incident.zone) ?? 0) + 1);
    if (incident.gravite === 3) morts += 1;
  }

  const sommet = (table) => [...table.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const [anneeHaute, nombreAnnee] = sommet(parAnnee);
  const [zoneHaute, nombreZone] = sommet(parZone);

  const morceaux = [];
  if (anneeHaute) {
    morceaux.push(t("pic", { annee: anneeHaute, nombre: nombreLocal.format(nombreAnnee) }));
  }
  if (zoneHaute) {
    morceaux.push(`${mots.zones[zoneHaute] ?? zoneHaute} (${nombreLocal.format(nombreZone)})`);
  }
  morceaux.push(
    morts === 0
      ? t("aucunMort")
      : morts === 1
        ? t("mortsUn")
        : t("morts", { nombre: nombreLocal.format(morts) }),
  );

  cible.textContent = morceaux.join(" · ");
}

/* ═══════════════════════════════════════════════════════════════════════
   Chronologie

   La piste n'est pas un rail nu mais un histogramme : la hauteur de chaque
   barre est le nombre d'attaques de l'année. On lit la forme du phénomène —
   la montée des années 2000, le pic de 2010, la retombée — en même temps
   qu'on le découpe. Les deux curseurs posés par-dessus portent la valeur, le
   nom et le clavier ; les barres ne sont que le dessin.
   ═══════════════════════════════════════════════════════════════════════ */

const curseurDebut = $("annee-debut");
const curseurFin = $("annee-fin");
const barres = new Map();

function construireHistogramme() {
  const conteneur = $("temps-histogramme");
  conteneur.innerHTML = "";
  for (let annee = base.anneeMin; annee <= base.anneeMax; annee += 1) {
    const barre = document.createElement("span");
    barre.style.height = "1px";
    conteneur.append(barre);
    barres.set(annee, barre);
  }
}

function majHistogramme() {
  let sommet = 1;
  for (const nombre of parAnneeVisible.values()) sommet = Math.max(sommet, nombre);

  for (const [annee, barre] of barres) {
    const nombre = parAnneeVisible.get(annee) ?? 0;
    // Racine carrée plutôt que proportion directe : avec 545 attaques en 2010
    // contre 3 en 1981, une échelle linéaire écrase quarante années à un
    // pixel. La racine laisse voir les creux sans mentir sur les sommets.
    const part = sommet === 0 ? 0 : Math.sqrt(nombre / sommet);
    barre.style.height = `${Math.max(nombre > 0 ? 2 : 1, Math.round(part * 100))}%`;
    barre.toggleAttribute("data-dedans", annee >= etat.debut && annee <= etat.fin);
    barre.toggleAttribute("data-vide", nombre === 0);
  }
}

for (const curseur of [curseurDebut, curseurFin]) {
  curseur.min = String(base.anneeMin);
  curseur.max = String(base.anneeMax);
  curseur.step = "1";
}

function majTemps() {
  $("temps-libelle").textContent = `${etat.debut} — ${etat.fin}`;
  curseurDebut.value = String(etat.debut);
  curseurFin.value = String(etat.fin);
  curseurDebut.setAttribute("aria-valuetext", String(etat.debut));
  curseurFin.setAttribute("aria-valuetext", String(etat.fin));

  const etendue = base.anneeMax - base.anneeMin || 1;
  const gauche = ((etat.debut - base.anneeMin) / etendue) * 100;
  const droite = ((etat.fin - base.anneeMin) / etendue) * 100;
  const selection = $("temps-selection");
  selection.style.left = `${gauche}%`;
  selection.style.right = `${100 - droite}%`;
}

curseurDebut.addEventListener("input", () => {
  // Les deux bornes ne se croisent pas : la plus basse pousse l'autre.
  etat.debut = Math.min(Number(curseurDebut.value), etat.fin);
  arreterLecture();
  majTemps();
  appliquerBientot();
});

curseurFin.addEventListener("input", () => {
  etat.fin = Math.max(Number(curseurFin.value), etat.debut);
  arreterLecture();
  majTemps();
  appliquerBientot();
});

/*
 * L'animation fait GLISSER la fenêtre au lieu de l'étendre.
 *
 * C'est ce qui rend visible le déplacement des foyers — le détroit de Malacca
 * dans les années 2000, la Somalie autour de 2010, le golfe de Guinée
 * ensuite. Une fenêtre qui s'étend ne montrerait qu'une accumulation, où tout
 * s'ajoute et rien ne se déplace.
 *
 * Si la fenêtre couvre déjà toute la période, la faire glisser ne montrerait
 * rien : on la ramène alors à cinq ans avant de démarrer.
 */
const PAS_MS = 620;
const FENETRE_DEFAUT = 5;

function basculerLecture() {
  if (lecture) {
    arreterLecture();
    return;
  }

  if (etat.debut === base.anneeMin && etat.fin === base.anneeMax) {
    etat.fin = Math.min(base.anneeMin + FENETRE_DEFAUT - 1, base.anneeMax);
    majTemps();
    appliquer();
  }

  $("bouton-lecture").dataset.joue = "";
  $("bouton-lecture").setAttribute("aria-label", t("arreter"));

  lecture = setInterval(() => {
    const largeur = etat.fin - etat.debut;
    if (etat.fin >= base.anneeMax) {
      // Retour au début : le déroulé se regarde en boucle.
      etat.debut = base.anneeMin;
      etat.fin = base.anneeMin + largeur;
    } else {
      etat.debut += 1;
      etat.fin += 1;
    }
    majTemps();
    appliquer();
  }, PAS_MS);
}

function arreterLecture() {
  if (!lecture) return;
  clearInterval(lecture);
  lecture = null;
  $("bouton-lecture").removeAttribute("data-joue");
  $("bouton-lecture").setAttribute("aria-label", t("lire"));
}

$("bouton-lecture").addEventListener("click", basculerLecture);

/* ═══════════════════════════════════════════════════════════════════════
   Filtres
   ═══════════════════════════════════════════════════════════════════════ */

function recenser(cle) {
  const compte = new Map();
  for (const incident of base.incidents) {
    const valeur = incident[cle];
    if (valeur === "" || valeur === undefined) continue;
    compte.set(valeur, (compte.get(valeur) ?? 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1]);
}

const entreesZones = recenser("zone");
const entreesTypes = recenser("catAgresseur");
const entreesNavires = recenser("catNavire");

function construireJetons(conteneur, entrees, ensemble, etiqueter, puiser) {
  conteneur.innerHTML = "";
  for (const [valeur, nombre] of entrees) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = puiser ? "jeton jeton-gravite" : "jeton";
    bouton.setAttribute("aria-pressed", ensemble.has(valeur) ? "true" : "false");

    if (puiser) {
      const puce = document.createElement("i");
      puce.style.background = puiser(valeur);
      puce.setAttribute("aria-hidden", "true");
      bouton.append(puce);
    }

    const texte = document.createElement("span");
    texte.textContent = etiqueter(valeur);
    const compte = document.createElement("span");
    compte.className = "jeton-compte";
    compte.textContent = nombreLocal.format(nombre);
    bouton.append(texte, compte);

    bouton.addEventListener("click", () => {
      if (ensemble.has(valeur)) ensemble.delete(valeur);
      else ensemble.add(valeur);
      bouton.setAttribute("aria-pressed", ensemble.has(valeur) ? "true" : "false");
      arreterLecture();
      appliquer();
    });

    conteneur.append(bouton);
  }
}

function entreesGravites() {
  const compte = new Map();
  for (const incident of base.incidents) {
    const cle = String(incident.gravite);
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  // Du plus grave au moins grave : c'est l'ordre dans lequel on lit une
  // échelle de danger, et le premier jeton est celui qu'on cherche.
  return [...compte.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
}

function construireTousLesJetons() {
  construireJetons($("filtre-zones"), entreesZones, etat.zones, (code) =>
    `${code} · ${mots.zones[code] ?? code}`,
  );
  construireJetons($("filtre-types"), entreesTypes, etat.types, (cle) => mots.types[cle] ?? cle);
  construireJetons($("filtre-navires"), entreesNavires, etat.navires, (cle) => mots.navires[cle] ?? cle);
  construireJetons(
    $("filtre-gravites"),
    entreesGravites(),
    etat.gravites,
    (cle) => nomGravite(cle, true),
    (cle) => (GRAVITE.find((g) => String(g.code) === cle) ?? GRAVITE[4]).couleur,
  );
}

function majPastilleFiltres() {
  const nombre = etat.zones.size + etat.types.size + etat.navires.size + etat.gravites.size;
  const pastille = $("pastille-filtres");
  pastille.textContent = String(nombre);
  pastille.hidden = nombre === 0;
}

$("bouton-effacer").addEventListener("click", () => {
  etat.zones.clear();
  etat.types.clear();
  etat.navires.clear();
  etat.gravites.clear();
  etat.recherche = "";
  $("recherche").value = "";
  etat.debut = base.anneeMin;
  etat.fin = base.anneeMax;
  arreterLecture();
  majTemps();
  for (const bouton of document.querySelectorAll(".jeton")) {
    bouton.setAttribute("aria-pressed", "false");
  }
  appliquer();
});

/* ── Colorer par gravité ─────────────────────────────────────────────── */

$("bascule-couleur").addEventListener("click", () => {
  etat.colorer = !etat.colorer;
  const bouton = $("bascule-couleur");
  bouton.setAttribute("aria-pressed", String(etat.colorer));
  bouton.title = etat.colorer ? t("colorerActif") : t("colorerInactif");
  majCouleurNavires();
  majUrl();
});

/* ═══════════════════════════════════════════════════════════════════════
   Recherche
   ═══════════════════════════════════════════════════════════════════════ */

let minuterieRecherche = null;
$("recherche").addEventListener("input", (evenement) => {
  clearTimeout(minuterieRecherche);
  // Une frappe ne doit pas relancer un balayage des 8 897 récits : on attend
  // que la saisie se pose.
  minuterieRecherche = setTimeout(async () => {
    etat.recherche = evenement.target.value;
    arreterLecture();

    /*
     * Les récits ne sont pas encore là : on le dit, on les charge, puis on
     * cherche. Le champ reste utilisable pendant ce temps — le bloquer
     * ferait perdre la frappe en cours.
     */
    if (etat.recherche.trim() && !toutVoCharge) {
      const champ = $("recherche");
      champ.placeholder = t("rechercheAttente");
      await chargerTousLesRecits();
      champ.placeholder = t("recherchePlaceholder");
    }

    appliquer();
  }, 180);
});

/**
 * Le récit d'un incident, traduit si la traduction existe.
 *
 * Rend toujours l'original à côté : la fiche propose de le consulter, et
 * c'est sur lui que le classement de gravité se vérifie.
 */
function recitDe(index) {
  const vo = recitsVo[index] ?? null;
  const traduction = langue === "fr" ? (recitsFr[index] ?? null) : null;
  return {
    texte: traduction || vo || "",
    vo: vo || "",
    traduit: Boolean(traduction),
    // « chargé » se juge récit par récit, et non plus sur la présence du
    // fichier entier : c'est ce qui permet d'en afficher un sans les avoir
    // tous.
    charge: vo !== null,
  };
}

/*
 * Les récits pèsent l'essentiel du poids et la carte n'en a besoin d'aucun
 * pour s'afficher. Ils partent donc après le premier rendu : la recherche
 * s'active à leur arrivée.
 *
 * La traduction française est un second fichier, chargé seulement si la
 * langue le demande — un lecteur anglophone n'a aucune raison de la
 * télécharger.
 */
/** La tranche qui contient ce récit, et sa traduction si la langue la demande. */
async function assurerTranche(index) {
  const k = Math.floor(index / PAR_TRANCHE);
  const travaux = [];

  if (!toutVoCharge && !tranchesVo.has(k)) {
    tranchesVo.add(k);
    travaux.push(
      fetch(`${CHEMIN}/donnees/recits/${k}.json`)
        .then((r) => (r.ok ? r.json() : []))
        .then((tranche) => {
          tranche.forEach((texte, decalage) => {
            if (texte) recitsVo[k * PAR_TRANCHE + decalage] = texte;
          });
        })
        // On oublie l'échec : la tranche redeviendra demandable au prochain
        // clic, plutôt que de rester marquée « chargée » et vide à jamais.
        .catch(() => tranchesVo.delete(k)),
    );
  }

  if (langue === "fr" && !toutFrCharge && !tranchesFr.has(k)) {
    tranchesFr.add(k);
    travaux.push(
      fetch(`${CHEMIN}/donnees/recits-fr/${k}.json`)
        // Une tranche sans aucune traduction n'est pas écrite : le 404 veut
        // dire « rien à traduire ici », ce qui est exact.
        .then((r) => (r.ok ? r.json() : {}))
        .then((morceau) => Object.assign(recitsFr, morceau))
        .catch(() => tranchesFr.delete(k)),
    );
  }

  if (travaux.length) await Promise.all(travaux);
}

/**
 * Tous les récits d'un coup — le prix de la recherche, et d'elle seule.
 *
 * Chercher un mot exige de lire les 8 897 récits : il n'y a pas de demi-mesure
 * possible. On paie donc le fichier entier, mais seulement à la première
 * frappe, et une seule fois.
 */
async function chargerTousLesRecits() {
  const travaux = [];

  if (!toutVoCharge) {
    travaux.push(
      fetch(`${CHEMIN}/donnees/asam-descriptions.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((vo) => {
          if (!vo) return;
          vo.forEach((texte, i) => {
            if (texte) recitsVo[i] = texte;
          });
          toutVoCharge = true;
        }),
    );
  }

  if (langue === "fr" && !toutFrCharge) {
    travaux.push(
      fetch(`${CHEMIN}/donnees/asam-recits-fr.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((fr) => {
          Object.assign(recitsFr, fr);
          toutFrCharge = true;
        })
        .catch(() => {}),
    );
  }

  if (travaux.length) await Promise.all(travaux);
}

/* ═══════════════════════════════════════════════════════════════════════
   Encart au toucher d'un navire
   ═══════════════════════════════════════════════════════════════════════ */

const encart = new Popup({
  closeButton: false,
  closeOnClick: true,
  maxWidth: "290px",
  offset: 14,
  className: "encart",
});

function formaterCoordonnees(lat, lon) {
  const cardinal = (valeur, positif, negatif) =>
    `${Math.abs(valeur).toFixed(3)}° ${valeur >= 0 ? positif : negatif}`;
  const ouest = langue === "fr" ? "O" : "W";
  return `${cardinal(lat, "N", "S")}, ${cardinal(lon, "E", ouest)}`;
}

function ligneEncart(parent, intitule, valeur) {
  if (!valeur) return;
  const cle = document.createElement("dt");
  cle.textContent = intitule;
  const val = document.createElement("dd");
  val.textContent = valeur;
  parent.append(cle, val);
}

function ouvrirEncart(incident) {
  const boite = document.createElement("div");
  boite.className = "encart-corps";

  const tete = document.createElement("div");
  tete.className = "encart-tete";
  const reference = document.createElement("span");
  reference.className = "encart-ref";
  reference.textContent = incident.reference || t("sansReference");
  const date = document.createElement("span");
  date.className = "encart-date";
  date.textContent = incident.date ? jourDe(incident.date) : t("dateInconnue");
  tete.append(reference, date);
  boite.append(tete);

  const niveau = GRAVITE.find((g) => g.code === incident.gravite) ?? GRAVITE[4];
  const etiquette = document.createElement("p");
  etiquette.className = "encart-gravite";
  const pastille = document.createElement("i");
  pastille.style.background = niveau.couleur;
  etiquette.append(pastille, nomGravite(incident.gravite));
  boite.append(etiquette);

  const champs = document.createElement("dl");
  champs.className = "encart-champs";
  ligneEncart(champs, t("navire"), incident.navire);
  ligneEncart(champs, t("agresseur"), incident.agresseur);
  ligneEncart(champs, t("position"), formaterCoordonnees(incident.lat, incident.lon));
  boite.append(champs);

  /*
   * Le récit est tronqué ici, jamais réécrit ni traduit. La fiche complète
   * l'affiche en entier — c'est la pièce sur laquelle le lecteur peut
   * vérifier le classement de gravité.
   */
  const recit = recitDe(incident.i);
  const extrait = document.createElement("p");
  extrait.className = "encart-extrait";
  // La langue déclarée suit le texte réellement affiché : un lecteur d'écran
  // doit prononcer l'anglais en anglais, et le français en français.
  extrait.lang = recit.traduit ? langue : "en";
  if (recit.texte) {
    extrait.textContent =
      recit.texte.length > 175 ? `${recit.texte.slice(0, 175).trimEnd()}…` : recit.texte;
  } else {
    extrait.lang = langue;
    extrait.textContent = recit.charge ? t("sansRecit") : t("recitAttente");
    extrait.dataset.attente = "";
  }
  boite.append(extrait);

  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "encart-bouton";
  bouton.textContent = t("lireTout");
  bouton.addEventListener("click", () => {
    encart.remove();
    ouvrirFiche(incident.i);
  });
  boite.append(bouton);

  encart.setLngLat([incident.lon, incident.lat]).setDOMContent(boite).addTo(carteGL);

  /*
   * L'encart est le PREMIER contact avec un récit : c'est lui qui déclenche
   * le chargement de la tranche, pas la fiche complète.
   *
   * Sans cela, l'extrait restait bloqué sur « Chargement du récit… » jusqu'à
   * ce qu'on clique « Lire le récit complet » — donc pour toujours chez qui
   * se contente de survoler quelques navires, c'est-à-dire presque tout le
   * monde.
   */
  if (!recit.charge) {
    assurerTranche(incident.i).then(() => {
      // L'encart a pu être fermé, ou un autre navire cliqué entre-temps :
      // on ne réécrit que si c'est toujours celui-ci qui est affiché.
      if (!extrait.isConnected) return;
      const arrive = recitDe(incident.i);
      if (!arrive.texte) return;
      delete extrait.dataset.attente;
      extrait.lang = arrive.traduit ? langue : "en";
      extrait.textContent =
        arrive.texte.length > 175 ? `${arrive.texte.slice(0, 175).trimEnd()}…` : arrive.texte;
    });
  }
}

carteGL.on("click", "navires", (evenement) => {
  const forme = evenement.features?.[0];
  if (!forme) return;
  const incident = base.parIndex[Number(forme.properties.i)];
  if (incident) ouvrirEncart(incident);
});

carteGL.on("mouseenter", "navires", () => {
  carteGL.getCanvas().style.cursor = "pointer";
});
carteGL.on("mouseleave", "navires", () => {
  carteGL.getCanvas().style.cursor = "";
});

/* ═══════════════════════════════════════════════════════════════════════
   Fiche complète
   ═══════════════════════════════════════════════════════════════════════ */

function ligneFiche(liste, intitule, valeur, precision = "") {
  const dt = document.createElement("dt");
  dt.textContent = intitule;
  const dd = document.createElement("dd");
  if (valeur) {
    dd.textContent = valeur;
  } else {
    // Le champ est absent de la source : on le dit, on ne le devine pas.
    dd.textContent = t("nonRenseigne");
    dd.dataset.vide = "";
  }
  if (precision) {
    const note = document.createElement("small");
    note.className = "fiche-precision";
    note.textContent = precision;
    dd.append(note);
  }
  liste.append(dt, dd);
}

/**
 * Le récit dans la fiche, avec sa provenance annoncée.
 *
 * Trois cas, et chacun se dit : traduit — et l'original reste à un toucher ;
 * pas encore traduit — c'est l'anglais d'origine, annoncé comme tel ; absent
 * de la source — on le dit aussi, plutôt que de laisser un blanc.
 */
function remplirDescription(index) {
  const cible = $("fiche-description");
  const note = $("fiche-recit-note");
  const bouton = $("fiche-original");
  const recit = recitDe(index);

  if (!recit.charge) {
    cible.textContent = t("recitAttente");
    cible.lang = langue;
    note.hidden = true;
    bouton.hidden = true;
    return;
  }

  const montrerVo = bouton.getAttribute("aria-pressed") === "true";
  const traduitEtDisponible = recit.traduit && !montrerVo;

  cible.textContent = recit.texte || t("sansRecit");
  cible.lang = traduitEtDisponible ? langue : "en";
  if (recit.traduit && montrerVo) cible.textContent = recit.vo;

  note.hidden = !recit.texte;
  note.textContent = recit.traduit ? t("recitTraduit") : t("recitNote");

  bouton.hidden = !recit.traduit;
  bouton.textContent = montrerVo ? t("voirTraduction") : t("voirOriginal");
}

function ouvrirFiche(index) {
  const incident = base.parIndex[index];
  if (!incident) return;
  ficheOuverte = index;

  $("fiche-titre").textContent = incident.date ? jourDe(incident.date) : t("dateInconnue");

  const champs = $("fiche-champs");
  champs.innerHTML = "";
  ligneFiche(
    champs,
    t("position"),
    formaterCoordonnees(incident.lat, incident.lon),
    // Le champ numérique de la NGA disait autre chose que son propre récit.
    // C'est le récit qui a été suivi, et la fiche l'annonce : le lecteur voit
    // la position ET d'où elle vient.
    incident.positionRelue ? t("positionRelue") : "",
  );
  ligneFiche(
    champs,
    t("zoneFiche"),
    incident.zone ? `${incident.zone} — ${mots.zones[incident.zone] ?? ""}`.trim() : "",
  );
  ligneFiche(champs, t("sousRegion"), incident.sousRegion);
  ligneFiche(champs, t("navire"), incident.navire);
  ligneFiche(champs, t("agresseur"), incident.agresseur);
  ligneFiche(champs, mots.graviteAria, nomGravite(incident.gravite));

  remplirDescription(index);
  /*
   * La tranche part maintenant, et la fiche se remplit à son arrivée.
   * L'affichage ci-dessus a déjà posé « Chargement du récit… » si le texte
   * manque : la fiche s'ouvre donc tout de suite, avec ses coordonnées, sa
   * date et son navire, et le récit s'y glisse ensuite.
   */
  assurerTranche(index).then(() => {
    if (ficheOuverte === index) remplirDescription(index);
  });

  $("fiche-reference").textContent = incident.reference
    ? t("referenceFiche", { reference: incident.reference })
    : t("referenceAbsente");

  fermerApropos();
  const fiche = $("fiche");
  fiche.hidden = false;
  fiche.focus();
}

function fermerFiche() {
  $("fiche").hidden = true;
  ficheOuverte = null;
}

$("fiche-fermer").addEventListener("click", fermerFiche);

$("fiche-original").addEventListener("click", () => {
  const bouton = $("fiche-original");
  bouton.setAttribute("aria-pressed", bouton.getAttribute("aria-pressed") === "true" ? "false" : "true");
  if (ficheOuverte !== null) remplirDescription(ficheOuverte);
});

/* ═══════════════════════════════════════════════════════════════════════
   Panneaux et raccourcis
   ═══════════════════════════════════════════════════════════════════════ */

function fermerApropos() {
  $("apropos").hidden = true;
  $("bouton-apropos").setAttribute("aria-expanded", "false");
}

$("bouton-apropos").addEventListener("click", () => {
  const panneau = $("apropos");
  const ouvert = panneau.hidden;
  fermerFiche();
  panneau.hidden = !ouvert;
  $("bouton-apropos").setAttribute("aria-expanded", String(ouvert));
  if (ouvert) panneau.focus();
});

$("apropos-fermer").addEventListener("click", fermerApropos);

$("bouton-filtres").addEventListener("click", () => {
  const filtres = $("filtres");
  filtres.hidden = !filtres.hidden;
  $("bouton-filtres").setAttribute("aria-expanded", String(!filtres.hidden));
});

/* ═══════════════════════════════════════════════════════════════════════
   La place que prend le panneau

   La carte s'arrête à son bord supérieur plutôt que de passer dessous : sinon
   les commandes cachent la moitié sud de la flotte, et rien ne permet de la
   découvrir — MapLibre impose que le planisphère remplisse la hauteur de son
   conteneur, il n'y a donc aucune marge de déplacement vertical à ce zoom.

   La hauteur est MESURÉE, jamais devinée : elle change quand on replie le
   panneau, quand le téléphone tourne, quand une police arrive et fait passer
   une ligne à deux, ou quand un filtre ajoute une rangée de jetons.
   ═══════════════════════════════════════════════════════════════════════ */

function mesurerCommandes() {
  const commandes = $("commandes");
  // Au-delà de 900 px, le panneau flotte dans un coin : la carte garde toute
  // la hauteur et la mesure n'a plus lieu d'être.
  const hauteur = window.innerWidth >= 900 ? 0 : commandes.offsetHeight;
  const actuelle = document.documentElement.style.getPropertyValue("--h-commandes");
  const nouvelle = `${hauteur}px`;
  if (actuelle === nouvelle) return;

  document.documentElement.style.setProperty("--h-commandes", nouvelle);
  // Le conteneur vient de changer de taille : sans cela MapLibre continue de
  // dessiner à l'ancienne dimension et la carte paraît étirée.
  carteGL.resize();
}

/*
 * Sur téléphone, le panneau s'ouvre REPLIÉ.
 *
 * Déplié il occupe 45 % de la hauteur, et la carte — le sujet — est réduite à
 * une bande. Replié, elle en occupe 82 %, et il reste tout de même le
 * compteur et la chronologie : de quoi lire et parcourir sans rien ouvrir.
 * Les filtres sont à un toucher, sur un bouton qui dit « DÉPLIER ».
 *
 * Sur grand écran la question ne se pose pas : le panneau flotte dans un coin
 * d'océan sans rien masquer.
 */
if (window.innerWidth < 900) {
  $("commandes").toggleAttribute("data-replie", true);
  $("bouton-replier").setAttribute("aria-expanded", "false");
  $("bouton-replier").lastElementChild.textContent = t("deplier");
}

new ResizeObserver(mesurerCommandes).observe($("commandes"));
window.addEventListener("orientationchange", () => setTimeout(mesurerCommandes, 200));
mesurerCommandes();

$("bouton-replier").addEventListener("click", () => {
  const commandes = $("commandes");
  const replie = commandes.hasAttribute("data-replie");
  commandes.toggleAttribute("data-replie", !replie);
  $("bouton-replier").setAttribute("aria-expanded", String(replie));
  $("bouton-replier").lastElementChild.textContent = replie ? t("replier") : t("deplier");
  mesurerCommandes();
});

document.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;
  if (!$("fiche").hidden) fermerFiche();
  else if (!$("apropos").hidden) fermerApropos();
  else arreterLecture();
});

/* ═══════════════════════════════════════════════════════════════════════
   Langue : le bouton
   ═══════════════════════════════════════════════════════════════════════ */

for (const bouton of document.querySelectorAll("#langues button")) {
  bouton.addEventListener("click", () => {
    if (bouton.dataset.langue === langue) return;
    langue = bouton.dataset.langue;
    appliquerLangue();
    rafraichirTextesDynamiques();
    majUrl();
    /*
     * Passer au français après coup réclame des traductions qu'on n'avait
     * aucune raison de télécharger jusque-là. On ne rattrape que ce qui est
     * réellement à l'écran : la fiche ouverte, et l'ensemble des récits si la
     * recherche les avait déjà tous fait venir.
     */
    if (langue === "fr" && !toutFrCharge) {
      const suite = toutVoCharge
        ? chargerTousLesRecits()
        : ficheOuverte !== null
          ? assurerTranche(ficheOuverte)
          : Promise.resolve();
      suite.then(() => {
        if (ficheOuverte !== null) remplirDescription(ficheOuverte);
        if (etat.recherche.trim()) appliquer();
      });
    }
  });
}

/** Ce qui est écrit par le script, et qu'un simple repeint ne touche pas. */
function rafraichirTextesDynamiques() {
  $("entete-chiffres").textContent = t("chiffres", {
    total: nombreLocal.format(base.total),
    debut: base.anneeMin,
    fin: base.anneeMax,
  });
  $("recherche").placeholder = t("recherchePlaceholder");
  $("bouton-lecture").setAttribute("aria-label", lecture ? t("arreter") : t("lire"));
  $("bascule-couleur").title = etat.colorer ? t("colorerActif") : t("colorerInactif");

  const capture = base.meta?.captureDu;
  $("apropos-capture").textContent = capture
    ? t("aproposCapture", { date: jourDe(capture) })
    : t("aproposDirect", { date: base.meta?.genereLe ?? "—" });

  // Les trois nombres de la vérification des positions viennent des données,
  // jamais du texte : s'ils changent, la phrase change avec eux.
  $("apropos-positions").textContent = t("apropos4", {
    recus: nombreLocal.format(base.meta?.recus ?? base.total),
    corrigees: nombreLocal.format(base.meta?.positionsCorrigees?.length ?? 0),
    ecartees: nombreLocal.format(base.meta?.positionsEcartees?.length ?? 0),
  });

  construireTousLesJetons();
  majCompteur();
  majStats();
  if (ficheOuverte !== null) ouvrirFiche(ficheOuverte);
}

/* ═══════════════════════════════════════════════════════════════════════
   Partage : l'état tient dans l'adresse
   ═══════════════════════════════════════════════════════════════════════ */

function majUrl() {
  const p = new URLSearchParams();
  p.set("lang", langue);
  if (etat.debut !== base.anneeMin) p.set("de", String(etat.debut));
  if (etat.fin !== base.anneeMax) p.set("a", String(etat.fin));
  if (etat.zones.size) p.set("zone", [...etat.zones].join("|"));
  if (etat.types.size) p.set("type", [...etat.types].join("|"));
  if (etat.navires.size) p.set("navire", [...etat.navires].join("|"));
  if (etat.gravites.size) p.set("gravite", [...etat.gravites].join("|"));
  if (etat.colorer) p.set("couleur", "gravite");
  if (etat.recherche.trim()) p.set("q", etat.recherche.trim());

  // `replaceState` et non `pushState` : chaque cran du curseur temporel
  // remplirait sinon l'historique, et le bouton « retour » du téléphone
  // deviendrait inutilisable.
  history.replaceState(null, "", `?${p.toString()}`);
}

function lireUrl() {
  const p = new URLSearchParams(location.search);
  const entier = (cle, defaut) => {
    if (!p.has(cle)) return defaut;
    const valeur = Number(p.get(cle));
    if (!Number.isFinite(valeur)) return defaut;
    return Math.min(Math.max(Math.round(valeur), base.anneeMin), base.anneeMax);
  };

  etat.debut = entier("de", base.anneeMin);
  etat.fin = entier("a", base.anneeMax);
  if (etat.fin < etat.debut) [etat.debut, etat.fin] = [etat.fin, etat.debut];

  const ensemble = (cle, cible) => {
    const valeur = p.get(cle);
    if (!valeur) return;
    for (const element of valeur.split("|")) if (element) cible.add(element);
  };
  ensemble("zone", etat.zones);
  ensemble("type", etat.types);
  ensemble("navire", etat.navires);
  ensemble("gravite", etat.gravites);

  etat.colorer = p.get("couleur") === "gravite";

  const q = p.get("q");
  if (q) {
    etat.recherche = q;
    $("recherche").value = q;
  }
}

function souffler(message) {
  const bulle = $("souffle");
  bulle.textContent = message;
  bulle.hidden = false;
  clearTimeout(souffler.minuterie);
  souffler.minuterie = setTimeout(() => {
    bulle.hidden = true;
  }, 2600);
}

$("bouton-partage").addEventListener("click", async () => {
  majUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    souffler(t("lienCopie"));
  } catch {
    // Le presse-papiers est refusé hors contexte sécurisé, et sur certains
    // navigateurs mobiles : l'adresse est déjà dans la barre, on le dit.
    souffler(t("lienACopier"));
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Démarrage
   ═══════════════════════════════════════════════════════════════════════ */

etat.debut = base.anneeMin;
etat.fin = base.anneeMax;
lireUrl();

$("bascule-couleur").setAttribute("aria-pressed", String(etat.colorer));
majCouleurNavires();
construireHistogramme();
majTemps();
rafraichirTextesDynamiques();
appliquer();

/*
 * Le retour vers la vidéo n'apparaît que s'il mène quelque part.
 *
 * Tant que l'adresse est le gabarit, le lien reste masqué : il envoyait
 * sinon vers « /piraterie/[URL_VIDEO] », une 404 en pleine page pour des
 * spectateurs arrivés de YouTube. Le test est fait ici, et non à la main
 * dans le HTML, pour qu'il suffise de coller l'adresse : le bouton se
 * rallume tout seul, sans qu'on ait à penser à retirer autre chose.
 */
{
  const lienVideo = document.querySelector(".lien-video");
  const cible = lienVideo?.getAttribute("href") ?? "";
  if (lienVideo && cible && !cible.includes("URL_VIDEO")) lienVideo.hidden = false;
}

$("attente").dataset.fini = "";
setTimeout(() => $("attente").remove(), 400);

/*
 * Rien n'est chargé d'avance.
 *
 * Les récits partaient ici, tous, dès que la carte était posée. Ils ne
 * partent plus : une fiche va chercher sa tranche, une recherche va chercher
 * le tout. Un visiteur qui regarde la carte et repart ne télécharge aucun
 * récit.
 *
 * Le champ de recherche s'ouvre donc tout de suite, sans rien attendre : il
 * était désactivé jusqu'à l'arrivée des 927 Ko, ce qui n'a plus lieu d'être.
 * C'est la première frappe qui déclenche le téléchargement, et elle le dit.
 */
$("recherche").disabled = false;
$("recherche").placeholder = t("recherchePlaceholder");

/*
 * Une recherche reçue par l'adresse — un lien partagé — doit s'appliquer
 * sans qu'on ait à retaper quoi que ce soit. Elle n'a porté que sur les
 * libellés jusqu'ici, faute de récits : on va les chercher, puis on rejoue.
 */
if (etat.recherche.trim()) {
  $("recherche").placeholder = t("rechercheAttente");
  chargerTousLesRecits()
    .then(() => {
      $("recherche").placeholder = t("recherchePlaceholder");
      appliquer();
    })
    .catch(() => {
      $("recherche").placeholder = t("rechercheIndispo");
    });
}
