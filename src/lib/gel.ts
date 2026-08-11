/**
 * Le gel de série — un jour manqué ne détruit pas trois mois de régularité.
 *
 * C'est la pièce qui manquait le plus. Une série qui repart à zéro au premier
 * jour raté est une série qu'on abandonne : après quarante jours tenus, perdre
 * le compteur pour un déplacement ou une grippe pousse à ne pas rouvrir
 * l'application du tout. Le gel transforme cet accident en simple encoche.
 *
 * Les règles, tenues courtes pour rester compréhensibles sans les lire :
 *
 * - on gagne UN gel tous les sept jours de série, trois en réserve au maximum ;
 * - il se pose TOUT SEUL sur le jour manqué, mais seulement quand on revient :
 *   revenir est la condition, sinon un OS abandonné consommerait ses trois
 *   gels dans son sommeil et afficherait une série qui ne veut plus rien dire ;
 * - il couvre UN jour. Deux jours manqués d'affilée cassent la série, et c'est
 *   voulu : au-delà, ce n'est plus un accident.
 *
 * Pur et sans base : la couche serveur lit, appelle, et n'écrit que si quelque
 * chose a bougé.
 */

export type Gels = {
  /** Gels en réserve. */
  dispo: number;
  /** Les jours (AAAA-MM-JJ) déjà couverts par un gel posé. */
  poses: string[];
  /**
   * La valeur de série à laquelle le dernier gel a été crédité.
   *
   * Sans elle, chaque lecture de la page recréditerait un gel tant que la
   * série reste à sept — trois gels gagnés dans la même minute.
   */
  dernier: number;
};

export const GELS_MAX = 3;
/** Un gel tous les sept jours de série. */
export const GELS_TOUS_LES = 7;
/** Au-delà, on ne garde pas la trace : la série est de toute façon cassée. */
const POSES_GARDEES = 120;

export const GELS_VIDES: Gels = { dispo: 0, poses: [], dernier: 0 };

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Revalide ce qui vient de la base — on ne fait jamais confiance au stocké. */
export function bornerGels(brut: unknown): Gels {
  const g = (brut ?? {}) as Partial<Gels>;
  const n = Number(g.dispo);
  const d = Number(g.dernier);
  return {
    dispo: Number.isFinite(n) ? Math.max(0, Math.min(GELS_MAX, Math.floor(n))) : 0,
    poses: (Array.isArray(g.poses) ? g.poses : [])
      .map((x) => String(x))
      .filter((x) => JOUR.test(x))
      .slice(-POSES_GARDEES),
    dernier: Number.isFinite(d) ? Math.max(0, Math.floor(d)) : 0,
  };
}

/** Avance ou recule d'un nombre de jours, en UTC pour ne pas sauter d'heure d'été. */
function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function serieJusqua(couverts: Set<string>, aujourdhui: string): number {
  let curseur = couverts.has(aujourdhui) ? aujourdhui : decaler(aujourdhui, -1);
  let serie = 0;
  while (couverts.has(curseur)) {
    serie += 1;
    curseur = decaler(curseur, -1);
  }
  return serie;
}

function meilleureSerieDe(couverts: Set<string>): number {
  if (couverts.size === 0) return 0;
  const tries = [...couverts].sort();
  let meilleure = 1;
  let courante = 1;
  for (let i = 1; i < tries.length; i++) {
    courante = tries[i] === decaler(tries[i - 1], 1) ? courante + 1 : 1;
    if (courante > meilleure) meilleure = courante;
  }
  return meilleure;
}

export type ResultatGels = {
  serie: number;
  meilleureSerie: number;
  /** Vrai si la journée en cours est déjà comptée dans la série. */
  aujourdhuiCompte: boolean;
  gels: Gels;
  /** Vrai si `gels` a changé et doit être réécrit. */
  change: boolean;
  /** Le jour qu'un gel vient de sauver, pour pouvoir le dire à l'écran. */
  sauve: string | null;
};

/**
 * La série, gels compris — et les gels mis à jour.
 *
 * `remplis` ne contient que les jours réellement tenus ; les jours gelés
 * s'ajoutent par-dessus pour le calcul, sans jamais être confondus avec eux.
 */
export function calculerSerie(
  remplis: ReadonlySet<string>,
  aujourdhui: string,
  gelsBruts: unknown,
): ResultatGels {
  const gels = bornerGels(gelsBruts);
  let { dispo, dernier } = gels;
  let poses = gels.poses;
  let change = false;
  let sauve: string | null = null;

  const couverts = new Set<string>([...remplis, ...poses]);

  /*
   * La pose, et sa condition : être revenu aujourd'hui.
   *
   * On ne gèle pas un jour tant que rien ne prouve qu'on est de retour. Un OS
   * laissé de côté trois semaines épuiserait sinon ses gels tout seul, et
   * afficherait au retour une série de quarante jours dont trois n'ont jamais
   * été vécus — un compteur auquel on ne croit plus.
   */
  const hier = decaler(aujourdhui, -1);
  if (
    remplis.has(aujourdhui) &&
    !couverts.has(hier) &&
    dispo > 0 &&
    couverts.has(decaler(aujourdhui, -2))
  ) {
    poses = [...poses, hier].slice(-POSES_GARDEES);
    couverts.add(hier);
    dispo -= 1;
    sauve = hier;
    change = true;
  }

  const serie = serieJusqua(couverts, aujourdhui);
  const meilleureSerie = meilleureSerieDe(couverts);

  /*
   * Le crédit. `dernier` est remis à zéro quand la série a reculé : après une
   * série de trente jours cassée, il ne faut pas devoir remonter à trente-cinq
   * pour regagner un gel.
   */
  if (serie < dernier) {
    dernier = 0;
    change = true;
  }
  if (
    serie >= GELS_TOUS_LES &&
    Math.floor(serie / GELS_TOUS_LES) > Math.floor(dernier / GELS_TOUS_LES)
  ) {
    dernier = serie;
    if (dispo < GELS_MAX) dispo += 1;
    change = true;
  }

  return {
    serie,
    meilleureSerie,
    aujourdhuiCompte: couverts.has(aujourdhui),
    gels: { dispo, poses, dernier },
    change,
    sauve,
  };
}
