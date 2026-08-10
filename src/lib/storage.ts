"use client";

import { localDateKey } from "./local-date";

/**
 * Persistance navigateur.
 *
 * Sert deux buts :
 *  1. aujourd'hui, c'est la seule mémoire de l'OS ;
 *  2. demain, ce sera le cache local devant Supabase — la spec Partie 6 le
 *     prévoit explicitement pour les habitudes (« cache localStorage pour un
 *     retour instantané, sync Supabase à chaque clic »).
 *
 * Les formes stockées sont donc déjà celles des colonnes Supabase, pour que
 * le branchement de l'étape suivante soit une greffe et non une réécriture.
 */

const PREFIX = "twaylo";

export const KEYS = {
  demo: `${PREFIX}-demo-mode`,
  captures: `${PREFIX}-captures`,
  tasks: `${PREFIX}-tasks-done`,
  /**
   * La dernière liste de tâches renvoyée par la base.
   *
   * Sans elle, l'écran restait vide le temps que la fonction serveur sorte de
   * veille — plusieurs secondes au premier chargement de la journée. On repeint
   * donc la dernière liste connue tout de suite, et la base la corrige dès
   * qu'elle répond. Rien n'est enregistré à partir de ce cache : il ne sert
   * qu'à l'affichage (voir `tachesPretes`).
   */
  tachesCache: `${PREFIX}-taches-cache`,
  /**
   * Les modèles de journée type, tels que la base les a renvoyés.
   *
   * Ils ne dépendent pas du jour — ce sont des modèles, pas des coches — donc
   * pas de date dans la clé. Sans ce cache, la carte affichait « Lecture de ta
   * journée… » le temps que la fonction serveur sorte de veille, alors que le
   * reste du tableau de bord était déjà peint depuis la mémoire du navigateur.
   */
  journeesCache: `${PREFIX}-journees-cache`,
  /** Les objectifs, dernière version connue. Hors du temps eux aussi. */
  objectifsCache: `${PREFIX}-objectifs-cache`,
  /**
   * L'XP cumulée et la série, avec le jour qu'elles décrivent.
   *
   * Datées, contrairement aux deux précédentes : ressortir la série d'hier un
   * nouveau matin afficherait un compteur faux, ce qui est pire qu'un compteur
   * qui se remplit une seconde plus tard.
   */
  progressionCache: `${PREFIX}-progression-cache`,
  /**
   * Le dernier état complet renvoyé par la base, avec le jour qu'il décrit.
   *
   * Les cartes se remplissaient une par une à mesure que le serveur répondait,
   * et comme chacune changeait alors de hauteur, la grille se réorganisait
   * sous les yeux. On repeint donc tout le tableau de bord d'un coup, dès le
   * premier affichage. Le jour est stocké avec : les habitudes cochées et les
   * repas d'hier n'ont rien à faire sur la journée d'aujourd'hui.
   */
  etatCache: `${PREFIX}-etat-cache`,
  /**
   * Les écritures qui n'ont pas encore atteint la base, rangées par jour.
   *
   * Elles vivaient uniquement en mémoire : cocher une habitude dans le métro
   * puis fermer l'application perdait la coche pour de bon — l'écran la
   * gardait (le cache local), la base ne l'a jamais reçue, et le lendemain
   * la base écrasait l'écran. Écrites ici, elles survivent à la fermeture et
   * repartent au retour du réseau.
   *
   * Rangées PAR JOUR, et c'est indispensable : les écritures étaient fusionnées
   * en un seul paquet dont la date était écrasée par la plus récente. Gardée
   * d'un jour sur l'autre, une note d'hier se serait écrite sur aujourd'hui.
   */
  fileEcritures: `${PREFIX}-ecritures-en-attente`,
} as const;

/**
 * Clé datée sur le jour LOCAL de Twaylo, jamais sur UTC.
 *
 * C'est la parade au bug 2 de la spec Partie 10 : avec une clé UTC, les
 * habitudes se remettraient à zéro à 2h du matin en été à Paris. Ici le
 * changement de clé se fait à minuit chez lui, donc la remise à zéro
 * quotidienne est automatique et correcte — il n'y a aucun code de reset.
 */
export function dailyKey(base: string): string {
  return `${PREFIX}-${base}-${localDateKey()}`;
}

/** Lecture tolérante : une valeur corrompue ne doit jamais casser l'app. */
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch (err) {
    console.error(`[storage] lecture impossible de ${key} :`, err);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Quota dépassé ou mode privé : on le dit, on ne plante pas.
    console.error(`[storage] écriture impossible de ${key} :`, err);
  }
}

/**
 * Efface une clé. Utile quand la clé signifie « il reste du travail » : la
 * laisser avec un objet vide ferait rejouer une file déjà envoyée.
 */
export function effacerCle(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.error(`[storage] effacement impossible de ${key} :`, err);
  }
}

/*
 * Écriture différée, pour les champs de texte.
 *
 * localStorage.setItem est SYNCHRONE : il bloque le fil principal le temps
 * d'écrire. Écrire à chaque frappe d'une entrée de journal de 8 Ko, c'est
 * sérialiser et réécrire 8 Ko à chaque lettre — mesuré : 6 écritures et
 * 41 Ko pour 10 frappes. La frappe rame de plus en plus à mesure que le
 * texte grossit, ce qui est précisément le cas quand on raconte sa journée.
 *
 * On n'écrit donc que lorsque la frappe s'arrête. Le risque — perdre les
 * dernières lettres si l'onglet ferme brutalement — est couvert par le
 * vidage sur `pagehide` plus bas.
 */
const enAttente = new Map<string, unknown>();
const minuteurs = new Map<string, ReturnType<typeof setTimeout>>();

export function writeJSONDebounced(key: string, value: unknown, delaiMs = 400): void {
  if (typeof window === "undefined") return;
  enAttente.set(key, value);

  const precedent = minuteurs.get(key);
  if (precedent) clearTimeout(precedent);

  minuteurs.set(
    key,
    setTimeout(() => {
      const valeur = enAttente.get(key);
      enAttente.delete(key);
      minuteurs.delete(key);
      writeJSON(key, valeur);
    }, delaiMs),
  );
}

/** Force l'écriture immédiate de tout ce qui attend. */
export function viderEcrituresEnAttente(): void {
  for (const [key, minuteur] of minuteurs) {
    clearTimeout(minuteur);
    writeJSON(key, enAttente.get(key));
  }
  minuteurs.clear();
  enAttente.clear();
}

if (typeof window !== "undefined") {
  // `pagehide` couvre la fermeture, le rechargement et le passage en
  // arrière-plan sur mobile — contrairement à `beforeunload`, il est fiable
  // sur iOS. Sans ça, les dernières lettres dictées seraient perdues.
  window.addEventListener("pagehide", viderEcrituresEnAttente);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") viderEcrituresEnAttente();
  });
}

/**
 * Purge les clés datées d'avant aujourd'hui.
 *
 * Sans ça, chaque journée laisserait une entrée derrière elle jusqu'à saturer
 * le quota. On garde uniquement le jour courant : l'historique, c'est le rôle
 * de daily_logs côté Supabase, pas du navigateur.
 */
export function pruneOldDailyKeys(base: string): void {
  if (typeof window === "undefined") return;
  const keep = dailyKey(base);
  const prefix = `${PREFIX}-${base}-`;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix) && key !== keep) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.error("[storage] purge impossible :", err);
  }
}
