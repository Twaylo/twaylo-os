/**
 * Vérification croisée des positions.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Un lecteur a cliqué sur un bateau planté au milieu du Pacifique, près des
 * Mariannes, et a lu ceci sur la fiche :
 *
 *   « GULF OF ADEN: Two Yemeni fishing vessels, (FALLUJAH) and (KANA),
 *     reportedly hijacked 10 Dec 08 while underway from the Mait area near
 *     the port of Aden. »
 *
 * Golfe d'Aden, port d'Aden, garde-côtes yéménites — et un point à dix mille
 * kilomètres de là. Ce n'est pas une erreur de lecture de notre côté : le
 * champ numérique de la NGA porte bien 149.4333 d'est là où son propre récit
 * dit 049. Un chiffre a été frappé de travers en 2008, et personne ne l'a vu
 * depuis.
 *
 * CE QUE FAIT CE MODULE, ET CE QU'IL NE FAIT PAS
 *
 * Il ne géocode rien, ne devine rien, n'ajoute aucune donnée extérieure. Il
 * exploite le fait qu'un enregistrement ASAM dit souvent DEUX FOIS où
 * l'attaque a eu lieu :
 *
 *   1. dans ses champs numériques `latitude` / `longitude` ;
 *   2. dans son propre récit, en degrés-minutes — « robbed at position
 *      22-15N 091-44E » — ce qui est le cas de 4 655 récits sur 8 897 ;
 *   3. et presque toujours par le lieu qui ouvre le récit : « NIGERIA: … ».
 *
 * Quand ces témoignages se contredisent, on tranche avec eux et rien
 * d'autre :
 *
 *   · le point de référence d'un lieu, c'est la MÉDIANE des positions de
 *     tous les incidents qui portent ce même lieu en tête de récit. Aucune
 *     frontière n'est dessinée à la main. Si 522 récits sur 523 étiquetés
 *     « GULF OF ADEN » se tiennent dans un mouchoir de poche, le 523e est
 *     désigné par ses pairs, pas par nous ;
 *   · si le récit donne une position et qu'elle contredit le champ
 *     numérique, on garde celle des deux qui tombe le plus près de ce point
 *     de référence — et seulement si l'écart est net ;
 *   · si le point final reste manifestement ailleurs que ce que dit son
 *     propre récit, l'incident est ÉCARTÉ de la carte et compté. Un point
 *     faux vaut moins qu'un point absent : c'est déjà la règle appliquée
 *     aux enregistrements sans coordonnées.
 *
 * Les récits, eux, ne sont jamais retouchés : ils restent affichés mot pour
 * mot, y compris quand ce sont eux qui se trompent.
 */

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

/** Distance approchée entre deux points du globe, en kilomètres. */
export function km(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  let dLon = Math.abs(bLon - aLon);
  if (dLon > 180) dLon = 360 - dLon; // l'antiméridien n'est pas un mur
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(dLon) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const mediane = (valeurs) => {
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)];
};

/**
 * La position écrite dans le récit, en degrés-minutes.
 *
 * Formats rencontrés dans la base, tous acceptés :
 *   « 22-15N 091-44E »   « 01-06.5N, 103-30.4E »   « 13:07N 047:27E »
 *   « 01:20N-049:00E »   « 04-43N 003-30W »
 *
 * Les minutes au-delà de 59 signalent une saisie abîmée (« 03-68W » se lit
 * dans la base) : on préfère alors n'avoir rien lu du tout.
 */
export function positionDuRecit(recit) {
  const m = (recit || "").match(
    /\b(\d{1,2})[-:](\d{1,2}(?:\.\d+)?)\s*([NS])\s*[,\-\/ ]{1,3}(\d{1,3})[-:](\d{1,2}(?:\.\d+)?)\s*([EW])\b/i,
  );
  if (!m) return null;
  const [, dLat, mLat, hLat, dLon, mLon, hLon] = m;
  if (Number(mLat) >= 60 || Number(mLon) >= 60) return null;
  const lat = (Number(dLat) + Number(mLat) / 60) * (hLat.toUpperCase() === "S" ? -1 : 1);
  const lon = (Number(dLon) + Number(mLon) / 60) * (hLon.toUpperCase() === "W" ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, brut: m[0] };
}

/**
 * Le lieu qui ouvre le récit : « GULF OF ADEN: … » → « GULF OF ADEN ».
 *
 * Deux normalisations, et deux seulement, parce qu'elles rassemblent des
 * libellés qui désignent le même endroit sans rien confondre :
 * « CHITTAGONG ANCHORAGE, BANGLADESH » compte avec « BANGLADESH », et
 * « INDONESIA-JAVA » avec « INDONESIA ».
 */
export function lieuDuRecit(recit) {
  const m = (recit || "").match(/^([A-Z][A-Z0-9 ,.'\-\/()]{2,60}?):/);
  if (!m) return null;
  let lieu = m[1].trim();
  if (lieu.includes(",")) lieu = lieu.split(",").pop().trim();
  lieu = lieu.replace(/[.\-]\s*(JAVA|SUMATRA|SUMATERA|SABAH|KALIMANTAN|SULAWESI|BATAM)$/i, "").trim();
  return lieu || null;
}

/* ------------------------------------------------------------------ */
/* Seuils                                                              */
/* ------------------------------------------------------------------ */

/*
 * Tous les seuils sont réunis ici, et volontairement prudents : dans le
 * doute, on ne touche à rien. Une correction inutile est un mensonge de
 * plus, alors qu'un point resté approximatif reste ce que la source dit.
 */
const SEUILS = {
  /** En deçà, les deux positions racontent la même chose (arrondis, marge). */
  desaccord: 25,
  /** Un lieu doit compter au moins cela d'incidents pour servir d'arbitre. */
  lieuMini: 5,
  /** Et le gagnant doit l'emporter franchement, pas d'un cheveu. */
  margeArbitrage: 100,
  /** Un désaccord au-delà duquel il faut de toute façon trancher. */
  desaccordFranc: 500,
  /** Écart au lieu, au-delà duquel un point est suspect : le plus grand des deux. */
  suspectKm: 600,
  suspectFacteur: 3,
  /** Voisins à examiner autour d'un point suspect, et leur rayon. */
  voisinsRayon: 150,
  voisinsMini: 10,
  /** Part maximale de voisins partageant le lieu du point examiné (1/5). */
  voisinsMemeLieuMax: 5,
  /** Absurde : si loin de son lieu que rien ne l'explique. */
  absurdeKm: 3000,
  /** …à condition que le lieu soit lui-même resserré. */
  absurdeEtalementMax: 1100,
};

/* ------------------------------------------------------------------ */
/* Vérification                                                        */
/* ------------------------------------------------------------------ */

/**
 * Passe la collection au crible.
 *
 * `incidents` : tableau d'objets portant au moins `latitude`, `longitude`
 * et `description`. Les positions corrigées sont écrites en place.
 *
 * Renvoie le journal complet de ce qui a été fait, pour pouvoir le relire,
 * le publier, et le contredire.
 */
export function verifierPositions(incidents) {
  /* --- 1. Les lieux et leur point de référence ----------------------- */

  const parLieu = new Map();
  const lieux = incidents.map((i) => lieuDuRecit(i.description));
  lieux.forEach((lieu, n) => {
    if (!lieu) return;
    if (!parLieu.has(lieu)) parLieu.set(lieu, []);
    parLieu.get(lieu).push(n);
  });

  const reperes = new Map();
  for (const [lieu, rangs] of parLieu) {
    if (rangs.length < SEUILS.lieuMini) continue;
    const lat = mediane(rangs.map((n) => incidents[n].latitude));
    const lon = mediane(rangs.map((n) => incidents[n].longitude));
    const distances = rangs
      .map((n) => km(lat, lon, incidents[n].latitude, incidents[n].longitude))
      .sort((a, b) => a - b);
    reperes.set(lieu, {
      lat,
      lon,
      nombre: rangs.length,
      // L'étalement habituel du lieu : neuf incidents sur dix tiennent dedans.
      etalement: distances[Math.floor(distances.length * 0.9)],
    });
  }

  /* --- 2. Le récit contre le champ numérique ------------------------- */

  const corriges = [];
  incidents.forEach((incident, n) => {
    const dite = positionDuRecit(incident.description);
    if (!dite) return;
    const ecart = km(incident.latitude, incident.longitude, dite.lat, dite.lon);
    if (ecart <= SEUILS.desaccord) return;

    const repere = reperes.get(lieux[n]);
    if (!repere) return; // aucun arbitre : on ne touche pas au champ source

    const versChamp = km(repere.lat, repere.lon, incident.latitude, incident.longitude);
    const versRecit = km(repere.lat, repere.lon, dite.lat, dite.lon);
    if (versChamp - versRecit < SEUILS.margeArbitrage) return; // pas assez net

    /*
     * Être « un peu plus près du repère » ne suffit pas à déclasser le champ
     * de la source. Sur un lieu vaste — INDIA, INDONESIA — deux points
     * distants de deux cents kilomètres sont tous les deux plausibles, et
     * l'arbitrage se jouerait à pile ou face. Éprouvé sur la base : sans ce
     * garde-fou, deux corrections sur seize déplaçaient un point JUSTE
     * (l'incident de Cochin, celui du mouillage de Lagos).
     *
     * On exige donc l'une des deux évidences :
     *   · le champ numérique est à plus du double de la distance du récit ;
     *   · ou le désaccord dépasse cinq cents kilomètres, et il faut bien
     *     trancher.
     */
    const netDeLoin = versChamp > 2 * versRecit + SEUILS.margeArbitrage;
    if (!netDeLoin && ecart <= SEUILS.desaccordFranc) return;

    corriges.push({
      rang: n,
      reference: incident.reference,
      avant: [incident.latitude, incident.longitude],
      apres: [Number(dite.lat.toFixed(4)), Number(dite.lon.toFixed(4))],
      lu: dite.brut,
      lieu: lieux[n],
      ecartKm: Math.round(ecart),
    });
    incident.latitude = Number(dite.lat.toFixed(4));
    incident.longitude = Number(dite.lon.toFixed(4));
  });

  /* --- 3. Ce qui reste contredit par son propre récit ----------------- */

  /*
   * Deux preuves possibles, et il en suffit d'une :
   *
   *   A. le voisinage. Le point tombe au milieu d'un groupe fourni
   *      d'incidents qui, tous, nomment un AUTRE lieu. Les cinq attaques de
   *      Chittagong posées dans la rade de Cochin sont démasquées comme
   *      cela : elles ont des dizaines de voisins, tous indiens ;
   *   B. la distance pure. Le point est à plus de trois mille kilomètres du
   *      repère d'un lieu par ailleurs resserré. C'est le cas du golfe
   *      d'Aden atterri près des Mariannes.
   *
   * La condition A exige DIX voisins : un point isolé au large, même loin de
   * son repère, ne prouve rien — un navire attaqué « au large du Mexique »
   * peut l'être en Basse-Californie pendant que la plupart des incidents
   * mexicains sont côté Caraïbes. Elle tolère aussi une poignée de voisins
   * du même lieu : les cinq abordages de Chittagong ont été posés au même
   * mauvais endroit, et se tiendraient mutuellement chaud si l'on exigeait
   * zéro. Un cinquième du voisinage, pas davantage.
   *
   * ET SURTOUT, l'exemption qui compte : un enregistrement dont le RÉCIT
   * répète la position du champ numérique n'est jamais écarté. Le désaccord
   * ne porte alors plus sur le lieu de l'attaque mais sur l'étiquette qui
   * ouvre le récit — la NGA range volontiers sous « NIGERIA » un abordage
   * survenu à Freetown ou au large d'Abidjan. L'étiquette est approximative,
   * la position ne l'est pas. Éprouvé : sans cette exemption, six incidents
   * correctement placés partaient à la poubelle.
   */
  const ecartes = [];
  incidents.forEach((incident, n) => {
    const repere = reperes.get(lieux[n]);
    if (!repere) return;
    const distance = km(repere.lat, repere.lon, incident.latitude, incident.longitude);
    const suspect = Math.max(SEUILS.suspectKm, SEUILS.suspectFacteur * repere.etalement);
    if (distance <= suspect) return;

    const dite = positionDuRecit(incident.description);
    if (dite && km(incident.latitude, incident.longitude, dite.lat, dite.lon) <= SEUILS.desaccord) {
      return; // le récit confirme le point : c'est l'étiquette qui est large
    }

    let voisins = 0;
    let memeLieu = 0;
    for (let m = 0; m < incidents.length; m += 1) {
      if (m === n || !lieux[m]) continue;
      if (km(incident.latitude, incident.longitude, incidents[m].latitude, incidents[m].longitude) >
        SEUILS.voisinsRayon)
        continue;
      voisins += 1;
      if (lieux[m] === lieux[n]) memeLieu += 1;
    }

    const preuveA =
      voisins >= SEUILS.voisinsMini && memeLieu * SEUILS.voisinsMemeLieuMax < voisins;
    const preuveB =
      distance > SEUILS.absurdeKm && repere.etalement <= SEUILS.absurdeEtalementMax;
    if (!preuveA && !preuveB) return;

    ecartes.push({
      rang: n,
      reference: incident.reference,
      date: incident.date,
      lieu: lieux[n],
      position: [incident.latitude, incident.longitude],
      repere: [Number(repere.lat.toFixed(2)), Number(repere.lon.toFixed(2))],
      distanceKm: Math.round(distance),
      preuve: preuveA
        ? `${voisins} incidents voisins, dont ${memeLieu} seulement portant « ${lieux[n]} »`
        : `${Math.round(distance)} km du repère de ${lieux[n]}`,
      debut: (incident.description || "").replace(/\s+/g, " ").slice(0, 120),
    });
  });

  return { corriges, ecartes, reperes };
}
