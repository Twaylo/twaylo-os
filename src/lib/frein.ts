/**
 * Le frein commun aux portes publiques.
 *
 * Ce code vivait dans la route de connexion, et n'y protégeait qu'elle. La
 * création de compte est pourtant la porte la plus coûteuse des deux : chaque
 * appel dérive une empreinte PBKDF2 à 210 000 itérations — de l'ordre d'une
 * centaine de millisecondes de processeur — puis relit et réécrit le registre
 * entier. Sans frein, quelques requêtes par seconde suffisent à saturer la
 * fonction, et une boucle laissée tourner une nuit fait grossir sans fin la
 * ligne qui contient TOUS les comptes.
 *
 * Deux compteurs, et le second n'est pas un luxe :
 *
 *   · par adresse, lue dans `x-forwarded-for` — un en-tête que le client
 *     fabrique lui-même. Il suffit de le faire varier à chaque essai pour
 *     n'être jamais deux fois la même adresse ;
 *   · global, qui ne dépend d'aucun en-tête et compte tous les échecs. C'est
 *     lui qui tient quand le premier est contourné.
 *
 * Fenêtre glissante en mémoire : suffisant pour une instance servant quelques
 * personnes. À déplacer vers un stockage partagé le jour où le déploiement se
 * répartit sur plusieurs instances, chacune ayant sinon son propre compteur.
 */

export type Frein = {
  /** Secondes d'attente restantes, ou `null` si l'essai peut passer. */
  bloque(ip: string): number | null;
  /** À appeler sur un échec — ou sur chaque appel, pour une porte à quota. */
  echec(ip: string): void;
  /** À appeler sur un succès : l'adresse repart de zéro. */
  succes(ip: string): void;
};

export function creerFrein(options: {
  parIp: number;
  global: number;
  fenetreMs?: number;
}): Frein {
  const fenetreMs = options.fenetreMs ?? 15 * 60 * 1000;
  const parIp = new Map<string, { n: number; jusqua: number }>();
  let global = { n: 0, jusqua: 0 };

  return {
    bloque(ip) {
      const maintenant = Date.now();
      // Le verrou global d'abord : c'est lui qui résiste à la rotation d'IP.
      if (maintenant <= global.jusqua && global.n >= options.global) {
        return Math.ceil((global.jusqua - maintenant) / 1000);
      }
      const e = parIp.get(ip);
      if (!e) return null;
      if (maintenant > e.jusqua) {
        parIp.delete(ip);
        return null;
      }
      return e.n >= options.parIp ? Math.ceil((e.jusqua - maintenant) / 1000) : null;
    },

    echec(ip) {
      const maintenant = Date.now();
      if (maintenant > global.jusqua) global = { n: 1, jusqua: maintenant + fenetreMs };
      else global.n += 1;

      const e = parIp.get(ip);
      if (!e || maintenant > e.jusqua) {
        parIp.set(ip, { n: 1, jusqua: maintenant + fenetreMs });
        return;
      }
      e.n += 1;

      /*
       * Purge opportuniste des adresses périmées.
       *
       * Sans elle, la table grandit d'une entrée par adresse vue et ne
       * redescend jamais : c'est précisément ce qu'obtient un attaquant qui
       * fait varier `x-forwarded-for` à chaque essai — une fuite de mémoire
       * offerte, sur la seule route qu'il peut appeler sans compte.
       */
      if (parIp.size > 5_000) {
        for (const [cle, v] of parIp) if (maintenant > v.jusqua) parIp.delete(cle);
      }
    },

    succes(ip) {
      parIp.delete(ip);
    },
  };
}

/** L'adresse de l'appelant, telle que la voit le proxy de Vercel. */
export function adresse(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnu";
}
