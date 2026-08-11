/**
 * Le compteur de fréquence des routes publiques.
 *
 * Trois routes sont ouvertes sans compte, parce qu'elles doivent l'être : on
 * ne peut pas demander un mot de passe à quelqu'un qui vient s'inscrire. Mais
 * ouvert ne veut pas dire illimité :
 *
 * - `/api/sas` appelle un modèle payant. Sans plafond, n'importe qui peut
 *   vider la cagnotte en boucle depuis un script.
 * - `/api/auth/creer` écrit dans une ligne unique, relue et réécrite par six
 *   chemins. Sans plafond, on la fait grossir jusqu'à ralentir tout l'OS.
 *
 * En mémoire, donc par instance : sur une plateforme sans serveur, plusieurs
 * instances tournent en parallèle et le plafond réel est un multiple de
 * celui-ci. C'est assumé — l'objectif est d'arrêter l'abus en boucle, pas de
 * compter juste. Un vrai compteur partagé demanderait une table, et il n'y en
 * a pas.
 */

type Fenetre = { debut: number; nombre: number };
const compteurs = new Map<string, Fenetre>();

/**
 * Vrai si la requête passe ; faux si le plafond est atteint.
 *
 * `plafondGlobal`, s'il est donné, ajoute un second compte TOUTES ADRESSES
 * CONFONDUES sur la famille de la clé — ce qui précède les deux points.
 *
 * Ce n'est pas une ceinture de plus par prudence. Le compte par adresse
 * repose sur `x-forwarded-for` ; derrière le proxy de la plateforme il est
 * fiable pour un client ordinaire, mais il ne dit rien contre quelqu'un qui
 * dispose de mille adresses — un parc de relais, ou simplement un
 * hébergeur. Cinq créations par heure et par adresse deviennent alors cinq
 * mille, ce qui suffit à faire grossir la ligne des comptes jusqu'à gêner
 * tout le monde. Le compte global, lui, ne dépend d'aucun en-tête.
 *
 * Il est volontairement placé très au-dessus de l'usage réel : il ne doit
 * jamais gêner les vraies personnes, seulement arrêter une boucle.
 */
export function souslaLimite(
  cle: string,
  maximum: number,
  fenetreMs: number,
  plafondGlobal?: number,
): boolean {
  const maintenant = Date.now();

  if (plafondGlobal !== undefined) {
    const famille = `@${cle.split(":")[0]}`;
    const g = compteurs.get(famille);
    if (!g || maintenant - g.debut > fenetreMs) {
      compteurs.set(famille, { debut: maintenant, nombre: 1 });
    } else if (g.nombre >= plafondGlobal) {
      return false;
    } else {
      g.nombre += 1;
    }
  }

  const f = compteurs.get(cle);

  if (!f || maintenant - f.debut > fenetreMs) {
    compteurs.set(cle, { debut: maintenant, nombre: 1 });
    /*
     * Ménage opportuniste : sans lui, la table grossit d'une entrée par
     * adresse vue et ne redescend jamais — une fuite de mémoire lente sur une
     * route publique, c'est-à-dire exactement là où elle est atteignable.
     */
    if (compteurs.size > 500) {
      for (const [k, v] of compteurs) {
        if (maintenant - v.debut > fenetreMs) compteurs.delete(k);
      }
    }
    return true;
  }

  if (f.nombre >= maximum) return false;
  f.nombre += 1;
  return true;
}

/**
 * L'adresse de l'appelant, telle que la plateforme la rapporte.
 *
 * `x-forwarded-for` peut contenir une chaîne de relais : la PREMIÈRE entrée
 * est celle du client. Elle est déclarative, donc falsifiable — mais derrière
 * le proxy de la plateforme, celui-ci la réécrit. C'est la meilleure
 * approximation disponible sans base partagée.
 */
export function adresse(req: Request): string {
  const entete = req.headers.get("x-forwarded-for") ?? "";
  return entete.split(",")[0]?.trim() || "inconnue";
}
