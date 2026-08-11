import { CATEGORIES_BLOC, type CategorieBloc } from "./journees";
import { BLOCS_PAR_PROFIL, HABITUDES_PAR_PROFIL, PROFILS, type Reponses } from "./sas";
import { BLOCS, TABS, blocsDuProfil, modulesDuProfil, ordonner } from "./modules";
import { AMBIANCES, AMBIANCE_PAR_PROFIL } from "./custom";

const CATALOGUE_BLOCS = BLOCS.map((b) => b.id);

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
  /** Le profil choisi au premier écran — sert au rôle affiché et aux défauts. */
  profil: string;
  blocs: { debut: string; fin: string; titre: string; categorie: CategorieBloc }[];
  habitudes: { nom: string; categorie: string; options: string[] }[];
  objectifs: { objectif: string; portee: "semaine" | "mois" | "trimestre" | "annee" }[];
  skills: { nom: string; categorie: string; niveau: number }[];
  /**
   * La FORME de l'OS : quels onglets, quelles cartes sur l'accueil.
   *
   * Ce n'est pas l'IA qui décide — c'est le catalogue, à partir du profil. Un
   * modèle de langage qui invente des noms d'onglets produirait des modules
   * inexistants une fois sur dix, et le rail se retrouverait vide. Ici la
   * proposition est déterministe, et la personne la corrige à l'écran suivant :
   * c'est la partie du sas qui se voit le plus, elle ne doit pas être un pari.
   */
  espace: { modules: string[]; blocs: string[] };
  /**
   * Le prénom donné au premier écran, et la couleur du profil.
   *
   * Ils font partie du plan parce qu'ils font partie de l'OS qu'on construit :
   * arriver sur un tableau de bord qui vous appelle par votre prénom et qui
   * porte votre couleur, c'est la différence entre « un outil » et « le mien ».
   */
  nom: string;
  ambiance: string;
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

  /*
   * L'espace est borné contre le catalogue, comme le reste.
   *
   * Il fait l'aller-retour par le navigateur : ce qui revient peut contenir
   * n'importe quoi. `ordonner` ne garde que les identifiants connus, sans
   * doublon, et dans l'ordre où ils arrivent.
   */
  const brutEspace = (p.espace ?? {}) as { modules?: unknown; blocs?: unknown };
  const modules = ordonner(liste(brutEspace.modules).map((x) => texte(x, 30)), TABS);
  const espace = {
    // Accueil n'est pas négociable : sans lui, l'OS s'ouvre sur rien.
    modules: modules.length > 0 && !modules.includes("Accueil") ? ["Accueil", ...modules] : modules,
    blocs: ordonner(liste(brutEspace.blocs).map((x) => texte(x, 30)), CATALOGUE_BLOCS),
  };

  const brutProfil = texte(p.profil, 20);
  const profil = PROFILS.some((x) => x.id === brutProfil) ? brutProfil : "autre";
  const ambiance = texte(p.ambiance, 20);

  return {
    resume: texte(p.resume, 240),
    profil,
    nom: texte(p.nom, 40),
    // Rabattue sur la couleur du profil si elle est inconnue : jamais sur
    // « Signature », qui est l'identité de Twaylo et pas un défaut de produit.
    ambiance: Object.hasOwn(AMBIANCES, ambiance)
      ? ambiance
      : (AMBIANCE_PAR_PROFIL[profil] ?? "bleu"),
    blocs,
    habitudes,
    objectifs,
    skills,
    espace,
  };
}

/** La forme d'OS proposée à un profil : modules du catalogue, puis leurs blocs. */
export function espaceDuProfil(profil: string): PlanOs["espace"] {
  const modules = modulesDuProfil(profil);
  return { modules, blocs: blocsDuProfil(profil, modules) };
}

/** Un plan vide ne vaut pas la peine d'être appliqué. */
export function planUtilisable(p: PlanOs): boolean {
  return p.blocs.length + p.habitudes.length + p.objectifs.length + p.skills.length > 0;
}

/* ------------------------------------------------------------------ */
/* Le plan de secours, tiré du catalogue                                */
/* ------------------------------------------------------------------ */

/**
 * Le plan qu'on propose quand l'IA n'est pas là.
 *
 * Un sas qui se termine sur « réessaie plus tard » est un sas qu'on ne
 * recommence pas : la personne a répondu à six écrans, elle doit repartir
 * avec quelque chose. Le catalogue par profil est moins fin qu'une réponse du
 * modèle, mais il est complet, cohérent, et entièrement modifiable à l'écran
 * juste après — ce qui est déjà l'essentiel.
 *
 * Il tient compte de DEUX réponses, celles qui changent tout : le temps
 * disponible, qui plafonne le nombre de blocs, et les priorités, qui décident
 * des compétences suivies.
 */
export function planDeSecours(reponses: Reponses): PlanOs {
  const catalogue = BLOCS_PAR_PROFIL[reponses.profil] ?? BLOCS_PAR_PROFIL.autre;
  const temps = reponses.choix.temps?.[0] ?? "2a4";
  const plafond = { moins2: 3, "2a4": 5, "4a8": 7, plus8: MAX.blocs }[temps] ?? 5;

  const blocs = catalogue
    // Les blocs marqués par défaut d'abord : si le plafond coupe, il coupe
    // dans l'optionnel, jamais dans l'essentiel.
    .slice()
    .sort((a, b) => Number(b.parDefaut) - Number(a.parDefaut))
    .slice(0, plafond)
    .map((b) => ({
      debut: b.debut,
      fin: b.fin,
      titre: b.titre,
      categorie: b.categorie as CategorieBloc,
    }))
    .sort((a, b) => a.debut.localeCompare(b.debut));

  const priorites = reponses.choix.priorites ?? [];
  const SKILLS: Record<string, { nom: string; categorie: string }> = {
    corps: { nom: "Condition physique", categorie: "Corps" },
    argent: { nom: "Vendre et négocier", categorie: "Business" },
    savoir: { nom: "Apprentissage", categorie: "Autre" },
    creation: { nom: "Création de contenu", categorie: "Création" },
    calme: { nom: "Discipline", categorie: "Autre" },
    relations: { nom: "Relationnel", categorie: "Autre" },
  };

  return nettoyerPlan({
    resume:
      "Une base tirée de ton profil, sans l'assistant. Coche ce que tu gardes et ajuste les horaires : tout est modifiable ici.",
    profil: reponses.profil,
    espace: espaceDuProfil(reponses.profil),
    blocs,
    habitudes: (HABITUDES_PAR_PROFIL[reponses.profil] ?? HABITUDES_PAR_PROFIL.autre).map((h) => ({
      ...h,
      options: [],
    })),
    objectifs: [],
    skills: priorites.map((p) => ({ ...(SKILLS[p] ?? SKILLS.calme), niveau: 10 })),
  });
}
