"use client";

import { localDateKey } from "./local-date";
import { KEYS, effacerCle, readJSON, writeJSON } from "./storage";

/**
 * La synchronisation avec la base.
 *
 * Le principe, qui vient de la spec Partie 6 : le stockage local reste la
 * couche instantanée, la base devient la couche durable. Twaylo coche une
 * habitude, l'écran répond immédiatement (état React), le navigateur garde
 * une copie (localStorage), et la base reçoit l'écriture peu après.
 *
 * Conséquence importante : couper le réseau ne casse rien. L'app continue de
 * fonctionner sur son cache local, et l'écriture repartira à la prochaine
 * modification. C'est le comportement qu'il faut quand on tourne en Bolivie
 * avec une 4G qui va et vient.
 */

type Etat = "inconnu" | "connecte" | "hors_ligne" | "erreur";

let etatCourant: Etat = "inconnu";
const abonnes = new Set<(e: Etat) => void>();

function poser(e: Etat) {
  if (e === etatCourant) return;
  etatCourant = e;
  for (const f of abonnes) f(e);
}

export function etatSync(): Etat {
  return etatCourant;
}

export function surChangementSync(f: (e: Etat) => void): () => void {
  abonnes.add(f);
  f(etatCourant);
  return () => abonnes.delete(f);
}

/* ---------- Lecture ---------- */

export type EtatDistant = {
  connecte: boolean;
  taches?: {
    id: string;
    text: string;
    done: boolean;
    categorie?: string;
    niveau?: "principal" | "secondaire" | "annexe";
    /** Jour local de la coche — distingue « faite » de « faite aujourd'hui ». */
    faiteLe?: string;
  }[];
  // `prive` déclaré ici aussi : sans lui, le `as Habit[]` de l'appelant
  // masquait au compilateur la perte du floutage.
  habitudes?: {
    id: string;
    nom: string;
    categorie: string;
    options: string[];
    prive?: boolean;
  }[];
  faites?: Record<string, string[]>;
  /** Jours d'affilée réellement remplis, calculé en base. */
  serie?: number;
  blocages?: { id: string; texte: string; proprietaire: string; depuis: string }[];
  journal?: string;
  uneChose?: { texte: string; fait: boolean };
  nutrition?: { repas: unknown[] };
  captures?: { id: string; text: string; type: string }[];
  pipeline?: unknown[];
  contacts?: unknown[];
  deals?: unknown[];
  dealStats?: { label: string; value: string; color: string }[];
};

/**
 * Vrai quand l'adresse ouverte ne sert PAS l'OS.
 *
 * Le déploiement héberge deux sites : l'OS sur ses adresses à lui, les
 * Tway'tools partout ailleurs. Depuis une adresse « outils », toutes les
 * routes de l'OS répondent « introuvable » — l'écran s'affiche pourtant, sorti
 * du cache du navigateur, et RIEN ne s'enregistre. On tape une tâche, elle
 * disparaît ; on coche, ça ne tient pas. Sans un mot, c'est indéchiffrable.
 *
 * Un 404 sur `/api/state` ne peut vouloir dire que ça : la route existe dans
 * tous les déploiements de l'OS.
 */
export let mauvaiseAdresse = false;

export async function chargerEtat(jour: string): Promise<EtatDistant | null> {
  try {
    const res = await fetch(`/api/state?jour=${jour}`, { cache: "no-store" });
    if (res.status === 404) mauvaiseAdresse = true;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mauvaiseAdresse = false;
    const data = (await res.json()) as EtatDistant;
    poser(data.connecte ? "connecte" : "hors_ligne");
    return data;
  } catch (err) {
    console.error("[sync] chargement impossible :", err);
    poser("erreur");
    return null;
  }
}

/* ---------- Écriture différée ---------- */

/*
 * Une écriture par seconde au maximum, et une seule en vol à la fois.
 *
 * Sans ça, incrémenter une habitude cinq fois d'affilée déclencherait cinq
 * requêtes, dont l'ordre d'arrivée n'est pas garanti — la troisième pourrait
 * atterrir après la cinquième et rétablir un compteur périmé. Ici la dernière
 * intention gagne toujours.
 */
const DELAI_MS = 1000;

/**
 * Les écritures qui attendent, RANGÉES PAR JOUR.
 *
 * Elles tenaient dans un seul objet fusionné. Tant que la file ne survivait
 * pas à la fermeture, ça passait : tout ce qui s'y trouvait datait forcément
 * de la même session. Maintenant qu'elle est gardée sur le téléphone pour
 * repartir au retour du réseau, une coche d'hier peut y croiser une coche
 * d'aujourd'hui — et la fusion écrasait la date avec la plus récente, donc
 * écrivait la journée d'hier sur celle d'aujourd'hui. Une entrée par jour,
 * un envoi par jour.
 */
type File = Record<string, Record<string, unknown>>;

let enAttente: File = {};
let minuteur: ReturnType<typeof setTimeout> | null = null;
let envoiEnCours = false;
/** Échecs consécutifs — espace les reprises au lieu de marteler le réseau. */
let echecs = 0;

function resteQuelqueChose(): boolean {
  return Object.keys(enAttente).length > 0;
}

/** La file, écrite sur le téléphone : elle doit survivre à la fermeture. */
function memoriserFile(): void {
  if (resteQuelqueChose()) writeJSON(KEYS.fileEcritures, enAttente);
  else effacerCle(KEYS.fileEcritures);
}

async function envoyer() {
  if (envoiEnCours || !resteQuelqueChose()) return;

  const charge = enAttente;
  enAttente = {};
  envoiEnCours = true;

  /*
   * La charge est RENDUE à la file, jamais jetée.
   *
   * Elle était vidée avant l'envoi et perdue dès que celui-ci échouait : une
   * habitude cochée dans le métro, une note écrite hors réseau, ne repartaient
   * jamais — même une fois la connexion revenue. Ce qui est arrivé entre-temps
   * reste prioritaire : c'est l'intention la plus récente qui doit gagner.
   */
  const rendre = (jour: string, patch: Record<string, unknown>) => {
    enAttente[jour] = { ...patch, ...(enAttente[jour] ?? {}) };
  };

  let unEchec = false;
  let dernierPersiste = true;

  try {
    for (const [jour, patch] of Object.entries(charge)) {
      try {
        const res = await fetch("/api/daily", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        dernierPersiste = Boolean(data.persiste);
      } catch (err) {
        console.error(`[sync] écriture du ${jour} impossible :`, err);
        rendre(jour, patch);
        unEchec = true;
      }
    }

    if (unEchec) {
      poser("erreur");
      echecs += 1;
    } else {
      poser(dernierPersiste ? "connecte" : "hors_ligne");
      echecs = 0;
    }
  } finally {
    envoiEnCours = false;
    memoriserFile();
    // Une modification est arrivée pendant l'envoi, ou l'envoi a échoué : on
    // repart.
    if (resteQuelqueChose()) planifier();
  }
}

/** Une seconde, puis de plus en plus d'espace tant que ça échoue (30 s au plus). */
function delaiCourant(): number {
  return Math.min(DELAI_MS * 2 ** Math.min(echecs, 5), 30_000);
}

function planifier() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(() => {
    minuteur = null;
    void envoyer();
  }, delaiCourant());
}

/** Empile une modification de la journée ; l'envoi part une seconde plus tard. */
export function synchroniserJour(patch: Record<string, unknown>): void {
  const jour = typeof patch.jour === "string" ? patch.jour : localDateKey();
  enAttente[jour] = { ...(enAttente[jour] ?? {}), ...patch, jour };
  memoriserFile();
  planifier();
}

/** Force l'envoi immédiat de ce qui attend (fermeture d'onglet). */
export function viderSync(): void {
  if (minuteur) {
    clearTimeout(minuteur);
    minuteur = null;
  }
  if (!resteQuelqueChose()) return;

  /*
   * `sendBeacon` survit à la fermeture de l'onglet, contrairement à `fetch`
   * que le navigateur annule.
   *
   * La file n'est vidée QUE si le navigateur a bien pris la charge : il
   * refuse au-delà d'une certaine taille (un journal un peu long suffit) en
   * renvoyant `false`, et la vider d'avance perdait alors la journée. Refusée,
   * elle reste en attente — l'onglet peut ne pas se fermer (retour de
   * visibilité), et l'envoi repartira.
   */
  for (const [jour, patch] of Object.entries(enAttente)) {
    try {
      const pris = navigator.sendBeacon(
        "/api/daily",
        new Blob([JSON.stringify(patch)], { type: "application/json" }),
      );
      if (pris) delete enAttente[jour];
      else
        console.error(
          `[sync] envoi final du ${jour} refusé par le navigateur (charge trop lourde ?)`,
        );
    } catch (err) {
      console.error(`[sync] envoi final du ${jour} impossible :`, err);
    }
  }

  /*
   * Et surtout : ce qui n'est pas parti est ÉCRIT SUR LE TÉLÉPHONE.
   *
   * `sendBeacon` renvoie `true` dès que le navigateur accepte la charge — pas
   * quand le serveur l'a reçue. Sans réseau, il l'accepte puis la jette en
   * silence. Hors ligne, on ne le croit donc pas sur parole : la file reste
   * écrite, et le prochain démarrage la renverra.
   */
  if (typeof navigator !== "undefined" && navigator.onLine === false) enAttente = { ...enAttente };
  memoriserFile();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", viderSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") viderSync();
  });

  /*
   * Ce qui restait de la session précédente repart tout de suite.
   *
   * C'est ce qui fait la différence entre « l'app garde tes coches à l'écran »
   * et « tes coches finissent en base » : une habitude cochée dans le métro,
   * l'application refermée avant le retour du réseau, arrivait jusqu'ici sans
   * jamais être enregistrée.
   */
  const restes = readJSON<File>(KEYS.fileEcritures, {});
  if (restes && Object.keys(restes).length > 0) {
    enAttente = { ...restes, ...enAttente };
    planifier();
  }

  /*
   * Le retour du réseau relance immédiatement, sans attendre la fin de
   * l'espacement des reprises — qui peut atteindre trente secondes.
   */
  window.addEventListener("online", () => {
    echecs = 0;
    if (resteQuelqueChose()) planifier();
  });
}

/* ---------- Tâches ---------- */

export async function basculerTacheDistante(id: string, faite: boolean): Promise<void> {
  try {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, faite }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    poser("connecte");
  } catch (err) {
    console.error("[sync] bascule de tâche impossible :", err);
    poser("erreur");
  }
}
