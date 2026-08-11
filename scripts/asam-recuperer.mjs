#!/usr/bin/env node
/**
 * Récupération de la base ASAM — Anti-Shipping Activity Messages.
 *
 * Source unique et officielle : National Geospatial-Intelligence Agency (NGA),
 * https://msi.nga.mil/Piracy — base publique des attaques contre des navires
 * signalées dans le monde depuis la fin des années 1970.
 *
 * Ce script fait quatre choses, dans cet ordre :
 *   1. il télécharge le fichier officiel ;
 *   2. il normalise les champs (dates, coordonnées, libellés) ;
 *   3. il écarte les enregistrements sans coordonnées exploitables ;
 *   4. il écrit deux fichiers JSON statiques, consommés par la carte.
 *
 * Règle tenue de bout en bout : RIEN n'est inventé. Un champ absent de la
 * source reste vide en sortie — jamais deviné, jamais complété, jamais
 * remplacé par une valeur « probable ». Un enregistrement inutilisable est
 * écarté et compté, pas rafistolé.
 *
 * Usage :
 *   node scripts/asam-recuperer.mjs              → télécharge, écrit, résume
 *   node scripts/asam-recuperer.mjs --chiffres   → télécharge et résume, n'écrit rien
 *   node scripts/asam-recuperer.mjs --hors-ligne → réutilise le cache brut déjà téléchargé
 *
 * Aucune dépendance : Node 18+ suffit (fetch natif).
 *
 * Note pour les sessions Claude Code exécutées dans le nuage : le `fetch`
 * natif de Node ignore `HTTPS_PROXY`. Il faut alors préfixer la commande par
 * `NODE_USE_ENV_PROXY=1`, sans quoi la requête part en direct et expire.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { verifierPositions } from "./positions-verifier.mjs";

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

const RACINE = path.resolve(import.meta.dirname, "..");
/*
 * Les données sortent sous `public/piraterie/` avec le reste du site public.
 * Un seul dossier public, une seule surface exposée : c'est ce qui permet au
 * middleware de n'ouvrir qu'un chemin plutôt que d'en énumérer huit.
 */
const DOSSIER_SORTIE = path.join(RACINE, "public", "piraterie", "donnees");
const DOSSIER_CACHE = path.join(RACINE, ".cache");
const CACHE_BRUT = path.join(DOSSIER_CACHE, "asam-brut.json");

/**
 * Les adresses candidates de l'API, essayées dans l'ordre.
 *
 * Pourquoi plusieurs : l'API de la NGA a changé de forme au fil des années et
 * n'est documentée nulle part de façon stable. Selon les périodes, elle exige
 * une fenêtre de dates explicite ou renvoie tout d'un coup. Plutôt que de
 * parier sur une seule adresse — et de casser silencieusement le jour où elle
 * bouge — on les essaie toutes et on garde la réponse la plus fournie.
 *
 * `ANNEE_PLANCHER` est volontairement très antérieure au premier
 * enregistrement connu : la fenêtre doit englober la base, pas la découper.
 */
const ANNEE_PLANCHER = 1960;
const ANNEE_PLAFOND = new Date().getUTCFullYear() + 1;

const ADRESSES = [
  {
    url: "https://msi.nga.mil/api/publications/asam?filter=none&sort=date&output=json",
    libelle: "NGA, en direct",
  },
  {
    url: "https://msi.nga.mil/api/publications/asam?output=json",
    libelle: "NGA, en direct (forme historique)",
  },
  {
    url: `https://msi.nga.mil/api/publications/asam?minOccurDate=${ANNEE_PLANCHER}-01-01&maxOccurDate=${ANNEE_PLAFOND}-12-31&output=json`,
    libelle: "NGA, en direct (fenêtre de dates)",
  },
  /*
   * Dernier recours : la réponse de la NGA telle qu'elle a été archivée.
   *
   * En août 2026, la NGA ne sert plus ASAM : tous les chemins « asam »
   * répondent 404 pendant que leurs voisins (World Port Index, Broadcast
   * Warnings) répondent 200 sans authentification. Ce n'est pas un problème
   * d'accès de notre côté — la page Piraterie de la NGA appelle exactement
   * l'adresse qui échoue.
   *
   * Cette capture est la réponse officielle de la NGA, à son adresse, telle
   * qu'elle était le 27 septembre 2023 : « filter=none », donc la base
   * entière. Ce n'est pas une recopie par un tiers, c'est l'original figé.
   *
   * Les adresses en direct restent essayées d'abord : le jour où la NGA
   * rétablit son service, la collecte repart d'elle-même sur la source
   * vivante, sans rien changer ici.
   */
  {
    url:
      "https://web.archive.org/web/20230927174507id_/" +
      "https://msi.nga.mil/api/publications/asam?filter=none&sort=date&output=html",
    libelle: "NGA, capture archivée",
    capture: "2023-09-27",
  },
];

const DELAI_REQUETE_MS = 180_000; // La base entière pèse plusieurs mégaoctets.
const TENTATIVES = 4;

/* ------------------------------------------------------------------ */
/* Téléchargement                                                      */
/* ------------------------------------------------------------------ */

/**
 * Une requête, avec délai maximal et réessais à intervalle croissant.
 *
 * Les réessais ne couvrent que les pannes réseau et les erreurs serveur
 * (5xx) : un 403 ou un 404 est une réponse, pas un incident, et insister
 * ne la changera pas.
 */
async function telecharger(adresse) {
  let dernierEchec;

  for (let tentative = 1; tentative <= TENTATIVES; tentative += 1) {
    const minuterie = AbortSignal.timeout(DELAI_REQUETE_MS);

    try {
      const reponse = await fetch(adresse, {
        signal: minuterie,
        headers: {
          accept: "application/json",
          // Un agent explicite : la NGA sert une base publique, autant dire
          // qui la consulte plutôt que de se faire passer pour un navigateur.
          "user-agent": "carte-piraterie/1.0 (documentaire; donnees ASAM NGA)",
        },
      });

      if (reponse.ok) return await reponse.text();

      // 4xx : la réponse est définitive, inutile de réessayer.
      if (reponse.status < 500) {
        throw new Error(`HTTP ${reponse.status} ${reponse.statusText}`);
      }
      dernierEchec = new Error(`HTTP ${reponse.status} ${reponse.statusText}`);
    } catch (erreur) {
      dernierEchec = erreur;
      // Une erreur définitive relevée juste au-dessus ne doit pas être rejouée.
      if (String(erreur.message).startsWith("HTTP 4")) throw erreur;
    }

    if (tentative < TENTATIVES) {
      const attente = 2 ** tentative * 1000;
      console.error(
        `   tentative ${tentative}/${TENTATIVES} échouée (${dernierEchec.message}) — nouvel essai dans ${attente / 1000} s`,
      );
      await new Promise((resoudre) => setTimeout(resoudre, attente));
    }
  }

  throw dernierEchec;
}

/**
 * Extrait le tableau d'enregistrements d'une réponse de l'API.
 *
 * L'API a servi selon les époques un objet `{ asam: [...] }`, un objet
 * `{ "asam-query-result": [...] }` ou un tableau nu. On cherche donc le
 * premier tableau d'objets rencontré plutôt que d'imposer une forme.
 */
function extraireEnregistrements(texte) {
  let charge;
  try {
    charge = JSON.parse(texte);
  } catch {
    return null; // Réponse HTML (page d'erreur, portail captif) : inexploitable.
  }

  if (Array.isArray(charge)) return charge;
  if (!charge || typeof charge !== "object") return null;

  for (const valeur of Object.values(charge)) {
    if (Array.isArray(valeur) && valeur.length > 0 && typeof valeur[0] === "object") {
      return valeur;
    }
  }
  return null;
}

/**
 * Essaie chaque adresse et retient la réponse contenant le plus d'incidents.
 *
 * On ne s'arrête pas à la première qui répond : une adresse peut répondre
 * correctement en ne servant qu'une tranche de la base. Le nombre
 * d'enregistrements tranche, pas l'ordre d'essai.
 */
async function recupererSource() {
  let meilleur = null;

  for (const source of ADRESSES) {
    console.error(`→ ${source.libelle}`);
    try {
      const texte = await telecharger(source.url);
      const enregistrements = extraireEnregistrements(texte);

      if (!enregistrements) {
        console.error("   réponse illisible (ni JSON, ni tableau d'objets)");
        continue;
      }

      console.error(`   ${enregistrements.length} enregistrements`);
      if (!meilleur || enregistrements.length > meilleur.enregistrements.length) {
        meilleur = { source, enregistrements };
      }
    } catch (erreur) {
      console.error(`   échec : ${erreur.message}`);
    }
  }

  if (!meilleur) {
    throw new Error(
      "Aucune adresse de l'API ASAM n'a répondu, capture archivée comprise.",
    );
  }
  return meilleur;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Lit un champ sans dépendre de sa casse ni de son orthographe exacte.
 *
 * Les noms de colonnes de la source ne sont garantis par aucun contrat :
 * `subreg` et `subRegion` ont coexisté, `date` a parfois été `dateOfOccurrence`.
 * On accepte donc une liste d'alias, comparés en minuscules sans séparateurs.
 */
export function champ(enregistrement, ...alias) {
  const index = new Map(
    Object.entries(enregistrement).map(([cle, valeur]) => [
      cle.toLowerCase().replace(/[^a-z0-9]/g, ""),
      valeur,
    ]),
  );

  for (const nom of alias) {
    const valeur = index.get(nom.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (valeur !== undefined && valeur !== null) return valeur;
  }
  return undefined;
}

/** Chaîne nettoyée, ou chaîne vide. Jamais de valeur inventée pour combler. */
function texte(valeur) {
  if (valeur === undefined || valeur === null) return "";
  return String(valeur).replace(/\s+/g, " ").trim();
}

/**
 * Date normalisée en `AAAA-MM-JJ`, ou chaîne vide si illisible.
 *
 * La source mélange les formats selon l'ancienneté des enregistrements :
 * ISO, américain (mois d'abord), et parfois un horodatage complet. On ne
 * délègue pas à `new Date()` sur les formats ambigus — `Date` interprète
 * `03/04/2019` à l'américaine sans le dire, ce qui inverserait
 * silencieusement jour et mois.
 */
export function dateNormalisee(valeur) {
  const brut = texte(valeur);
  if (!brut) return "";

  const iso = brut.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const americain = brut.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (americain) {
    const [, mois, jour, annee] = americain;
    return `${annee}-${mois.padStart(2, "0")}-${jour.padStart(2, "0")}`;
  }

  return "";
}

/**
 * Coordonnée numérique, ou `null`.
 *
 * `null` déclenche l'exclusion de l'enregistrement : un incident sans point
 * sur le globe n'a rien à faire sur une carte. Les valeurs hors bornes
 * (latitude au-delà des pôles, longitude au-delà de l'antiméridien) sont
 * traitées comme absentes plutôt que ramenées de force dans l'intervalle :
 * une donnée fausse vaut moins qu'une donnée manquante.
 */
export function coordonnee(valeur, borne) {
  if (valeur === undefined || valeur === null || valeur === "") return null;
  const nombre = typeof valeur === "number" ? valeur : Number(String(valeur).trim());
  if (!Number.isFinite(nombre)) return null;
  if (Math.abs(nombre) > borne) return null;
  return nombre;
}

/** Arrondi à 4 décimales : environ 11 mètres, très au-delà du besoin. */
const arrondir = (nombre) => Math.round(nombre * 1e4) / 1e4;

/**
 * L'échelle de gravité, lue dans le récit de la NGA.
 *
 * La base ne classe pas les incidents par gravité : elle range côte à côte
 * un équipage assassiné et une barque qui s'approche puis repart. Sur une
 * carte où chaque attaque est un bateau, il faut pourtant distinguer les
 * deux — sinon quarante-cinq ans d'événements se valent tous.
 *
 * Ce qu'on fait, et il faut le dire tel quel : on CLASSE, on n'ajoute rien.
 * Chaque niveau vient de mots présents dans le récit officiel, et le récit
 * intégral reste affiché sur la fiche, sans coupe. Le lecteur peut toujours
 * vérifier le classement sur pièce.
 *
 * Les règles sont appliquées dans l'ordre, du plus grave au moins grave :
 * une attaque qui tue et vole est comptée parmi les morts.
 *
 * Relevé sur les 8 897 récits : 264 morts, 2 296 violences ou enlèvements,
 * 4 761 abordages avec vol, 1 570 tentatives ou approches. Six incidents
 * n'ont aucun récit et ne sont pas classés.
 */
/*
 * Les tournures où les mots de la gravité ne disent RIEN de ce qu'on cherche.
 *
 * Elles sont effacées du texte AVANT toute recherche, et cette étape n'est
 * pas un raffinement : sans elle, un cinquième des « attaques mortelles »
 * n'en étaient pas. Le relevé, fait sur les 8 897 récits :
 *
 *   · « following the activation of the DEAD MAN alarm » — un dispositif de
 *     sécurité qui détecte l'immobilité d'un homme de quart ;
 *   · « the towed DEAD SHIP », « the DEAD VESSEL DAWN 1 » — un navire sans
 *     propulsion ;
 *   · « hurling lead weights, anchors, trash, DEAD FISH » — des poissons ;
 *   · « a small craft STOPPED DEAD ahead », « observed DEAD AHEAD » — un
 *     relèvement, une manœuvre ;
 *   · « repeated three times before the line WENT DEAD » — une liaison radio
 *     qui se coupe, au moment précis où le navire est pris ;
 *   · « they THREATENED TO KILL him if he failed to cooperate » — une menace,
 *     et le propre d'une menace est de ne pas avoir été exécutée.
 *
 * Même chose au niveau « violence » : « NO INJURIES REPORTED » et « all crew
 * safe » contiennent les mots qu'on cherche et affirment exactement le
 * contraire. 266 incidents en étaient faussement crédités.
 */
const LEURRES = new RegExp(
  [
    // « dead » qui ne parle pas d'un mort
    "dead[- ]?(?:man|ship|vessel|boat|craft|fish|slow|weight|reckoning|end)",
    "dead (?:ahead|astern|calm)",
    "dead in the water",
    "stopped dead",
    "(?:line|lines|communications?|contact|radio|signal|call)[^.]{0,20}went dead",
    "went dead",
    "\\bdeadweight\\b",
    // menaces et tentatives : personne n'est mort
    "threaten(?:ed|ing)?[^.]{0,30}\\bkill\\b",
    "attempt(?:ed|ing)?[^.]{0,20}\\bkill\\b",
    "would[^.]{0,30}\\bkill\\b",
    "going to \\bkill\\b",
    "\\bkill\\b (?:him|her|them|the crew|all|everyone)",
    // absence explicite de blessé
    "no (?:one |crew |persons? )?(?:were |was |been )?(?:injur|hurt|harm|wound|casualt)[a-z]*",
    "no (?:injuries|injury|casualties|harm)",
    "(?:crew|all|everyone)[^.]{0,20}(?:safe|unharmed|uninjured)",
    "without injury",
  ].join("|"),
  "gi",
);

/*
 * La mort ne se dit pas d'une seule façon, et chaque tournure oubliée est un
 * mort qui disparaît de la carte. Le premier jet ne cherchait que « killed » :
 * il laissait de côté l'attaque du City of Poros (« KILLING at least nine
 * people »), les 23 marins du Cheung Son (« the MURDER of its crew »), les
 * corps repêchés (« BODIES WERE RECOVERED ») et les noyés jetés par-dessus
 * bord. 45 incidents mortels étaient rangés ailleurs.
 *
 * Certaines formes exigent leur contexte, sans quoi elles mentent :
 *   · « deaths OF » — sinon « the DEATH PENALTY » et « DEATH THREATS » ;
 *   · « WERE executed » — sinon « EXECUTED evasive maneuvers », la manœuvre
 *     d'évitement, de loin l'emploi le plus fréquent du mot ici ;
 *   · « BODY … recovered » — sinon « an able BODY seaman », « a steel BODY
 *     boat » et l'organisation ReCAAP, « anti-piracy BODY ».
 */
const REGLES_GRAVITE = [
  [
    3,
    new RegExp(
      [
        "\\b(?:killed|killing|died|dead|deceased|fatally|beheaded|slain|perished)\\b",
        "\\bmurder(?:ed|ing|s)?\\b",
        "\\bfatalit(?:y|ies)\\b",
        "\\bto death\\b", // hacked, beaten, shot to death
        "\\bdeaths? of\\b",
        "\\bdrown(?:ed|ing)\\b",
        "\\b(?:were|was|been|being) executed\\b",
        "\\bdid not survive\\b",
        "\\bbodies\\b",
        "\\bbod(?:y|ies)[^.]{0,30}(?:recovered|retrieved|found)",
        "\\blost (?:his|her|their) li(?:fe|ves)\\b",
      ].join("|"),
      "i",
    ),
  ],
  [
    2,
    /\b(?:kidnap|hostage|abduct|hijack|injur|wounded|stabbed|beaten|fired upon|opened fire|gunfire|rocket|rpg|grenade)/i,
  ],
  [1, /\b(?:board|stole|stolen|robbed|theft|ransack)/i],
];

/** -1 quand la source ne fournit aucun récit : on ne classe pas à l'aveugle. */
function graviter(description) {
  if (!description) return -1;
  // Le texte nettoyé ne sert QU'au classement : le récit affiché sur la fiche
  // reste celui de la NGA, mot pour mot.
  const net = description.replace(LEURRES, " ");
  for (const [niveau, motif] of REGLES_GRAVITE) {
    if (motif.test(net)) return niveau;
  }
  return 0;
}

/**
 * Transforme un enregistrement brut en incident exploitable, ou explique
 * pourquoi il est écarté.
 */
export function normaliser(brut) {
  const latitude = coordonnee(champ(brut, "latitude", "lat"), 90);
  const longitude = coordonnee(champ(brut, "longitude", "lon", "lng", "long"), 180);

  if (latitude === null || longitude === null) {
    return { rejet: "coordonnées absentes ou hors bornes" };
  }

  const date = dateNormalisee(champ(brut, "date", "dateOfOccurrence", "occurrenceDate"));

  return {
    incident: {
      reference: texte(champ(brut, "reference", "referenceNumber", "refNum")),
      date,
      annee: date ? Number(date.slice(0, 4)) : null,
      latitude: arrondir(latitude),
      longitude: arrondir(longitude),
      zone: texte(champ(brut, "navArea", "navarea", "geoLocation")),
      sousRegion: texte(champ(brut, "subreg", "subRegion", "subregion")),
      agresseur: texte(champ(brut, "hostility", "hostilityType", "aggressor")),
      navire: texte(champ(brut, "victim", "victimType", "vesselType")),
      description: texte(champ(brut, "description", "desc", "narrative")),
      // Classement de gravité, lu dans le récit et non ajouté à la source.
      gravite: graviter(texte(champ(brut, "description", "desc", "narrative"))),
      position: texte(champ(brut, "position")),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Écriture optimisée                                                  */
/* ------------------------------------------------------------------ */

/**
 * La sortie est scindée en deux fichiers, et c'est le cœur du budget de
 * chargement.
 *
 * Les descriptions représentent l'écrasante majorité du poids — plusieurs
 * mégaoctets de texte — alors que la carte n'en a besoin d'aucune pour
 * s'afficher. Les faire attendre au premier rendu, c'est plusieurs secondes
 * d'écran vide sur un téléphone en 4G, pour du texte que personne ne lit
 * avant d'avoir cliqué un point.
 *
 *   asam-carte.json        → tout ce qu'il faut pour dessiner et filtrer
 *   asam-descriptions.json → les récits, chargés juste après le premier rendu
 *
 * Le premier fichier est colonnaire et les libellés répétés (zone, agresseur,
 * type de navire) sont remplacés par un index vers un dictionnaire : les mêmes
 * quelques dizaines de chaînes reviennent des milliers de fois, les écrire
 * une seule fois divise le poids sans rien perdre.
 */
export function construireSortie(incidents, meta) {
  const dictionnaire = (extraire) => {
    const valeurs = [];
    const index = new Map();
    const codes = incidents.map((incident) => {
      const valeur = extraire(incident);
      if (valeur === "") return -1; // -1 : champ absent dans la source.
      if (!index.has(valeur)) {
        index.set(valeur, valeurs.length);
        valeurs.push(valeur);
      }
      return index.get(valeur);
    });
    return { valeurs, codes };
  };

  const zones = dictionnaire((i) => i.zone);
  const sousRegions = dictionnaire((i) => i.sousRegion);
  const agresseurs = dictionnaire((i) => i.agresseur);
  const navires = dictionnaire((i) => i.navire);

  const carte = {
    meta,
    // Dictionnaires : un libellé écrit une fois, référencé par son rang.
    dictionnaires: {
      zones: zones.valeurs,
      sousRegions: sousRegions.valeurs,
      agresseurs: agresseurs.valeurs,
      navires: navires.valeurs,
    },
    // Colonnes parallèles : l'incident n° i est la i-ème valeur de chacune.
    colonnes: {
      longitude: incidents.map((i) => i.longitude),
      latitude: incidents.map((i) => i.latitude),
      date: incidents.map((i) => i.date),
      zone: zones.codes,
      sousRegion: sousRegions.codes,
      agresseur: agresseurs.codes,
      navire: navires.codes,
      reference: incidents.map((i) => i.reference),
      gravite: incidents.map((i) => i.gravite),
    },
  };

  const descriptions = incidents.map((i) => i.description);

  return { carte, descriptions };
}

/* ------------------------------------------------------------------ */
/* Vérification croisée des positions                                  */
/* ------------------------------------------------------------------ */

/**
 * Confronte chaque position au récit du même enregistrement, applique les
 * corrections, et rend la liste de ce qui reste inutilisable.
 *
 * Toute la logique est dans `positions-verifier.mjs` ; ici on ne fait que
 * l'appeler et TOUT écrire dans le journal de construction. Ce journal est
 * le seul endroit où l'on peut vérifier, à la main et sur pièce, que rien
 * n'a été inventé : chaque ligne dit d'où vient la nouvelle position.
 */
function appliquerVerification(incidents) {
  const { corriges, ecartes } = verifierPositions(incidents);

  console.error("");
  console.error("═══ VÉRIFICATION DES POSITIONS ═══════════════════════════");
  console.error(`Positions corrigées d'après le récit : ${corriges.length}`);
  for (const k of corriges) {
    console.error(
      `  ${k.reference.padEnd(9)} ${k.avant[0]},${k.avant[1]} → ${k.apres[0]},${k.apres[1]}` +
        `  (le récit dit « ${k.lu} », ${k.ecartKm} km d'écart)`,
    );
  }
  console.error(`Incidents écartés de la carte        : ${ecartes.length}`);
  for (const e of ecartes) {
    console.error(`  ${e.reference.padEnd(9)} ${e.date}  ${e.position[0]},${e.position[1]}`);
    console.error(`      ${e.preuve}`);
    console.error(`      ${e.debut}`);
  }
  console.error("══════════════════════════════════════════════════════════");

  return {
    positionsCorrigees: corriges.map((k) => k.rang),
    positionsEcartees: ecartes.map((e) => e.rang),
  };
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

/**
 * Rejoue la vérification sur les fichiers déjà écrits, sans rien
 * retélécharger.
 *
 * Utile pour deux raisons : la NGA ne sert plus ASAM, et l'opération est
 * idempotente — une position déjà corrigée s'accorde désormais avec son
 * récit, donc plus rien ne bouge. On peut la relancer autant de fois qu'on
 * veut sans dériver.
 */
async function reverifier() {
  const fichierCarte = path.join(DOSSIER_SORTIE, "asam-carte.json");
  const fichierDescriptions = path.join(DOSSIER_SORTIE, "asam-descriptions.json");
  const carte = JSON.parse(await readFile(fichierCarte, "utf8"));
  const descriptions = JSON.parse(await readFile(fichierDescriptions, "utf8"));
  const col = carte.colonnes;

  const incidents = descriptions.map((description, i) => ({
    reference: col.reference[i],
    date: col.date[i],
    latitude: col.latitude[i],
    longitude: col.longitude[i],
    description,
  }));

  const verif = appliquerVerification(incidents);

  col.latitude = incidents.map((i) => i.latitude);
  col.longitude = incidents.map((i) => i.longitude);

  /*
   * Les corrections déjà appliquées sont CONSERVÉES.
   *
   * C'est ce qui rend l'opération rejouable : au deuxième passage, une
   * position corrigée s'accorde avec son récit, donc plus rien ne bouge —
   * et sans cette réunion, la liste des corrections repartirait à zéro
   * alors que les points, eux, resteraient corrigés.
   */
  const dejaCorriges = carte.meta.positionsCorrigees ?? [];
  Object.assign(carte.meta, {
    positionsCorrigees: [...new Set([...dejaCorriges, ...verif.positionsCorrigees])].sort(
      (a, b) => a - b,
    ),
    positionsEcartees: verif.positionsEcartees,
    total: incidents.length - verif.positionsEcartees.length,
    recus: incidents.length,
  });

  await writeFile(fichierCarte, JSON.stringify(carte), "utf8");
  console.error(`\nRéécrit : ${path.relative(RACINE, fichierCarte)}`);
}

async function principal() {
  const options = new Set(process.argv.slice(2));
  const seulementChiffres = options.has("--chiffres");
  const horsLigne = options.has("--hors-ligne");

  if (options.has("--reverifier")) return reverifier();

  let enregistrements;
  let source;

  if (horsLigne && existsSync(CACHE_BRUT)) {
    console.error(`→ cache local : ${path.relative(RACINE, CACHE_BRUT)}`);
    const cache = JSON.parse(await readFile(CACHE_BRUT, "utf8"));
    enregistrements = cache.enregistrements;
    source = cache.source;
  } else {
    const retenu = await recupererSource();
    enregistrements = retenu.enregistrements;
    source = retenu.source;

    // Le brut est conservé : il permet de rejouer la normalisation sans
    // retélécharger, et de comparer deux collectes dans le temps.
    await mkdir(DOSSIER_CACHE, { recursive: true });
    await writeFile(CACHE_BRUT, JSON.stringify({ source, enregistrements }), "utf8");
  }

  /* --- Normalisation et tri ------------------------------------------ */

  const incidents = [];
  const rejets = new Map();

  for (const brut of enregistrements) {
    const resultat = normaliser(brut);
    if (resultat.rejet) {
      rejets.set(resultat.rejet, (rejets.get(resultat.rejet) ?? 0) + 1);
      continue;
    }
    incidents.push(resultat.incident);
  }

  // Ordre chronologique : le curseur temporel et l'animation de lecture
  // parcourent ensuite les incidents par tranches contiguës.
  incidents.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // La vérification vient APRÈS le tri : elle rend des rangs, et ces rangs
  // doivent être ceux du fichier final, pas ceux d'un ordre intermédiaire.
  const verif = appliquerVerification(incidents);

  const datees = incidents.filter((i) => i.date);
  const plusAncien = datees.length ? datees[0].date : "";
  const plusRecent = datees.length ? datees[datees.length - 1].date : "";

  /* --- Diagnostic ---------------------------------------------------- */

  const compter = (cle) => {
    const paliers = new Map();
    for (const incident of incidents) {
      const valeur = incident[cle] || "(vide)";
      paliers.set(valeur, (paliers.get(valeur) ?? 0) + 1);
    }
    return [...paliers.entries()].sort((a, b) => b[1] - a[1]);
  };

  const nulIle = incidents.filter((i) => i.latitude === 0 && i.longitude === 0).length;
  const sansDate = incidents.length - datees.length;
  const sansDescription = incidents.filter((i) => !i.description).length;

  console.error("");
  console.error("═══ BASE ASAM — NGA ══════════════════════════════════════");
  console.error(`Source            : ${source.libelle}`);
  console.error(`Adresse           : ${source.url}`);
  if (source.capture) {
    console.error(`Capture du        : ${source.capture}  ← la base s'arrête là`);
  }
  console.error(`Reçus             : ${enregistrements.length}`);
  for (const [motif, nombre] of rejets) {
    console.error(`Écartés           : ${nombre} (${motif})`);
  }
  console.error(`Retenus           : ${incidents.length}`);
  console.error(`Plus ancien       : ${plusAncien || "—"}`);
  console.error(`Plus récent       : ${plusRecent || "—"}`);
  console.error("");
  console.error(`Sans date         : ${sansDate}`);
  console.error(`Sans description  : ${sansDescription}`);
  console.error(`En 0°N 0°E        : ${nulIle}`);
  console.error("");
  console.error("Types d'agresseur (10 premiers) :");
  for (const [valeur, nombre] of compter("agresseur").slice(0, 10)) {
    console.error(`  ${String(nombre).padStart(6)}  ${valeur}`);
  }
  console.error("Types de navire (10 premiers) :");
  for (const [valeur, nombre] of compter("navire").slice(0, 10)) {
    console.error(`  ${String(nombre).padStart(6)}  ${valeur}`);
  }
  console.error("Zones :");
  for (const [valeur, nombre] of compter("zone")) {
    console.error(`  ${String(nombre).padStart(6)}  ${valeur}`);
  }
  console.error("══════════════════════════════════════════════════════════");

  if (seulementChiffres) return;

  /* --- Écriture ------------------------------------------------------ */

  const { carte, descriptions } = construireSortie(incidents, {
    source: "NGA — Anti-Shipping Activity Messages (ASAM)",
    sourceUrl: "https://msi.nga.mil/Piracy",
    apiUrl: source.url,
    // Renseigné quand les données viennent d'une capture archivée : la carte
    // doit pouvoir dire jusqu'à quelle date elle fait foi, plutôt que de
    // laisser croire qu'elle est à jour.
    captureDu: source.capture ?? null,
    genereLe: new Date().toISOString().slice(0, 10),
    // `total` est ce que la carte peut MONTRER ; `recus` ce que la source
    // fournit. Les deux diffèrent des incidents dont la position est
    // contredite par leur propre récit, et il faut que les deux soient
    // lisibles pour que l'écart soit vérifiable.
    total: incidents.length - verif.positionsEcartees.length,
    recus: incidents.length,
    ...verif,
    ecartes: [...rejets.entries()].map(([motif, nombre]) => ({ motif, nombre })),
    plusAncien,
    plusRecent,
  });

  await mkdir(DOSSIER_SORTIE, { recursive: true });

  const fichierCarte = path.join(DOSSIER_SORTIE, "asam-carte.json");
  const fichierDescriptions = path.join(DOSSIER_SORTIE, "asam-descriptions.json");

  await writeFile(fichierCarte, JSON.stringify(carte), "utf8");
  await writeFile(fichierDescriptions, JSON.stringify(descriptions), "utf8");

  const poids = async (fichier) =>
    `${((await readFile(fichier)).byteLength / 1024).toFixed(0)} Ko`;

  console.error("");
  console.error(`Écrit : ${path.relative(RACINE, fichierCarte)} (${await poids(fichierCarte)})`);
  console.error(
    `Écrit : ${path.relative(RACINE, fichierDescriptions)} (${await poids(fichierDescriptions)})`,
  );
}

/*
 * Ne se lance qu'appelé directement. Les fonctions ci-dessus sont exportées
 * pour être vérifiables une par une, et un simple `import` ne doit pas
 * déclencher un téléchargement de plusieurs mégaoctets.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  principal().catch((erreur) => {
    console.error(`\nÉchec : ${erreur.message}`);
    process.exitCode = 1;
  });
}
