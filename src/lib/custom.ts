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

export type AmbianceId =
  | "signature"
  | "ombre"
  | "aurore"
  | "braise"
  | "nuit"
  | "or"
  | "abysse"
  | "prisme"
  | "eclipse";

/**
 * Chaque ambiance redéfinit le dégradé signature (onglet actif, chiffres
 * en dégradé…) et les trois halos du fond. Les couleurs des cartes ne
 * bougent pas : l'ambiance colore l'air de la pièce, pas les meubles.
 *
 * Cinq d'entre elles se DÉBLOQUENT en montant de niveau. C'est la seule
 * récompense de progression qui se voit en permanence : un badge se regarde
 * une fois, une ambiance change l'écran tous les jours. Rien n'est retiré à
 * personne au passage — les quatre d'origine restent ouvertes dès le premier
 * jour, on n'a fait qu'ajouter au-dessus.
 */
export const AMBIANCES: Record<
  AmbianceId,
  {
    nom: string;
    description: string;
    grad: string;
    halos: [string, string, string];
    /** Le niveau à atteindre. 1 = disponible tout de suite. */
    niveau: number;
  }
> = {
  signature: {
    nom: "Signature",
    description: "Le dégradé du logo — l'ambiance d'origine.",
    grad: "linear-gradient(100deg, #ff3d8b, #ffc63d 38%, #3ddc84 68%, #22d3ee)",
    halos: ["rgba(255,61,139,0.13)", "rgba(34,211,238,0.11)", "rgba(255,198,61,0.07)"],
    niveau: 1,
  },
  ombre: {
    nom: "Ombre",
    description: "Bleu-violet profond, esprit Solo Leveling.",
    grad: "linear-gradient(100deg, #4f9cff, #b06bff 48%, #22d3ee)",
    halos: ["rgba(79,156,255,0.15)", "rgba(176,107,255,0.13)", "rgba(34,211,238,0.07)"],
    niveau: 1,
  },
  aurore: {
    nom: "Aurore",
    description: "Cyan et vert, calme et net.",
    grad: "linear-gradient(100deg, #22d3ee, #3ddc84 48%, #b06bff)",
    halos: ["rgba(34,211,238,0.13)", "rgba(61,220,132,0.11)", "rgba(176,107,255,0.07)"],
    niveau: 1,
  },
  braise: {
    nom: "Braise",
    description: "Rose et orange, énergie maximale.",
    grad: "linear-gradient(100deg, #ff3d8b, #ff7a3d 48%, #ffc63d)",
    halos: ["rgba(255,61,139,0.15)", "rgba(255,122,61,0.11)", "rgba(255,198,61,0.08)"],
    niveau: 1,
  },
  nuit: {
    nom: "Nuit blanche",
    description: "Presque monochrome. Pour quand seul le travail compte.",
    grad: "linear-gradient(100deg, #e8eef5, #8fa6c0 52%, #5b6f88)",
    halos: ["rgba(232,238,245,0.10)", "rgba(143,166,192,0.10)", "rgba(91,111,136,0.08)"],
    niveau: 5,
  },
  or: {
    nom: "Or",
    description: "Doré plein. Ça se mérite, et ça se voit.",
    grad: "linear-gradient(100deg, #ffd23d, #ff9f1c 46%, #ff6b35)",
    halos: ["rgba(255,210,61,0.14)", "rgba(255,159,28,0.12)", "rgba(255,107,53,0.07)"],
    niveau: 12,
  },
  abysse: {
    nom: "Abysse",
    description: "Bleu très profond, presque noir, traversé de turquoise.",
    grad: "linear-gradient(100deg, #0ea5b7, #1e3a8a 55%, #4c1d95)",
    halos: ["rgba(14,165,183,0.15)", "rgba(30,58,138,0.16)", "rgba(76,29,149,0.10)"],
    niveau: 20,
  },
  prisme: {
    nom: "Prisme",
    description: "Toutes les couleurs, franches. Le niveau 30 se remarque.",
    grad:
      "linear-gradient(100deg, #ff3d8b, #b06bff 26%, #22d3ee 52%, #3ddc84 74%, #ffd23d)",
    halos: ["rgba(176,107,255,0.15)", "rgba(34,211,238,0.13)", "rgba(255,61,139,0.10)"],
    niveau: 30,
  },
  eclipse: {
    nom: "Éclipse",
    description: "Noir et braise. Réservée à ceux qui ne s'arrêtent pas.",
    grad: "linear-gradient(100deg, #ff4d00, #7a1500 48%, #120a08)",
    halos: ["rgba(255,77,0,0.15)", "rgba(122,21,0,0.14)", "rgba(255,198,61,0.06)"],
    niveau: 45,
  },
};

/** Les ambiances ouvertes à ce niveau. */
export function ambiancesOuvertes(niveau: number): AmbianceId[] {
  return (Object.keys(AMBIANCES) as AmbianceId[]).filter(
    (id) => AMBIANCES[id].niveau <= niveau,
  );
}

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
