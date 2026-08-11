/**
 * La personnalisation de l'OS — l'ambiance, les onglets, l'identité.
 *
 * Tout est réglable depuis le panneau « Personnaliser » (avatar, en haut à
 * droite) et vit en double : dans le navigateur pour repeindre instantanément
 * au démarrage, et sur la ligne sentinelle pour retrouver SES réglages sur
 * n'importe quel appareil — Twaylo pilote son OS du téléphone comme du bureau.
 */

import { BLOC_PAR_ID, BLOCS, TABS, ordonner, tousLesBlocs, type Tab } from "./modules";

const CATALOGUE_BLOCS = BLOCS.map((b) => b.id);

export type AmbianceId = "signature" | "ombre" | "aurore" | "braise";

/**
 * Chaque ambiance redéfinit le dégradé signature (onglet actif, chiffres
 * en dégradé…) et les trois halos du fond. Les couleurs des cartes ne
 * bougent pas : l'ambiance colore l'air de la pièce, pas les meubles.
 */
export const AMBIANCES: Record<
  AmbianceId,
  { nom: string; description: string; grad: string; halos: [string, string, string] }
> = {
  signature: {
    nom: "Signature",
    description: "Le dégradé du logo — l'ambiance d'origine.",
    grad: "linear-gradient(100deg, #ff3d8b, #ffc63d 38%, #3ddc84 68%, #22d3ee)",
    halos: ["rgba(255,61,139,0.13)", "rgba(34,211,238,0.11)", "rgba(255,198,61,0.07)"],
  },
  ombre: {
    nom: "Ombre",
    description: "Bleu-violet profond, esprit Solo Leveling.",
    grad: "linear-gradient(100deg, #4f9cff, #b06bff 48%, #22d3ee)",
    halos: ["rgba(79,156,255,0.15)", "rgba(176,107,255,0.13)", "rgba(34,211,238,0.07)"],
  },
  aurore: {
    nom: "Aurore",
    description: "Cyan et vert, calme et net.",
    grad: "linear-gradient(100deg, #22d3ee, #3ddc84 48%, #b06bff)",
    halos: ["rgba(34,211,238,0.13)", "rgba(61,220,132,0.11)", "rgba(176,107,255,0.07)"],
  },
  braise: {
    nom: "Braise",
    description: "Rose et orange, énergie maximale.",
    grad: "linear-gradient(100deg, #ff3d8b, #ff7a3d 48%, #ffc63d)",
    halos: ["rgba(255,61,139,0.15)", "rgba(255,122,61,0.11)", "rgba(255,198,61,0.08)"],
  },
};

export type CustomConfig = {
  ambiance: AmbianceId;
  /**
   * Les onglets INSTALLÉS, dans l'ordre voulu.
   *
   * Vide veut dire « l'OS complet » : c'est ce que voit un compte qui n'a
   * jamais rien réglé, et ça garde l'OS historique exactement tel qu'il était.
   * Un compte créé par le sas, lui, reçoit une liste explicite.
   */
  modules: string[];
  /** Les blocs de l'accueil installés, dans l'ordre. Vide = tous. */
  blocs: string[];
  /** @deprecated Remplacé par `modules` ; encore lu pour migrer les anciens réglages. */
  ongletsCaches: string[];
  /** @deprecated Remplacé par `modules`. */
  ordreOnglets: string[];
  /** Nom et rôle affichés (avatar, panneau compte). Vides = valeurs d'origine. */
  nom: string;
  role: string;
};

export const CUSTOM_DEFAUT: CustomConfig = {
  ambiance: "signature",
  modules: [],
  blocs: [],
  ongletsCaches: [],
  ordreOnglets: [],
  nom: "",
  role: "",
};

/** Revalide un réglage complet — on ne range jamais de données brutes. */
export function bornerCustom(brut: Partial<CustomConfig> | null | undefined): CustomConfig {
  const b = { ...CUSTOM_DEFAUT, ...(brut && typeof brut === "object" ? brut : {}) };
  const listeTexte = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, 40)
      .map((x) => String(x ?? "").slice(0, 30))
      .filter(Boolean);

  const caches = listeTexte(b.ongletsCaches).filter((o) => o !== "Accueil");
  const ordre = listeTexte(b.ordreOnglets);

  let modules = ordonner(listeTexte(b.modules), TABS);
  /*
   * Migration silencieuse des réglages d'avant les modules.
   *
   * Masquer un onglet et ne pas l'installer donnent le même résultat à
   * l'écran ; on traduit donc l'ancien réglage plutôt que de le perdre. Sans
   * ça, quelqu'un qui avait masqué six onglets les aurait tous vus revenir au
   * premier chargement de cette version.
   */
  if (modules.length === 0 && (caches.length > 0 || ordre.length > 0)) {
    modules = ordonnerOnglets(TABS, ordre).filter((t) => !caches.includes(t));
  }
  // Sans Accueil, plus aucun moyen de revenir quelque part : jamais retirable.
  if (modules.length > 0 && !modules.includes("Accueil")) modules = ["Accueil", ...modules];

  return {
    // `Object.hasOwn` et non `in` : ce dernier accepte « toString » ou
    // « constructor », hérités du prototype, et l'ambiance devenait introuvable.
    ambiance: Object.hasOwn(AMBIANCES, b.ambiance) ? b.ambiance : "signature",
    modules,
    blocs: ordonner(listeTexte(b.blocs), CATALOGUE_BLOCS),
    ongletsCaches: caches,
    ordreOnglets: ordre,
    nom: String(b.nom ?? "").slice(0, 40),
    role: String(b.role ?? "").slice(0, 60),
  };
}

/* ------------------------------------------------------------------ */
/* Ce qui est réellement affiché                                       */
/* ------------------------------------------------------------------ */

/** Les onglets du rail : ceux qui sont installés, dans l'ordre choisi. */
export function modulesActifs(c: CustomConfig): Tab[] {
  return (c.modules.length > 0 ? ordonner(c.modules, TABS) : [...TABS]) as Tab[];
}

/**
 * Les blocs de l'accueil réellement affichables.
 *
 * Filtrés par les modules installés, et à l'affichage seulement : désinstaller
 * Contenu fait disparaître le pipeline de l'accueil, le réinstaller le remet
 * là où il était. Purger la liste rangée aurait perdu ce classement.
 */
export function blocsActifs(c: CustomConfig, modules: readonly string[]): string[] {
  const installes = new Set(modules);
  const choisis = c.blocs.length > 0 ? ordonner(c.blocs, CATALOGUE_BLOCS) : tousLesBlocs();
  return choisis.filter((id) => {
    const requis = BLOC_PAR_ID.get(id)?.module;
    return !requis || installes.has(requis);
  });
}

/**
 * L'ordre effectif : d'abord ceux que Twaylo a rangés, puis les autres dans
 * l'ordre d'origine — un onglet ajouté par une future version apparaît donc
 * tout seul, sans casser le classement existant.
 */
export function ordonnerOnglets<T extends string>(
  tous: readonly T[],
  ordre: string[],
): T[] {
  const ranges = ordre.filter((o): o is T => (tous as readonly string[]).includes(o));
  return [...ranges, ...tous.filter((t) => !ranges.includes(t))];
}
