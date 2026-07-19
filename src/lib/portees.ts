/**
 * Les quatre horizons d'un objectif.
 *
 * Les valeurs stockées (`semaine`, `mois`, `trimestre`, `annee`) sont imposées
 * par la contrainte `check` de la table `goals` — d'où la table de
 * correspondance vers ce qui s'affiche.
 */
export const ORDRE_PORTEES = ["semaine", "mois", "trimestre", "annee"];

export const LIBELLE_PORTEE: Record<string, string> = {
  semaine: "Semaine",
  mois: "Mois",
  trimestre: "Trimestre",
  annee: "Année",
};

export const COULEUR_PORTEE: Record<string, string> = {
  semaine: "var(--color-amb)",
  mois: "var(--color-ver)",
  trimestre: "var(--color-cya)",
  annee: "var(--color-mag)",
};
