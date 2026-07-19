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

/**
 * Ramène un libellé affiché vers la clé stockée : « ANNÉE » → « annee ».
 *
 * Les clés de la base sont sans accent (contrainte `check` de `goals`), alors
 * que l'affichage en porte. Un simple `toLowerCase()` ne suffit donc pas.
 */
export function sansAccent(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
