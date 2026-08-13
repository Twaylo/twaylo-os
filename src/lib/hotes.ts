/**
 * Deux sites, un seul déploiement : qui répond dépend de l'adresse demandée.
 *
 * POURQUOI
 *
 * L'OS de Twaylo et les Tway'tools vivent dans le même projet, mais ils ne
 * s'adressent pas aux mêmes personnes. L'OS est un tableau de bord privé ;
 * les Tway'tools partent dans la description d'une vidéo vue par des
 * dizaines de milliers de gens. Servir les deux sous « twaylo-os.vercel.app »
 * revient à donner l'adresse du tableau de bord à tout le monde : il suffit
 * d'effacer la fin de l'adresse pour tomber dessus.
 *
 * COMMENT
 *
 * L'OS répond sur SES adresses — la production « twaylo-os.vercel.app », les
 * préproductions « twaylo-os-…vercel.app », et la machine de développement.
 * Toute autre adresse qui atteint ce déploiement ne connaît QUE les
 * Tway'tools : la bibliothèque à la racine, les outils, leur API. Le reste
 * répond « introuvable », sans redirection — une redirection révélerait
 * justement l'adresse qu'on cherche à ne pas montrer.
 *
 * Le sens de la règle compte : ce qui n'est pas reconnu tombe du côté PUBLIC,
 * jamais du côté privé. Une adresse ajoutée par erreur, un en-tête absent, un
 * jour où Vercel change ses noms de préproduction : dans tous ces cas on sert
 * la bibliothèque, on n'ouvre pas le tableau de bord.
 *
 * Aucune variable d'environnement ici, volontairement. Next fige la valeur
 * des variables dans le middleware AU MOMENT DE LA CONSTRUCTION : brancher un
 * nouveau domaine demanderait alors un redéploiement en plus. Écrit en dur,
 * le jour où le domaine est ajouté chez Vercel, il fonctionne tout seul.
 */

/** Les préfixes d'hôte qui appartiennent à l'OS personnel. */
const HOTES_OS = ["twaylo-os", "localhost", "127.0.0.1"];

/**
 * L'adresse publique des Tway'tools.
 *
 * Elle ne sert QU'À une chose : renvoyer vers elle ce qui frappe encore à
 * l'ancienne porte. La reconnaissance d'un hôte « outils » ne s'appuie pas
 * dessus — elle marche par élimination, ce qui laisse fonctionner n'importe
 * quel domaine ajouté plus tard sans toucher au code.
 */
export const HOTE_OUTILS = "tway-tools.vercel.app";

/**
 * Cette requête vise-t-elle l'OS personnel ?
 *
 * `false` pour toute adresse inconnue — c'est le côté sûr.
 */
export function estHoteOS(hote: string | null | undefined): boolean {
  // L'en-tête « Host » porte parfois le port : « localhost:3000 ».
  const nom = (hote ?? "").toLowerCase().split(":")[0];
  return HOTES_OS.some((prefixe) => nom === prefixe || nom.startsWith(`${prefixe}-`) || nom.startsWith(`${prefixe}.`));
}

/**
 * Ce qu'un hôte « Tway'tools » a le droit de servir.
 *
 * Énuméré, jamais deviné : ouvrir un chemin de plus doit rester un geste
 * délibéré, pas un effet de bord d'un préfixe trop large.
 */
export const CHEMINS_OUTILS = [
  "/tway-tools",
  "/piraterie",
  "/api/tools",
  "/robots.txt",
  "/sitemap.xml",
] as const;

/**
 * Ceux de ces chemins qui DÉMÉNAGENT.
 *
 * `robots.txt` et `sitemap.xml` en sont exclus : chaque site a besoin des
 * siens, à sa propre adresse. Les renvoyer ailleurs priverait l'OS des
 * consignes qui empêchent justement son indexation.
 */
const CHEMINS_DEMENAGES = ["/tway-tools", "/piraterie", "/api/tools"] as const;

const commence = (chemin: string, base: string) =>
  chemin === base || chemin.startsWith(`${base}/`);

/** Le chemin demandé fait-il partie des Tway'tools ? */
export function estCheminOutil(chemin: string): boolean {
  return CHEMINS_OUTILS.some((base) => commence(chemin, base));
}

/** Ce chemin doit-il désormais être servi depuis l'adresse publique ? */
export function estCheminDemenage(chemin: string): boolean {
  return CHEMINS_DEMENAGES.some((base) => commence(chemin, base));
}
