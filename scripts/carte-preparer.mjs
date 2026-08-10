#!/usr/bin/env node
/**
 * Prépare les ressources statiques de la carte des attaques.
 *
 * Deux choses, toutes deux tirées de `node_modules` et donc jamais écrites à
 * la main ni commitées :
 *
 *   1. les fichiers de MapLibre GL JS, recopiés tels quels ;
 *   2. le fond de carte du monde, converti depuis Natural Earth.
 *
 * Lancé automatiquement avant chaque construction (script `prebuild`).
 *
 * Pourquoi recopier plutôt que servir depuis un CDN : la page ne doit joindre
 * aucun tiers. Pas de requête vers un domaine extérieur, donc pas de fuite
 * d'adresse IP des spectateurs, pas de dépendance à la disponibilité d'un
 * service, et une politique de sécurité qui reste fermée à « soi-même ».
 */

import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { feature } from "topojson-client";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RACINE = path.resolve(import.meta.dirname, "..");
const SORTIE = path.join(RACINE, "public", "piraterie");

/*
 * MapLibre 6 est livré en modules ES, et les trois fichiers vont ensemble :
 * le module principal, la part commune, et le worker que la bibliothèque
 * résout par `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — d'où
 * l'obligation de les garder dans le même dossier, côte à côte.
 *
 * C'est aussi ce qui évite d'assouplir la politique de sécurité du site : le
 * worker est un fichier de notre domaine, pas un blob. `script-src 'self'`
 * suffit, rien à ouvrir.
 */
const FICHIERS_MAPLIBRE = [
  "maplibre-gl.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl-worker.mjs",
  "maplibre-gl.css",
];

async function copierMaplibre() {
  const source = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.css"));
  const destination = path.join(SORTIE, "vendeur");
  await mkdir(destination, { recursive: true });

  for (const nom of FICHIERS_MAPLIBRE) {
    await copyFile(path.join(source, nom), path.join(destination, nom));
  }
  console.error(`MapLibre : ${FICHIERS_MAPLIBRE.length} fichiers copiés`);
}

/**
 * Déroule les contours qui franchissent l'antiméridien.
 *
 * Quatre anneaux du fichier — Antarctique, Russie, Fidji — sautent de +180°
 * à -180° en un point. Le moteur de rendu lit ce saut comme un tracé qui
 * traverse la Terre entière et le remplit : à l'écran, des bandes pâles
 * barraient toute la carte au niveau de l'Arctique.
 *
 * Le déroulage supprime le saut sans déformer la géométrie : quand deux
 * points consécutifs s'écartent de plus de 180°, on ajoute ou retranche un
 * tour complet aux suivants. Le contour continue alors au-delà de 180° — la
 * Tchoukotka se poursuit vers 185° au lieu de repartir à -175° — et se dessine
 * d'un seul trait au lieu de balayer le globe.
 *
 * Sans effet sur les 173 autres pays, dont aucun point ne saute.
 */
function derouler(geometrie) {
  const anneau = (points) => {
    const sortie = [];
    let decalage = 0;
    for (let i = 0; i < points.length; i += 1) {
      const [lon, lat] = points[i];
      if (i > 0) {
        const ecart = lon - points[i - 1][0];
        if (ecart > 180) decalage -= 360;
        else if (ecart < -180) decalage += 360;
      }
      sortie.push([lon + decalage, lat]);
    }
    return sortie;
  };

  if (geometrie.type === "Polygon") {
    return { type: "Polygon", coordinates: geometrie.coordinates.map(anneau) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometrie.coordinates.map((p) => p.map(anneau)),
  };
}

/**
 * Le fond de carte, converti en GeoJSON.
 *
 * Natural Earth au 1:110 000 000, domaine public. C'est la version la plus
 * grossière des trois disponibles, et c'est un choix : au 1:50 000 000 le même
 * fichier pèse 820 Ko compressés contre 143 Ko ici. Sur un téléphone en 4G,
 * ces 677 Ko supplémentaires coûteraient plus que ce que la finesse du trait
 * apporte — une carte d'attaques maritimes se lit à l'échelle d'une mer, pas
 * d'une crique.
 *
 * Les pays plutôt que les seules terres émergées : les frontières coûtent
 * 67 Ko de plus et permettent de se situer. Sans elles, un aplat de continents
 * sans repère.
 */
async function preparerFond() {
  const topologie = require("world-atlas/countries-110m.json");
  const pays = feature(topologie, topologie.objects.countries);

  /*
   * Les propriétés sont retirées : le fond ne sert qu'à dessiner des formes,
   * les noms de pays ne sont jamais affichés. Les garder, c'est transporter
   * un dictionnaire inutile jusqu'au téléphone.
   */
  const allege = {
    type: "FeatureCollection",
    features: pays.features.map((f) => ({
      type: "Feature",
      geometry: derouler(f.geometry),
    })),
  };

  await mkdir(SORTIE, { recursive: true });
  const fichier = path.join(SORTIE, "monde.json");
  await writeFile(fichier, JSON.stringify(allege), "utf8");

  const poids = Buffer.byteLength(JSON.stringify(allege));
  console.error(`Fond de carte : ${allege.features.length} pays, ${Math.round(poids / 1024)} Ko`);
}

await copierMaplibre();
await preparerFond();
