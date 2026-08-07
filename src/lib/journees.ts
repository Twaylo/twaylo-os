/**
 * Journée type — le déroulé idéal d'une journée, en blocs horaires.
 *
 * Il n'y en a pas UNE mais PLUSIEURS : la journée de Twaylo à la maison n'a
 * rien à voir avec une journée de tournage en déplacement. Chaque modèle se
 * duplique et se modifie en deux gestes — c'est fait pour évoluer souvent.
 *
 * Client et serveur partagent ce module ; l'accès base vit dans journees-db.
 */

export type CategorieBloc =
  | "creation"
  | "tournage"
  | "corps"
  | "business"
  | "repos"
  | "autre";

export const CATEGORIES_BLOC: Record<CategorieBloc, { nom: string; couleur: string }> = {
  creation: { nom: "Création", couleur: "var(--color-cya)" },
  tournage: { nom: "Tournage", couleur: "var(--color-mag)" },
  corps: { nom: "Corps", couleur: "var(--color-ver)" },
  business: { nom: "Business", couleur: "var(--color-amb)" },
  repos: { nom: "Repos", couleur: "var(--color-vio)" },
  autre: { nom: "Autre", couleur: "rgba(255,255,255,0.45)" },
};

export type BlocJournee = {
  id: string;
  /** Heure HH:MM. */
  debut: string;
  /** Heure HH:MM — vide : le bloc court jusqu'au suivant. */
  fin: string;
  titre: string;
  categorie: CategorieBloc;
  /**
   * L'habitude liée : cocher le bloc coche AUSSI cette habitude — faire son
   * sport du matin ne doit se noter qu'une fois. Vide : pas de lien.
   */
  habitude: string;
  /** L'option cochée sur l'habitude (« Écriture » sur Session créative). */
  habitudeOption: string;
};

export type JourneeType = {
  id: string;
  nom: string;
  blocs: BlocJournee[];
};

export type JourneesConfig = {
  liste: JourneeType[];
  /** L'identifiant de la journée affichée par défaut. */
  active: string;
};

/**
 * Les deux modèles de départ — le déroulé RÉEL de Twaylo, dicté par lui :
 * sport au réveil, scripts des shorts, rec + envoi au monteur (maps,
 * globaux, armée, news), formats longs et tâches annexes, un passage sur
 * Momentum / Twaylo OS, et le soir la publication des shorts reçus.
 * Ce sont ses immuables : ils reviennent chaque jour tant qu'il ne les
 * change pas lui-même.
 */
export const JOURNEES_DEFAUT: JourneesConfig = {
  active: "maison",
  liste: [
    {
      id: "maison",
      nom: "À la maison",
      blocs: [
        { id: "m1", debut: "07:00", fin: "08:00", titre: "Réveil + sport (run ou Seven)", categorie: "corps", habitude: "sport", habitudeOption: "" },
        { id: "m2", debut: "08:00", fin: "10:00", titre: "Script les shorts du jour", categorie: "creation", habitude: "creatif", habitudeOption: "Écriture" },
        { id: "m3", debut: "10:00", fin: "12:00", titre: "Rec les shorts + envoi au monteur (maps, globaux, armée, news)", categorie: "tournage", habitude: "creatif", habitudeOption: "Tournage" },
        { id: "m4", debut: "12:00", fin: "13:30", titre: "Repas + marche", categorie: "repos", habitude: "", habitudeOption: "" },
        { id: "m5", debut: "13:30", fin: "17:00", titre: "Tâches annexes + scripts format long", categorie: "creation", habitude: "", habitudeOption: "" },
        { id: "m6", debut: "17:00", fin: "18:00", titre: "Passage Momentum + Twaylo OS", categorie: "business", habitude: "", habitudeOption: "" },
        { id: "m7", debut: "20:00", fin: "", titre: "Poster les shorts reçus du monteur", categorie: "business", habitude: "", habitudeOption: "" },
      ],
    },
    {
      id: "deplacement",
      nom: "En déplacement",
      blocs: [
        { id: "d1", debut: "07:30", fin: "08:30", titre: "Réveil + sport (run ou Seven)", categorie: "corps", habitude: "sport", habitudeOption: "" },
        { id: "d2", debut: "08:30", fin: "10:30", titre: "Script les shorts du jour", categorie: "creation", habitude: "creatif", habitudeOption: "Écriture" },
        { id: "d3", debut: "10:30", fin: "12:30", titre: "Rec les shorts + envoi au monteur (maps, globaux, armée, news)", categorie: "tournage", habitude: "creatif", habitudeOption: "Tournage" },
        { id: "d4", debut: "12:30", fin: "14:00", titre: "Repas", categorie: "repos", habitude: "", habitudeOption: "" },
        { id: "d5", debut: "14:00", fin: "17:00", titre: "Tâches annexes + scripts format long", categorie: "creation", habitude: "", habitudeOption: "" },
        { id: "d6", debut: "17:00", fin: "18:00", titre: "Passage Momentum + Twaylo OS", categorie: "business", habitude: "", habitudeOption: "" },
        { id: "d7", debut: "20:00", fin: "", titre: "Poster les shorts reçus du monteur", categorie: "business", habitude: "", habitudeOption: "" },
      ],
    },
  ],
};

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function texte(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

/** Revalide la configuration entière — jamais de données brutes en base. */
export function bornerJournees(brut: Partial<JourneesConfig> | null | undefined): JourneesConfig {
  const b = brut && typeof brut === "object" ? brut : {};

  const liste: JourneeType[] = (Array.isArray(b.liste) ? b.liste : [])
    .slice(0, 12)
    .map((j) => ({
      id: texte((j as JourneeType).id, 40),
      nom: texte((j as JourneeType).nom, 40),
      blocs: (Array.isArray((j as JourneeType).blocs) ? (j as JourneeType).blocs : [])
        .slice(0, 24)
        .map((bl) => ({
          id: texte((bl as BlocJournee).id, 40),
          debut: HEURE.test(String((bl as BlocJournee).debut)) ? (bl as BlocJournee).debut : "08:00",
          fin: HEURE.test(String((bl as BlocJournee).fin)) ? (bl as BlocJournee).fin : "",
          titre: texte((bl as BlocJournee).titre, 80),
          categorie:
            // `Object.hasOwn` : `in` accepterait « toString », hérité du
            // prototype, et le bloc n'aurait plus de couleur ni de libellé.
            Object.hasOwn(CATEGORIES_BLOC, (bl as BlocJournee).categorie)
              ? (bl as BlocJournee).categorie
              : "autre",
          habitude: texte((bl as BlocJournee).habitude, 40),
          habitudeOption: texte((bl as BlocJournee).habitudeOption, 40),
        }))
        /*
         * Un intitulé vide ne supprime PAS le bloc.
         *
         * Le champ d'édition écrit à chaque frappe : effacer le texte pour le
         * réécrire faisait disparaître le bloc en base, sans que l'écran le
         * montre — il revenait manquant au rechargement suivant. Seul
         * l'identifiant est requis ; l'affichage sait combler un titre vide.
         */
        .filter((bl) => bl.id)
        .sort((a, z) => a.debut.localeCompare(z.debut)),
    }))
    .filter((j) => j.id && j.nom);

  if (liste.length === 0) return JOURNEES_DEFAUT;

  const active = liste.some((j) => j.id === b.active) ? String(b.active) : liste[0].id;
  return { liste, active };
}

/**
 * Un identifiant de bloc libre dans TOUTE la configuration, pas seulement
 * dans le modèle courant.
 *
 * Les coches du jour sont une liste plate d'identifiants, partagée par tous
 * les modèles. Numéroter les blocs modèle par modèle donnait deux « b0 » —
 * un à la maison, un en déplacement — et cocher l'un cochait l'autre. Le
 * compteur balaie donc l'ensemble.
 */
export function idBlocLibre(config: JourneesConfig): string {
  const pris = new Set(config.liste.flatMap((j) => j.blocs.map((b) => b.id)));
  let n = 0;
  while (pris.has(`b${n}`)) n++;
  return `b${n}`;
}

/**
 * Le bloc en cours à l'heure donnée (HH:MM) : le dernier commencé, s'il n'est
 * pas déjà fini. Un bloc sans fin court jusqu'au début du suivant.
 */
export function blocEnCours(blocs: BlocJournee[], heure: string): string | null {
  let courant: string | null = null;
  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i];
    if (b.debut > heure) break;
    const fin = b.fin || blocs[i + 1]?.debut || "24:00";
    courant = heure < fin ? b.id : null;
  }
  return courant;
}
