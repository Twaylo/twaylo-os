/**
 * Les relances : ce que l'OS dit quand Twaylo ne remplit rien.
 *
 * Pur et partagé — le même jugement sert à la bannière dans l'app et au
 * message Telegram du soir, pour que les deux ne se contredisent jamais.
 *
 * Deux principes tirés de l'usage réel :
 *
 * 1. **Jamais avant dix heures.** Une relance à huit heures du matin sur une
 *    journée forcément vide n'est pas une relance, c'est du bruit — et le
 *    bruit apprend à ignorer les notifications.
 * 2. **Le ton monte avec l'heure, pas avec la faute.** À midi c'est un
 *    rappel, à vingt-deux heures c'est un dernier appel. Culpabiliser dès le
 *    matin fait fermer l'app ; rappeler l'enjeu au bon moment fait cocher.
 */

export type TonRelance = "douce" | "ferme" | "urgente";

export type Relance = {
  ton: TonRelance;
  emoji: string;
  titre: string;
  texte: string;
  /** La couleur d'accent de la bannière. */
  couleur: string;
};

export type EtatRelance = {
  /** L'XP déjà gagnée aujourd'hui. Au-dessus de zéro, il n'y a rien à relancer. */
  xpJour: number;
  /** La série en cours, telle qu'elle sera si la journée reste vide. */
  serie: number;
  /** Le dernier jour AVANT aujourd'hui qui a laissé une trace, ou null. */
  dernierJourRempli: string | null;
  aujourdhui: string;
  /** L'heure locale, 0 à 23. */
  heure: number;
  /** Les blocs de journée type encore à cocher. */
  blocsRestants: number;
  /** L'intitulé du premier bloc non coché, pour proposer UNE action. */
  premierBloc?: string;
};

const COULEURS: Record<TonRelance, string> = {
  douce: "var(--color-ble)",
  ferme: "var(--color-amb)",
  urgente: "var(--color-mag)",
};

/** Le nombre de jours entiers sautés entre le dernier jour rempli et hier. */
export function joursSautes(dernier: string | null, aujourdhui: string): number {
  if (!dernier) return 0;
  const a = Date.parse(`${dernier}T00:00:00Z`);
  const b = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000) - 1);
}

/**
 * La relance à afficher, ou null s'il n'y a rien à dire.
 *
 * Rien à dire, c'est le cas normal : une journée déjà entamée n'a pas besoin
 * qu'on la commente.
 */
export function relanceDuJour(e: EtatRelance): Relance | null {
  if (e.xpJour > 0) return null;
  if (e.heure < 10) return null;

  const sautes = joursSautes(e.dernierJourRempli, e.aujourdhui);
  const action = e.premierBloc
    ? `Commence par « ${e.premierBloc} ».`
    : e.blocsRestants > 0
      ? "Coche un bloc, n'importe lequel."
      : "Coche une habitude, ça suffit à tenir le jour.";

  if (e.heure >= 21) {
    return {
      ton: "urgente",
      emoji: "⏳",
      titre:
        e.serie > 0
          ? `Ta série de ${e.serie} jour${e.serie > 1 ? "s" : ""} se joue maintenant`
          : "La journée est presque finie",
      texte: `Rien de coché aujourd'hui. ${action}`,
      couleur: COULEURS.urgente,
    };
  }

  if (e.heure >= 17) {
    return {
      ton: "ferme",
      emoji: "🌆",
      titre: "La journée file et rien n'est coché",
      texte:
        e.serie > 0
          ? `${e.serie} jour${e.serie > 1 ? "s" : ""} d'affilée derrière toi. ${action}`
          : action,
      couleur: COULEURS.ferme,
    };
  }

  if (sautes > 0) {
    return {
      ton: "ferme",
      emoji: "🕳",
      titre: `${sautes} jour${sautes > 1 ? "s" : ""} sans rien noter`,
      texte: `On ne rattrape pas le passé, on repart aujourd'hui. ${action}`,
      couleur: COULEURS.ferme,
    };
  }

  return {
    ton: "douce",
    emoji: "👋",
    titre: "Rien de coché pour l'instant",
    texte: action,
    couleur: COULEURS.douce,
  };
}
