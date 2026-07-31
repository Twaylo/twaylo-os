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

/** Les deux modèles de départ — la maison, et le terrain. */
export const JOURNEES_DEFAUT: JourneesConfig = {
  active: "maison",
  liste: [
    {
      id: "maison",
      nom: "À la maison",
      blocs: [
        { id: "m1", debut: "07:00", fin: "08:00", titre: "Réveil + routine", categorie: "corps" },
        { id: "m2", debut: "08:00", fin: "12:00", titre: "Session créative — scripts, écriture", categorie: "creation" },
        { id: "m3", debut: "12:00", fin: "13:30", titre: "Repas + marche", categorie: "repos" },
        { id: "m4", debut: "13:30", fin: "17:00", titre: "Tournage / montage", categorie: "tournage" },
        { id: "m5", debut: "17:00", fin: "18:30", titre: "Sport", categorie: "corps" },
        { id: "m6", debut: "18:30", fin: "20:00", titre: "Communauté + veille", categorie: "business" },
        { id: "m7", debut: "20:00", fin: "", titre: "Libre", categorie: "repos" },
      ],
    },
    {
      id: "deplacement",
      nom: "En déplacement",
      blocs: [
        { id: "d1", debut: "07:30", fin: "08:30", titre: "Réveil + point du jour", categorie: "corps" },
        { id: "d2", debut: "08:30", fin: "12:30", titre: "Tournage terrain", categorie: "tournage" },
        { id: "d3", debut: "12:30", fin: "14:00", titre: "Repas local", categorie: "repos" },
        { id: "d4", debut: "14:00", fin: "18:00", titre: "Tournage / repérages", categorie: "tournage" },
        { id: "d5", debut: "18:00", fin: "20:00", titre: "Tri des rushs + sauvegardes", categorie: "creation" },
        { id: "d6", debut: "20:00", fin: "", titre: "Notes du jour + communauté", categorie: "business" },
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
            (bl as BlocJournee).categorie in CATEGORIES_BLOC
              ? (bl as BlocJournee).categorie
              : "autre",
        }))
        .filter((bl) => bl.id && bl.titre)
        .sort((a, z) => a.debut.localeCompare(z.debut)),
    }))
    .filter((j) => j.id && j.nom);

  if (liste.length === 0) return JOURNEES_DEFAUT;

  const active = liste.some((j) => j.id === b.active) ? String(b.active) : liste[0].id;
  return { liste, active };
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
