/**
 * La personnalisation de l'OS — l'ambiance, les onglets, l'identité.
 *
 * Tout est réglable depuis le panneau « Personnaliser » (avatar, en haut à
 * droite) et vit en double : dans le navigateur pour repeindre instantanément
 * au démarrage, et sur la ligne sentinelle pour retrouver SES réglages sur
 * n'importe quel appareil — Twaylo pilote son OS du téléphone comme du bureau.
 */

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
  /** Onglets masqués du rail — « Accueil » ne peut jamais l'être. */
  ongletsCaches: string[];
  /** L'ordre voulu des onglets ; ceux qui n'y figurent pas suivent, dans l'ordre d'origine. */
  ordreOnglets: string[];
  /** Nom et rôle affichés (avatar, panneau compte). Vides = valeurs d'origine. */
  nom: string;
  role: string;
};

export const CUSTOM_DEFAUT: CustomConfig = {
  ambiance: "signature",
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
      .slice(0, 24)
      .map((x) => String(x ?? "").slice(0, 30))
      .filter(Boolean);

  return {
    // `Object.hasOwn` et non `in` : ce dernier accepte « toString » ou
    // « constructor », hérités du prototype, et l'ambiance devenait introuvable.
    ambiance: Object.hasOwn(AMBIANCES, b.ambiance) ? b.ambiance : "signature",
    // Sans Accueil, plus aucun moyen de revenir quelque part : jamais caché.
    ongletsCaches: listeTexte(b.ongletsCaches).filter((o) => o !== "Accueil"),
    ordreOnglets: listeTexte(b.ordreOnglets),
    nom: String(b.nom ?? "").slice(0, 40),
    role: String(b.role ?? "").slice(0, 60),
  };
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
