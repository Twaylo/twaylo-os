"use client";

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
  taches?: { id: string; text: string; done: boolean; categorie?: string }[];
  habitudes?: { id: string; nom: string; categorie: string; options: string[] }[];
  faites?: Record<string, string[]>;
  /** Jours d'affilée réellement remplis, calculé en base. */
  serie?: number;
  journal?: string;
  uneChose?: { texte: string; fait: boolean };
  nutrition?: { repas: unknown[] };
  captures?: { id: string; text: string; type: string }[];
  pipeline?: unknown[];
  contacts?: unknown[];
  deals?: unknown[];
  dealStats?: { label: string; value: string; color: string }[];
};

export async function chargerEtat(jour: string): Promise<EtatDistant | null> {
  try {
    const res = await fetch(`/api/state?jour=${jour}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

let enAttente: Record<string, unknown> | null = null;
let minuteur: ReturnType<typeof setTimeout> | null = null;
let envoiEnCours = false;

async function envoyer() {
  if (envoiEnCours || !enAttente) return;

  const charge = enAttente;
  enAttente = null;
  envoiEnCours = true;

  try {
    const res = await fetch("/api/daily", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(charge),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    poser(data.persiste ? "connecte" : "hors_ligne");
  } catch (err) {
    console.error("[sync] écriture impossible :", err);
    poser("erreur");
  } finally {
    envoiEnCours = false;
    // Une modification est arrivée pendant l'envoi : on repart.
    if (enAttente) planifier();
  }
}

function planifier() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(() => {
    minuteur = null;
    void envoyer();
  }, DELAI_MS);
}

/** Empile une modification de la journée ; l'envoi part une seconde plus tard. */
export function synchroniserJour(patch: Record<string, unknown>): void {
  enAttente = { ...(enAttente ?? {}), ...patch };
  planifier();
}

/** Force l'envoi immédiat de ce qui attend (fermeture d'onglet). */
export function viderSync(): void {
  if (minuteur) {
    clearTimeout(minuteur);
    minuteur = null;
  }
  if (!enAttente) return;

  // `sendBeacon` survit à la fermeture de l'onglet, contrairement à `fetch`
  // que le navigateur annule.
  const charge = enAttente;
  enAttente = null;
  try {
    navigator.sendBeacon(
      "/api/daily",
      new Blob([JSON.stringify(charge)], { type: "application/json" }),
    );
  } catch (err) {
    console.error("[sync] envoi final impossible :", err);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", viderSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") viderSync();
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
