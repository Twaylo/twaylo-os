import { createHash } from "node:crypto";
import { USER_ID, supabaseAdmin } from "./supabase";
import { REAL_DATA } from "./data-real";
import type { Contact, Habit, Task, UneChose } from "./types";

/**
 * L'accès aux données, côté serveur uniquement.
 *
 * Tout passe par la clé service role, qui contourne RLS. C'est voulu : le
 * navigateur ne parle jamais directement à Postgres, il parle aux routes API
 * de cette app, qui sont elles-mêmes derrière la porte à mot de passe. La clé
 * anon reste bloquée par RLS et ne peut rien lire même si elle fuite.
 */

/**
 * L'état d'une journée.
 *
 * Rangé dans `daily_logs.habitudes`, qui est en JSON libre. Le nom de la
 * colonne est plus étroit que son contenu — la migration 0002 corrigerait ça
 * en déplaçant vers une colonne `notes`, mais elle n'a pas été appliquée
 * (voir son en-tête). Fonctionnellement c'est identique ; c'est une dette de
 * nommage, assumée et documentée plutôt que subie.
 */
export type EtatJour = {
  compteurs: Record<string, number>;
  une_chose: UneChose;
  nutrition: { repas: unknown[] };
};

const ETAT_VIDE: EtatJour = {
  compteurs: {},
  une_chose: { texte: "", fait: false },
  nutrition: { repas: [] },
};

/* ------------------------------------------------------------------ */
/* Tâches                                                              */
/* ------------------------------------------------------------------ */

export type TacheDB = {
  id: string;
  titre: string;
  statut: string;
  urgence: string;
  cle: boolean;
  categorie: string | null;
  completed_at: string | null;
};

/**
 * Identifiant stable dérivé du texte.
 *
 * Sert à rendre l'amorçage rejouable sans risque. La première version semait
 * les tâches « si la table est vide » — et trois chargements simultanés ont
 * tous vu une table vide, produisant 15 tâches au lieu de 5. Une lecture qui
 * écrit est toujours exposée à ça.
 *
 * Avec un identifiant déduit du titre, semer deux fois écrit deux fois la
 * même ligne : le second passage ne fait rien. La concurrence devient sans
 * effet, au lieu d'être seulement improbable.
 */
function uuidStable(texte: string): string {
  const h = createHash("sha1").update(`twaylo:${texte}`).digest("hex");
  // Format UUID v5 : on force la version (5) et la variante (8/9/a/b).
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    `${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}

/**
 * Au tout premier démarrage, la table est vide. Plutôt qu'un dashboard
 * désert, on y sème les tâches réelles de Twaylo (spec Partie 11).
 *
 * `ignoreDuplicates` fait de l'amorçage un no-op dès la deuxième fois : une
 * tâche semée puis supprimée par Twaylo ne réapparaît donc pas non plus,
 * puisqu'on ne sème que si la table est entièrement vide.
 */
export async function lireTaches(): Promise<TacheDB[]> {
  const db = supabaseAdmin();
  const COLONNES = "id, titre, statut, urgence, cle, categorie, completed_at";

  const { data, error } = await db
    .from("tasks")
    .select(COLONNES)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length > 0) return data as TacheDB[];

  const { error: erreurSemis } = await db.from("tasks").upsert(
    REAL_DATA.tasks.map((t) => ({
      id: uuidStable(t.text),
      user_id: USER_ID,
      titre: t.text,
      categorie: t.categorie ?? null,
      urgence: "semaine",
      cle: true,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (erreurSemis) throw erreurSemis;

  // Relecture plutôt que d'utiliser le retour de l'upsert : avec
  // `ignoreDuplicates`, il ne renvoie que les lignes réellement insérées.
  const { data: apres, error: erreurRelecture } = await db
    .from("tasks")
    .select(COLONNES)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (erreurRelecture) throw erreurRelecture;
  return apres as TacheDB[];
}

export async function basculerTache(id: string, faite: boolean): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({
      statut: faite ? "faite" : "ouverte",
      completed_at: faite ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function creerTache(titre: string, categorie?: string): Promise<TacheDB> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .insert({
      user_id: USER_ID,
      titre,
      categorie: categorie ?? null,
      urgence: "semaine",
      cle: true,
    })
    .select("id, titre, statut, urgence, cle, categorie, completed_at")
    .single();

  if (error) throw error;
  return data as TacheDB;
}

export async function supprimerTache(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Journée                                                             */
/* ------------------------------------------------------------------ */

export async function lireJour(
  jour: string,
): Promise<{ etat: EtatJour; journal: string }> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes, journal_texte")
    .eq("user_id", USER_ID)
    .eq("jour", jour)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { etat: ETAT_VIDE, journal: "" };

  return {
    etat: { ...ETAT_VIDE, ...((data.habitudes ?? {}) as Partial<EtatJour>) },
    journal: data.journal_texte ?? "",
  };
}

/**
 * Écrit la journée. Fusionne au lieu d'écraser : la carte Nutrition et la
 * carte Habitudes écrivent chacune de leur côté, et l'une ne doit pas effacer
 * le travail de l'autre.
 */
export async function ecrireJour(
  jour: string,
  patch: { etat?: Partial<EtatJour>; journal?: string },
): Promise<void> {
  const db = supabaseAdmin();
  const actuel = await lireJour(jour);

  const ligne: Record<string, unknown> = {
    user_id: USER_ID,
    jour,
    habitudes: { ...actuel.etat, ...(patch.etat ?? {}) },
  };
  if (patch.journal !== undefined) ligne.journal_texte = patch.journal;

  const { error } = await db
    .from("daily_logs")
    .upsert(ligne, { onConflict: "user_id,jour" });

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Vidéos — le pipeline de contenu                                     */
/* ------------------------------------------------------------------ */

export type VideoDB = {
  id: string;
  titre: string;
  statut: string;
  format: string;
  priorite: number;
};

const COLONNES_VIDEO = "id, titre, statut, format, priorite";

/** L'ordre des étapes. Sert à faire avancer une vidéo d'un cran. */
export const ETAPES = [
  "idee",
  "scenario",
  "tournage",
  "montage",
  "pret",
  "publie",
] as const;

export async function lireVideos(): Promise<VideoDB[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("videos")
    .select(COLONNES_VIDEO)
    .eq("user_id", USER_ID)
    .order("priorite", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length > 0) return data as VideoDB[];

  // Même amorçage idempotent que les tâches : identifiant déduit du titre,
  // donc deux semis concurrents écrivent la même ligne.
  const semences = REAL_DATA.pipeline.flatMap((col) =>
    col.videos.map((v) => ({
      id: uuidStable(v.title),
      user_id: USER_ID,
      titre: v.title,
      statut: col.status,
      format: v.format.toLowerCase() === "short" ? "short" : "long",
    })),
  );

  if (semences.length > 0) {
    const { error: erreurSemis } = await db
      .from("videos")
      .upsert(semences, { onConflict: "id", ignoreDuplicates: true });
    if (erreurSemis) throw erreurSemis;
  }

  const { data: apres, error: erreurRelecture } = await db
    .from("videos")
    .select(COLONNES_VIDEO)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (erreurRelecture) throw erreurRelecture;
  return apres as VideoDB[];
}

export async function deplacerVideo(id: string, statut: string): Promise<void> {
  if (!ETAPES.includes(statut as (typeof ETAPES)[number])) {
    throw new Error(`Étape inconnue : ${statut}`);
  }
  const { error } = await supabaseAdmin()
    .from("videos")
    .update({
      statut,
      publie_le: statut === "publie" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function creerVideo(titre: string, format = "long"): Promise<VideoDB> {
  const { data, error } = await supabaseAdmin()
    .from("videos")
    .insert({ user_id: USER_ID, titre, statut: "idee", format })
    .select(COLONNES_VIDEO)
    .single();

  if (error) throw error;
  return data as VideoDB;
}

export async function supprimerVideo(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("videos")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Contacts                                                            */
/* ------------------------------------------------------------------ */

export type ContactDB = {
  id: string;
  nom: string;
  type: string;
  relation: string;
  role: string | null;
  prochaine_action: string | null;
};

const COLONNES_CONTACT = "id, nom, type, relation, role, prochaine_action";

export async function lireContacts(): Promise<ContactDB[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("contacts")
    .select(COLONNES_CONTACT)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length > 0) return data as ContactDB[];

  const { error: erreurSemis } = await db.from("contacts").upsert(
    REAL_DATA.contacts.map((c) => ({
      id: uuidStable(c.nom),
      user_id: USER_ID,
      nom: c.nom,
      type: c.type,
      relation: c.relation,
      role: c.role ?? null,
      prochaine_action: c.prochaineAction ?? null,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (erreurSemis) throw erreurSemis;

  const { data: apres, error: erreurRelecture } = await db
    .from("contacts")
    .select(COLONNES_CONTACT)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (erreurRelecture) throw erreurRelecture;
  return apres as ContactDB[];
}

export async function majContact(
  id: string,
  patch: { relation?: string; prochaine_action?: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("contacts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function creerContact(nom: string, type = "collab"): Promise<ContactDB> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .insert({ user_id: USER_ID, nom, type, relation: "froid" })
    .select(COLONNES_CONTACT)
    .single();

  if (error) throw error;
  return data as ContactDB;
}

export async function supprimerContact(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Captures                                                            */
/* ------------------------------------------------------------------ */

export type CaptureDB = { id: string; texte: string; type: string };

/** Les dernières captures non traitées — la boîte de réception. */
export async function lireCaptures(limite = 4): Promise<CaptureDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("captures")
    .select("id, texte, type")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data as CaptureDB[];
}

/* ------------------------------------------------------------------ */
/* Conversion vers les formes attendues par l'interface                */
/* ------------------------------------------------------------------ */

export function versTaches(lignes: TacheDB[]): (Task & { id: string })[] {
  return lignes.map((l) => ({
    id: l.id,
    text: l.titre,
    done: l.statut === "faite",
    categorie: l.categorie ?? undefined,
  }));
}

/**
 * Les habitudes elles-mêmes (noms, catégories, objectifs) restent définies
 * dans le code : ce sont des rituels choisis, pas des données saisies. Seuls
 * leurs compteurs du jour viennent de la base.
 */
export function versHabitudes(compteurs: Record<string, number>): Habit[] {
  return REAL_DATA.habits.map((h) => ({ ...h, fait: compteurs[h.name] ?? 0 }));
}

/**
 * Reconstruit les colonnes du pipeline à partir des lignes de la base.
 *
 * Les étapes (noms, couleurs, ordre) restent définies dans le code : ce sont
 * des constantes de l'atelier, pas des données. Seules les vidéos viennent de
 * Postgres.
 */
export function versPipeline(lignes: VideoDB[]) {
  return REAL_DATA.pipeline.map((col) => ({
    ...col,
    videos: lignes
      .filter((v) => v.statut === col.status)
      .map((v) => ({
        id: v.id,
        title: v.titre,
        format: (v.format === "short" ? "Short" : "Long") as "Short" | "Long",
      })),
  }));
}

export function versContacts(lignes: ContactDB[]) {
  return lignes.map((c) => ({
    id: c.id,
    nom: c.nom,
    type: c.type as Contact["type"],
    relation: c.relation as Contact["relation"],
    role: c.role ?? undefined,
    prochaineAction: c.prochaine_action ?? undefined,
  }));
}
