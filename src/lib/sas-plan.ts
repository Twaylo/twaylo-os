import { CATEGORIES_BLOC, type CategorieBloc } from "./journees";

/**
 * Le plan que l'IA propose, et sa mise en forme.
 *
 * Tout ce qui vient du modèle est traité comme une saisie extérieure : borné,
 * découpé, et rabattu sur des valeurs connues quand il invente. Un modèle qui
 * répond « catégorie: productivité » ne doit pas écrire une catégorie inconnue
 * dans la base — il doit se retrouver rangé dans « autre ».
 *
 * Le nettoyage vit ici, PARTAGÉ, parce qu'il sert deux fois : quand le plan est
 * produit, et quand il revient de l'écran pour être appliqué. Un plan qui fait
 * l'aller-retour par le navigateur peut avoir été modifié entre-temps.
 */

export type PlanOs = {
  /** Une phrase qui dit ce qui a été construit, montrée avant d'appliquer. */
  resume: string;
  blocs: { debut: string; fin: string; titre: string; categorie: CategorieBloc }[];
  habitudes: { nom: string; categorie: string; options: string[] }[];
  objectifs: { objectif: string; portee: "semaine" | "mois" | "trimestre" | "annee" }[];
  skills: { nom: string; categorie: string; niveau: number }[];
};

const PORTEES = new Set(["semaine", "mois", "trimestre", "annee"]);
const CAT_SKILL = new Set(["Langues", "Création", "Business", "Corps", "Autre"]);

/** Bornes volontairement basses : un OS de départ surchargé se referme. */
export const MAX = { blocs: 10, habitudes: 6, objectifs: 5, skills: 8 };

const texte = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";

/** `7:5` et `07:05` doivent produire la même chose ; le reste est rejeté. */
function heure(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof v === "string" ? v.trim() : "");
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h > 23 || mn > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

/**
 * Nettoie un plan venu du modèle ou du navigateur.
 *
 * Ne lève jamais : un champ absurde est écarté, pas transformé en erreur. Un
 * sas d'accueil qui échoue parce que le modèle a mal orthographié une
 * catégorie est un sas qu'on ne finit pas.
 */
export function nettoyerPlan(brut: unknown): PlanOs {
  const p = (brut ?? {}) as Partial<Record<keyof PlanOs, unknown>>;
  const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const blocs = liste(p.blocs)
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      const debut = heure(o.debut);
      const titre = texte(o.titre, 60);
      if (!debut || !titre) return null;
      const cat = texte(o.categorie, 20).toLowerCase();
      return {
        debut,
        // Une fin absente est légitime : le bloc court jusqu'au suivant.
        fin: heure(o.fin) ?? "",
        titre,
        categorie: (Object.hasOwn(CATEGORIES_BLOC, cat) ? cat : "autre") as CategorieBloc,
      };
    })
    .filter((b): b is PlanOs["blocs"][number] => b !== null)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, MAX.blocs);

  const habitudes = liste(p.habitudes)
    .map((h) => {
      const o = (h ?? {}) as Record<string, unknown>;
      const nom = texte(o.nom, 40);
      if (!nom) return null;
      return {
        nom,
        categorie: texte(o.categorie, 24) || "Autre",
        options: liste(o.options)
          .map((x) => texte(x, 24))
          .filter(Boolean)
          .slice(0, 4),
      };
    })
    .filter((h): h is PlanOs["habitudes"][number] => h !== null)
    .slice(0, MAX.habitudes);

  const objectifs = liste(p.objectifs)
    .map((g) => {
      const o = (g ?? {}) as Record<string, unknown>;
      const objectif = texte(o.objectif, 120);
      if (!objectif) return null;
      const portee = texte(o.portee, 12).toLowerCase();
      return {
        objectif,
        portee: (PORTEES.has(portee) ? portee : "mois") as PlanOs["objectifs"][number]["portee"],
      };
    })
    .filter((g): g is PlanOs["objectifs"][number] => g !== null)
    .slice(0, MAX.objectifs);

  const skills = liste(p.skills)
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const nom = texte(o.nom, 40);
      if (!nom) return null;
      const n = Number(o.niveau);
      const categorie = texte(o.categorie, 24);
      return {
        nom,
        categorie: CAT_SKILL.has(categorie) ? categorie : "Autre",
        // Un niveau de départ inventé haut fausserait la première courbe.
        niveau: Number.isFinite(n) ? Math.max(0, Math.min(60, Math.round(n))) : 10,
      };
    })
    .filter((s): s is PlanOs["skills"][number] => s !== null)
    .slice(0, MAX.skills);

  return {
    resume: texte(p.resume, 240),
    blocs,
    habitudes,
    objectifs,
    skills,
  };
}

/** Un plan vide ne vaut pas la peine d'être appliqué. */
export function planUtilisable(p: PlanOs): boolean {
  return p.blocs.length + p.habitudes.length + p.objectifs.length + p.skills.length > 0;
}
