/**
 * Carte mondiale des attaques contre des navires — base ASAM de la NGA.
 *
 * Aucun réglage à faire ici : tout ce qui est affiché vient des fichiers de
 * `donnees/`, produits par `scripts/asam-recuperer.mjs`. Ce script ne fait que
 * dessiner et filtrer. Il n'ajoute aucune donnée, n'en corrige aucune, et
 * laisse vide ce que la source laisse vide.
 */

/*
 * MapLibre 6 n'expose que des exports nommés — pas d'export par défaut. On
 * prend donc exactement les quatre pièces utilisées, ce qui a l'avantage de
 * lister en une ligne tout ce que la page emprunte à la bibliothèque.
 *
 * `Map` est renommée : le nom est déjà pris par la structure de données du
 * même nom, utilisée plus bas pour les étiquettes.
 */
import {
  Map as CarteGL,
  Marker,
  NavigationControl,
  ScaleControl,
} from "/piraterie/vendeur/maplibre-gl.mjs";

const CHEMIN = "/piraterie";
const nombreFr = new Intl.NumberFormat("fr-FR");
const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  // En UTC, et il le faut : « 1978-05-01 » lu dans un fuseau à l'ouest de
  // Greenwich deviendrait le 30 avril à l'affichage.
  timeZone: "UTC",
});

const $ = (id) => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════════════
   Catégories de filtres

   La base ne normalise rien : « PIRATES », « Pirates » et « pirates » y sont
   trois entrées distinctes, et le type de navire va jusqu'à
   « Denmark-flagged tanker TORM AMALIE ». Tels quels, 452 libellés
   d'agresseur et 1 778 de navire ne font pas des filtres utilisables.

   On les regroupe donc par mot-clé, dans l'ordre — le premier motif qui
   correspond gagne, d'où « SUSPICIOUS » avant « CRAFT » et « UNKNOWN » avant
   « VESSEL ». Ce regroupement ne sert QU'aux filtres : la fiche d'un incident
   affiche toujours le libellé exact enregistré par la NGA.
   ═══════════════════════════════════════════════════════════════════════ */

const REGLES_TYPE = [
  [/PIRAT/i, "Pirates"],
  [/SUSPICI/i, "Approche suspecte"],
  [/ROBBER|THIEF|THIEVES|THEFT|BURGLAR/i, "Vol et brigandage"],
  [/HIJACK/i, "Détournement"],
  [/KIDNAP|ABDUCT|HOSTAGE/i, "Enlèvement"],
  [/BOARD/i, "Abordage"],
  [/ASSAILANT|ATTACK|ARMED/i, "Assaillants armés"],
  [/INTRUD|STOWAWAY/i, "Intrusion"],
  [/SPEED ?BOAT|SKIFF|CANOE|DHOW|CRAFT|BOAT/i, "Embarcation suspecte"],
  [/MILITAR|NAVY|NAVAL|COAST ?GUARD|GUNBOAT/i, "Activité militaire"],
];

const REGLES_NAVIRE = [
  [/UNKNOWN/i, "Non précisé"],
  [/TANKER/i, "Pétrolier et chimiquier"],
  [/BULK/i, "Vraquier"],
  [/CONTAINER/i, "Porte-conteneurs"],
  [/FISH|TRAWLER/i, "Navire de pêche"],
  [/YACHT|SAIL/i, "Voilier et yacht"],
  [/TUG|BARGE|TOW/i, "Remorqueur et barge"],
  [/OFFSHORE|SUPPLY|PLATFORM|DRILL|\bRIG\b/i, "Offshore et ravitailleur"],
  [/PASSENGER|CRUISE|FERRY/i, "Navire à passagers"],
  [/CARGO|FREIGHT/i, "Cargo"],
  [/MERCHANT|VESSEL|SHIP|MOTOR/i, "Navire marchand"],
];

const NON_PRECISE = "Non précisé";

/**
 * Les zones sont des NAVAREA — le découpage du monde par l'Organisation
 * maritime internationale pour les avis à la navigation. Le code est la
 * valeur de la source ; le nom qui l'accompagne n'est qu'une aide à la
 * lecture, sans lui « XI » ne dit rien à personne.
 */
const NOMS_ZONES = {
  I: "Europe du Nord",
  II: "Atlantique Est et Afrique de l'Ouest",
  III: "Méditerranée et mer Noire",
  IV: "Atlantique Ouest et Caraïbes",
  V: "Atlantique Sud-Ouest",
  VI: "Atlantique Sud",
  VII: "Afrique australe",
  VIII: "Océan Indien",
  IX: "Mer Rouge et golfe Persique",
  X: "Australie",
  XI: "Asie du Sud-Est et Pacifique Ouest",
  XII: "Pacifique Nord-Est",
  XIII: "Extrême-Orient russe",
  XIV: "Pacifique Sud central",
  XV: "Pacifique Sud-Est",
  XVI: "Pacifique Est",
};

/** Applique les règles dans l'ordre ; sans correspondance, « Non précisé ». */
function categoriser(libelle, regles) {
  if (!libelle) return NON_PRECISE;
  for (const [motif, categorie] of regles) {
    if (motif.test(libelle)) return categorie;
  }
  return NON_PRECISE;
}

/* ═══════════════════════════════════════════════════════════════════════
   État
   ═══════════════════════════════════════════════════════════════════════ */

const etat = {
  debut: 0,
  fin: 0,
  zones: new Set(),
  types: new Set(),
  navires: new Set(),
  recherche: "",
};

let base = null; // Données normalisées, chargées une fois.
let descriptions = null; // Récits, chargés après le premier affichage.
let carteGL = null;
let visibles = []; // Index des incidents passant les filtres.
let lecture = null; // Identifiant de l'animation temporelle.

/* ═══════════════════════════════════════════════════════════════════════
   Chargement
   ═══════════════════════════════════════════════════════════════════════ */

/*
 * Les deux requêtes partent ensemble. La carte a besoin du fond ET des
 * points ; les enchaîner ajouterait un aller-retour réseau complet au temps
 * d'affichage, sur une liaison mobile où c'est précisément ce qui coûte.
 */
const [reponseIncidents, reponseMonde] = await Promise.all([
  fetch(`${CHEMIN}/donnees/asam-carte.json`),
  fetch(`${CHEMIN}/monde.json`),
]);

if (!reponseIncidents.ok || !reponseMonde.ok) {
  $("attente-texte").textContent = "Les données n'ont pas pu être chargées.";
  throw new Error("chargement impossible");
}

const brut = await reponseIncidents.json();
const monde = await reponseMonde.json();

base = preparer(brut);
$("total-base").textContent = nombreFr.format(base.total);
$("periode-base").textContent = `${base.anneeMin} à ${base.anneeMax}`;

/**
 * Déplie le format colonnaire en objets exploitables, et calcule une fois
 * pour toutes ce qui servira à chaque filtrage.
 *
 * Le fichier est colonnaire et ses libellés répétés sont remplacés par un
 * index vers un dictionnaire — c'est ce qui le tient à 465 Ko pour 8 897
 * incidents. On le déplie ici, une seule fois : refaire ce travail à chaque
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

  const incidents = new Array(total);
  let anneeMin = Infinity;
  let anneeMax = -Infinity;
  const lons = Float64Array.from(col.longitude).sort();
  const lats = Float64Array.from(col.latitude).sort();

  for (let i = 0; i < total; i += 1) {
    const date = col.date[i];
    const annee = date ? Number(date.slice(0, 4)) : null;
    if (annee !== null) {
      if (annee < anneeMin) anneeMin = annee;
      if (annee > anneeMax) anneeMax = annee;
    }

    const codeAg = col.agresseur[i];
    const codeNv = col.navire[i];
    const codeZone = col.zone[i];

    incidents[i] = {
      i,
      lon: col.longitude[i],
      lat: col.latitude[i],
      date,
      annee,
      reference: col.reference[i],
      zone: codeZone < 0 ? "" : dico.zones[codeZone],
      sousRegion: col.sousRegion[i] < 0 ? "" : dico.sousRegions[col.sousRegion[i]],
      agresseur: codeAg < 0 ? "" : dico.agresseurs[codeAg],
      navire: codeNv < 0 ? "" : dico.navires[codeNv],
      catAgresseur: codeAg < 0 ? NON_PRECISE : catAgresseur[codeAg],
      catNavire: codeNv < 0 ? NON_PRECISE : catNavire[codeNv],
    };
  }

  return {
    meta: source.meta,
    incidents,
    total,
    anneeMin: Number.isFinite(anneeMin) ? anneeMin : 1978,
    anneeMax: Number.isFinite(anneeMax) ? anneeMax : new Date().getUTCFullYear(),
    /*
     * La longitude centrale d'ouverture : la médiane des incidents.
     *
     * Un cadrage par emprise (`fitBounds`) a été essayé et abandonné, pour une
     * raison qu'il vaut mieux écrire que redécouvrir : MapLibre impose que le
     * planisphère remplisse la hauteur de la fenêtre. Sur un téléphone en
     * portrait, cette contrainte fixe seule le zoom — mesuré à 0,72 sur un
     * écran de 844 px — et écrase toute emprise demandée, marges comprises.
     * Les réglages de cadrage n'avaient donc aucun effet.
     *
     * Reste un seul degré de liberté : où placer le centre horizontalement.
     * La médiane le pose au milieu de la bande qui porte le sujet — golfe de
     * Guinée, corne de l'Afrique, détroit de Malacca — là où le zoom imposé
     * laisse voir environ 166°, assez pour la contenir en entier.
     */
    lonMediane: centile(lons, 0.5),
    latMediane: centile(lats, 0.5),
  };
}

/** Le centile d'une série déjà triée. */
function centile(serie, part) {
  const rang = Math.min(serie.length - 1, Math.max(0, Math.round((serie.length - 1) * part)));
  return serie[rang];
}

/* ═══════════════════════════════════════════════════════════════════════
   Carte
   ═══════════════════════════════════════════════════════════════════════ */

/*
 * Le style est écrit ici, en entier, et ne référence aucun serveur de tuiles.
 * Deux raisons, également décisives : la page ne doit joindre aucun tiers
 * (donc aucune adresse IP de spectateur qui s'échappe), et un fond de tuiles
 * gratuit ajouterait des dizaines de requêtes réseau au chargement.
 *
 * Ce qu'on perd : les noms de lieux et le détail des côtes. Sur une carte
 * d'attaques en mer, c'est peu — et chaque incident nomme son pays dans sa
 * description.
 */
const STYLE = {
  version: 8,
  sources: {
    monde: { type: "geojson", data: monde },
  },
  layers: [
    {
      id: "mer",
      type: "background",
      paint: { "background-color": "#060d14" },
    },
    {
      id: "terres",
      type: "fill",
      source: "monde",
      paint: { "fill-color": "#101c27" },
    },
    {
      id: "cotes",
      type: "line",
      source: "monde",
      paint: {
        "line-color": "#22384a",
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
  center: [base.lonMediane, base.latMediane],
  /*
   * Zéro : c'est un plancher, pas une consigne. La contrainte de MapLibre —
   * le planisphère doit remplir la hauteur — remonte ce zoom d'elle-même au
   * minimum que l'écran autorise. On demande donc « le plus large possible »,
   * et chaque taille d'écran obtient sa réponse.
   */
  zoom: 0,
  maxZoom: 12,
  /*
   * Un seul planisphère, pas de répétition horizontale.
   *
   * Sur un écran large, les copies affichaient deux fois les mêmes foyers :
   * le même millier d'attaques au large de la Somalie apparaissait à gauche
   * et à droite, ce qui laisse croire à deux zones distinctes.
   *
   * Les copies avaient d'abord été rétablies parce que les pays franchissant
   * l'antiméridien se dépliaient en bandes pâles à travers la carte. Ce
   * défaut est corrigé à la source, dans `scripts/carte-preparer.mjs`, qui
   * déroule ces contours : il n'y a plus de raison de les subir.
   */
  renderWorldCopies: false,
  attributionControl: {
    compact: true,
    customAttribution:
      '<a href="https://msi.nga.mil/Piracy">NGA — base ASAM</a> · fond Natural Earth',
  },
});

carteGL.addControl(new NavigationControl({ showCompass: false }), "top-right");
carteGL.addControl(new ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-right");
carteGL.keyboard.enable();

await new Promise((resoudre) => carteGL.on("load", resoudre));

carteGL.addSource("incidents", {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
  cluster: true,
  clusterRadius: 46,
  // Au-delà, les points se séparent : c'est là qu'on veut lire les incidents
  // un par un plutôt que leur nombre. Huit et non douze — le regroupement ne
  // doit pas survivre jusqu'au zoom maximal, sans quoi on ne peut plus
  // atteindre un incident précis.
  clusterMaxZoom: 8,
});

carteGL.addLayer({
  id: "grappes",
  type: "circle",
  source: "incidents",
  filter: ["has", "point_count"],
  paint: {
    // La couleur monte de l'ambre au rouge sombre avec le nombre : on repère
    // les foyers d'un coup d'œil, sans lire un seul chiffre.
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#ffb02e",
      25,
      "#ff7a1a",
      100,
      "#f4471f",
      400,
      "#c2160f",
    ],
    "circle-radius": ["step", ["get", "point_count"], 15, 25, 19, 100, 24, 400, 30],
    "circle-opacity": 0.88,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "rgba(255,255,255,0.28)",
  },
});

carteGL.addLayer({
  id: "points",
  type: "circle",
  source: "incidents",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": "#ff7a1a",
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3, 7, 5, 12, 8],
    "circle-opacity": 0.9,
    "circle-stroke-width": 1,
    "circle-stroke-color": "rgba(255,220,180,0.45)",
  },
});

/* ═══════════════════════════════════════════════════════════════════════
   Nombres des regroupements

   MapLibre ne sait pas écrire de texte sans serveur de polices, et en appeler
   un ferait joindre un domaine tiers à chaque spectateur — exactement ce que
   la page s'interdit. Les cercles sont donc dessinés par la carte, et les
   nombres posés par-dessus en HTML.

   Les étiquettes sont des marqueurs MapLibre : elles suivent la carte
   d'elles-mêmes pendant les déplacements. On ne recalcule la liste qu'à
   l'arrêt, et on réconcilie par identifiant pour éviter que tout clignote.
   ═══════════════════════════════════════════════════════════════════════ */

const etiquettes = new Map();

function rafraichirEtiquettes() {
  if (!carteGL.getLayer("grappes")) return;

  const vues = carteGL.queryRenderedFeatures({ layers: ["grappes"] });
  const presents = new Set();

  for (const forme of vues) {
    const id = forme.properties.cluster_id;
    presents.add(id);
    if (etiquettes.has(id)) continue;

    const element = document.createElement("span");
    element.className = "grappe-etiquette";
    element.textContent = nombreFr.format(forme.properties.point_count);
    // Le nombre double une information déjà portée par la couleur et la
    // taille du cercle ; le lire à voix haute n'apporterait rien, et la liste
    // des incidents offre un chemin complet au clavier.
    element.setAttribute("aria-hidden", "true");

    etiquettes.set(
      id,
      new Marker({ element }).setLngLat(forme.geometry.coordinates).addTo(carteGL),
    );
  }

  for (const [id, marqueur] of etiquettes) {
    if (!presents.has(id)) {
      marqueur.remove();
      etiquettes.delete(id);
    }
  }
}

function viderEtiquettes() {
  for (const marqueur of etiquettes.values()) marqueur.remove();
  etiquettes.clear();
}

carteGL.on("idle", rafraichirEtiquettes);

/* ═══════════════════════════════════════════════════════════════════════
   Filtrage et rendu
   ═══════════════════════════════════════════════════════════════════════ */

function passeLesFiltres(incident, recherche) {
  if (incident.annee !== null) {
    if (incident.annee < etat.debut || incident.annee > etat.fin) return false;
  }
  if (etat.zones.size && !etat.zones.has(incident.zone)) return false;
  if (etat.types.size && !etat.types.has(incident.catAgresseur)) return false;
  if (etat.navires.size && !etat.navires.has(incident.catNavire)) return false;

  if (recherche) {
    // La recherche porte sur les descriptions ; tant qu'elles ne sont pas
    // arrivées, le champ reste désactivé et on n'entre jamais ici.
    const recit = descriptions ? descriptions[incident.i] : "";
    const ailleurs = `${incident.navire} ${incident.agresseur} ${incident.reference}`;
    if (!`${recit} ${ailleurs}`.toLowerCase().includes(recherche)) return false;
  }
  return true;
}

function appliquer() {
  const recherche = etat.recherche.trim().toLowerCase();
  visibles = [];
  const formes = [];

  for (const incident of base.incidents) {
    if (!passeLesFiltres(incident, recherche)) continue;
    visibles.push(incident);
    formes.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [incident.lon, incident.lat] },
      properties: { i: incident.i },
    });
  }

  /*
   * On remplace les données de la source plutôt que d'appliquer un filtre de
   * couche. Sur une source regroupée, un filtre s'applique APRÈS le
   * regroupement : les cercles garderaient le compte de tous les incidents,
   * filtrés compris, et les nombres affichés contrediraient le compteur.
   */
  carteGL.getSource("incidents").setData({ type: "FeatureCollection", features: formes });
  viderEtiquettes();

  const compteur = $("compteur");
  compteur.innerHTML = "";
  const fort = document.createElement("strong");
  fort.textContent = nombreFr.format(visibles.length);
  compteur.append(fort, ` incident${visibles.length > 1 ? "s" : ""} affiché${visibles.length > 1 ? "s" : ""}`);

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

/* ═══════════════════════════════════════════════════════════════════════
   Curseur temporel
   ═══════════════════════════════════════════════════════════════════════ */

const curseurDebut = $("annee-debut");
const curseurFin = $("annee-fin");

for (const curseur of [curseurDebut, curseurFin]) {
  curseur.min = String(base.anneeMin);
  curseur.max = String(base.anneeMax);
  curseur.step = "1";
}

function majTemps() {
  $("temps-libelle").textContent = `${etat.debut} – ${etat.fin}`;
  curseurDebut.value = String(etat.debut);
  curseurFin.value = String(etat.fin);
  curseurDebut.setAttribute("aria-valuetext", `début ${etat.debut}`);
  curseurFin.setAttribute("aria-valuetext", `fin ${etat.fin}`);

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
    etat.debut = base.anneeMin;
    etat.fin = Math.min(base.anneeMin + FENETRE_DEFAUT - 1, base.anneeMax);
    majTemps();
    appliquer();
  }

  $("bouton-lecture").dataset.joue = "";
  $("bouton-lecture").setAttribute("aria-label", "Arrêter l'animation temporelle");

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
  $("bouton-lecture").setAttribute("aria-label", "Lancer l'animation temporelle");
}

$("bouton-lecture").addEventListener("click", basculerLecture);

/* ═══════════════════════════════════════════════════════════════════════
   Filtres
   ═══════════════════════════════════════════════════════════════════════ */

/** Recense les valeurs présentes et leur nombre, du plus fréquent au moins. */
function recenser(cle) {
  const compte = new Map();
  for (const incident of base.incidents) {
    const valeur = incident[cle] || NON_PRECISE;
    compte.set(valeur, (compte.get(valeur) ?? 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1]);
}

function construireJetons(conteneur, entrees, ensemble, etiqueter) {
  conteneur.innerHTML = "";
  for (const [valeur, nombre] of entrees) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "jeton";
    bouton.setAttribute("aria-pressed", ensemble.has(valeur) ? "true" : "false");

    const texte = document.createElement("span");
    texte.textContent = etiqueter ? etiqueter(valeur) : valeur;
    const compte = document.createElement("span");
    compte.className = "jeton-compte";
    compte.textContent = nombreFr.format(nombre);
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

const entreesZones = recenser("zone").filter(([v]) => v && v !== NON_PRECISE);
const entreesTypes = recenser("catAgresseur");
const entreesNavires = recenser("catNavire");

/*
 * Les jetons ne sont construits qu'au démarrage, APRÈS la lecture de
 * l'adresse : leur état enfoncé reflète les filtres reçus dans l'URL, sans
 * qu'on ait à les repasser en revue ensuite.
 */
function construireTousLesJetons() {
  construireJetons($("filtre-zones"), entreesZones, etat.zones, (code) =>
    NOMS_ZONES[code] ? `${code} · ${NOMS_ZONES[code]}` : code,
  );
  construireJetons($("filtre-types"), entreesTypes, etat.types);
  construireJetons($("filtre-navires"), entreesNavires, etat.navires);
}

function majPastilleFiltres() {
  const nombre = etat.zones.size + etat.types.size + etat.navires.size;
  const pastille = $("pastille-filtres");
  pastille.textContent = String(nombre);
  pastille.hidden = nombre === 0;
}

$("bouton-effacer").addEventListener("click", () => {
  etat.zones.clear();
  etat.types.clear();
  etat.navires.clear();
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
  $("recherche").focus();
});

/* ═══════════════════════════════════════════════════════════════════════
   Recherche
   ═══════════════════════════════════════════════════════════════════════ */

let minuterieRecherche = null;
$("recherche").addEventListener("input", (evenement) => {
  clearTimeout(minuterieRecherche);
  // Une frappe ne doit pas relancer un balayage des 8 897 récits : on attend
  // que la saisie se pose.
  minuterieRecherche = setTimeout(() => {
    etat.recherche = evenement.target.value;
    arreterLecture();
    appliquer();
  }, 180);
});

/*
 * Les récits pèsent l'essentiel du poids et la carte n'en a besoin d'aucun
 * pour s'afficher. Ils partent donc après le premier rendu, sans bloquer
 * quoi que ce soit : la recherche s'active à leur arrivée.
 */
function chargerDescriptions() {
  fetch(`${CHEMIN}/donnees/asam-descriptions.json`)
    .then((reponse) => (reponse.ok ? reponse.json() : null))
    .then((recits) => {
      if (!recits) return;
      descriptions = recits;
      const champ = $("recherche");
      champ.disabled = false;
      champ.placeholder = "Somalie, otage, tanker…";
      // Une fiche ouverte avant l'arrivée des récits attend son texte.
      if (ficheOuverte !== null) remplirDescription(ficheOuverte);
      // Une recherche reçue par l'adresse n'a pu porter que sur les libellés
      // jusqu'ici : maintenant que les récits sont là, on la rejoue.
      if (etat.recherche.trim()) appliquer();
    })
    .catch(() => {
      $("recherche").placeholder = "Recherche indisponible";
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   Fiche d'un incident
   ═══════════════════════════════════════════════════════════════════════ */

let ficheOuverte = null;

function formaterCoordonnees(lat, lon) {
  const t = (valeur, positif, negatif) =>
    `${Math.abs(valeur).toFixed(3)}° ${valeur >= 0 ? positif : negatif}`;
  return `${t(lat, "N", "S")}, ${t(lon, "E", "O")}`;
}

function ligne(liste, intitule, valeur) {
  const dt = document.createElement("dt");
  dt.textContent = intitule;
  const dd = document.createElement("dd");
  if (valeur) {
    dd.textContent = valeur;
  } else {
    // Le champ est absent de la source : on le dit, on ne le devine pas.
    dd.textContent = "non renseigné";
    dd.dataset.vide = "";
  }
  liste.append(dt, dd);
}

function remplirDescription(index) {
  const cible = $("fiche-description");
  if (!descriptions) {
    cible.textContent = "Chargement du récit…";
    return;
  }
  const recit = descriptions[index];
  cible.textContent = recit || "Aucune description dans la source.";
  if (!recit) cible.style.fontStyle = "italic";
  else cible.style.fontStyle = "";
}

function ouvrirFiche(index) {
  const incident = base.incidents[index];
  if (!incident) return;
  ficheOuverte = index;

  $("fiche-titre").textContent = incident.date
    ? dateFr.format(new Date(`${incident.date}T00:00:00Z`))
    : "Date inconnue";

  const champs = $("fiche-champs");
  champs.innerHTML = "";
  ligne(champs, "Position", formaterCoordonnees(incident.lat, incident.lon));
  ligne(
    champs,
    "Zone",
    incident.zone
      ? `${incident.zone}${NOMS_ZONES[incident.zone] ? ` — ${NOMS_ZONES[incident.zone]}` : ""}`
      : "",
  );
  ligne(champs, "Sous-région", incident.sousRegion);
  ligne(champs, "Navire visé", incident.navire);
  ligne(champs, "Agresseur", incident.agresseur);

  remplirDescription(index);
  $("fiche-reference").textContent = incident.reference
    ? `Référence ASAM ${incident.reference} — National Geospatial-Intelligence Agency`
    : "Référence ASAM non renseignée";

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

carteGL.on("click", "points", (evenement) => {
  const index = evenement.features?.[0]?.properties?.i;
  if (index !== undefined) ouvrirFiche(Number(index));
});

carteGL.on("click", "grappes", async (evenement) => {
  const forme = evenement.features?.[0];
  if (!forme) return;
  const source = carteGL.getSource("incidents");
  const separation = await source.getClusterExpansionZoom(forme.properties.cluster_id);

  /*
   * Au moins deux crans de zoom par toucher.
   *
   * Le zoom de séparation rendu par la bibliothèque est le minimum auquel le
   * regroupement se scinde — souvent un demi-cran. Sur les foyers denses, le
   * détroit de Malacca en tête, il fallait une dizaine de touchers pour
   * atteindre les incidents un par un : mesuré en essai, neuf touchers ne
   * suffisaient pas à descendre sous 784 incidents groupés.
   *
   * En sautant plus loin, trois ou quatre touchers suffisent. On ne dépasse
   * jamais le zoom maximal de la carte.
   */
  const zoom = Math.min(carteGL.getMaxZoom(), Math.max(separation, carteGL.getZoom() + 2));
  carteGL.easeTo({ center: forme.geometry.coordinates, zoom });
});

for (const couche of ["points", "grappes"]) {
  carteGL.on("mouseenter", couche, () => {
    carteGL.getCanvas().style.cursor = "pointer";
  });
  carteGL.on("mouseleave", couche, () => {
    carteGL.getCanvas().style.cursor = "";
  });
}

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

$("bouton-replier").addEventListener("click", () => {
  const commandes = $("commandes");
  const replie = commandes.hasAttribute("data-replie");
  commandes.toggleAttribute("data-replie", !replie);
  $("bouton-replier").setAttribute("aria-expanded", String(replie));
});

document.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;
  if (!$("fiche").hidden) fermerFiche();
  else if (!$("apropos").hidden) fermerApropos();
  else arreterLecture();
});

/* ═══════════════════════════════════════════════════════════════════════
   Partage : l'état des filtres tient dans l'adresse
   ═══════════════════════════════════════════════════════════════════════ */

function majUrl() {
  const p = new URLSearchParams();
  if (etat.debut !== base.anneeMin) p.set("de", String(etat.debut));
  if (etat.fin !== base.anneeMax) p.set("a", String(etat.fin));
  if (etat.zones.size) p.set("zone", [...etat.zones].join("|"));
  if (etat.types.size) p.set("type", [...etat.types].join("|"));
  if (etat.navires.size) p.set("navire", [...etat.navires].join("|"));
  if (etat.recherche.trim()) p.set("q", etat.recherche.trim());

  const suite = p.toString();
  // `replaceState` et non `pushState` : chaque cran du curseur temporel
  // remplirait sinon l'historique, et le bouton « retour » du téléphone
  // deviendrait inutilisable.
  history.replaceState(null, "", suite ? `?${suite}` : location.pathname);
}

function lireUrl() {
  const p = new URLSearchParams(location.search);
  const entier = (cle, defaut) => {
    const valeur = Number(p.get(cle));
    if (!Number.isFinite(valeur) || !p.has(cle)) return defaut;
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
  const adresse = location.href;
  try {
    await navigator.clipboard.writeText(adresse);
    souffler("Lien copié, filtres compris.");
  } catch {
    // Le presse-papiers est refusé hors contexte sécurisé, et sur certains
    // navigateurs mobiles : l'adresse est déjà dans la barre, on le dit.
    souffler("Copiez l'adresse de la page : elle contient vos filtres.");
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Démarrage
   ═══════════════════════════════════════════════════════════════════════ */

etat.debut = base.anneeMin;
etat.fin = base.anneeMax;
lireUrl();
majTemps();
construireTousLesJetons();
appliquer();

const capture = base.meta?.captureDu;
$("apropos-capture").textContent = capture
  ? `La NGA ne diffuse plus cette base publiquement. Les données affichées sont sa réponse officielle telle qu'archivée le ${dateFr.format(new Date(`${capture}T00:00:00Z`))} : elles s'arrêtent donc à cette date.`
  : `Données récupérées le ${base.meta?.genereLe ?? "—"} depuis l'API de la NGA.`;

$("attente").dataset.fini = "";
setTimeout(() => {
  $("attente").remove();
}, 400);

// Une fois la carte posée et le premier rendu fait, on va chercher les récits.
carteGL.once("idle", chargerDescriptions);
