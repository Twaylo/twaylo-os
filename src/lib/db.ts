import { createHash } from "node:crypto";
import { USER_ID, supabaseAdmin } from "./supabase";
import { REAL_DATA } from "./data-real";
import { NIVEAUX, niveauDepuisUrgence } from "./types";
import type { BlocageStocke, Contact, Habit, Niveau, Task, UneChose } from "./types";

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
  /** id d habitude -> options cochees aujourd hui. */
  faites: Record<string, string[]>;
  une_chose: UneChose;
  nutrition: { repas: unknown[] };
};

const ETAT_VIDE: EtatJour = {
  faites: {},
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

export async function creerTache(
  titre: string,
  categorie?: string,
  niveau: Niveau = "secondaire",
): Promise<TacheDB> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .insert({
      user_id: USER_ID,
      titre,
      categorie: categorie ?? null,
      urgence: NIVEAUX[niveau].urgence,
      cle: true,
    })
    .select("id, titre, statut, urgence, cle, categorie, completed_at")
    .single();

  if (error) throw error;
  return data as TacheDB;
}

/** Fait passer une tâche d'un niveau à l'autre. */
export async function changerNiveauTache(id: string, niveau: Niveau): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ urgence: NIVEAUX[niveau].urgence })
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function renommerTache(id: string, titre: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ titre })
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
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
 * Le nombre de jours d'affilée où Twaylo a fait vivre son OS.
 *
 * Un jour compte s'il porte une trace réelle : du texte dans le journal, ou au
 * moins une habitude cochée. Ouvrir l'app sans rien y mettre ne compte pas —
 * une série qui s'incrémente toute seule ne veut plus rien dire.
 *
 * La journée en cours n'interrompt pas la série tant qu'elle est vide : à 9 h
 * du matin on n'a encore rien fait, et remettre le compteur à zéro chaque nuit
 * serait absurde. On repart donc d'hier si aujourd'hui est vierge.
 */
export async function calculerSerie(aujourdhui: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("jour, habitudes, journal_texte")
    .eq("user_id", USER_ID)
    .neq("jour", JOUR_SENTINELLE)
    .lte("jour", aujourdhui)
    .order("jour", { ascending: false })
    .limit(400);

  if (error) throw error;
  if (!data) return 0;

  const remplis = new Set<string>();
  for (const ligne of data) {
    const etat = (ligne.habitudes ?? {}) as Partial<EtatJour>;
    const aHabitude = Object.values(etat.faites ?? {}).some((o) => o.length > 0);
    if (aHabitude || (ligne.journal_texte ?? "").trim().length > 0) {
      remplis.add(ligne.jour as string);
    }
  }
  if (remplis.size === 0) return 0;

  // On avance jour par jour vers le passé en construisant les dates en UTC :
  // soustraire 24 h à une date locale saute ou répète un jour aux changements
  // d'heure.
  const curseur = new Date(`${aujourdhui}T00:00:00Z`);
  if (!remplis.has(aujourdhui)) curseur.setUTCDate(curseur.getUTCDate() - 1);

  let serie = 0;
  while (remplis.has(curseur.toISOString().slice(0, 10))) {
    serie += 1;
    curseur.setUTCDate(curseur.getUTCDate() - 1);
  }
  return serie;
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
    niveau: niveauDepuisUrgence(l.urgence),
  }));
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

/** Renomme une vidéo sans changer son étape. */
export async function renommerVideo(id: string, titre: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("videos")
    .update({ titre })
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Sponsors — les deals chiffrés                                       */
/* ------------------------------------------------------------------ */

export type DealDB = {
  id: string;
  nom: string;
  etape: string;
  montant: number | null;
  note: string | null;
};

const COLONNES_DEAL = "id, nom, etape, montant, note";
export const ETAPES_DEAL = ["prospect", "negociation", "signe", "livre"] as const;

export async function lireDeals(): Promise<DealDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select(COLONNES_DEAL)
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as DealDB[];
}

export async function creerDeal(nom: string, etape = "prospect"): Promise<DealDB> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .insert({ user_id: USER_ID, nom, etape })
    .select(COLONNES_DEAL)
    .single();

  if (error) throw error;
  return data as DealDB;
}

export async function majDeal(
  id: string,
  patch: { etape?: string; montant?: number | null; note?: string | null; nom?: string },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("deals")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function supprimerDeal(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

/**
 * Les statistiques du haut de page, calculées et non saisies.
 *
 * Un chiffre qu'on recopie à la main finit toujours par mentir : celui-ci
 * découle des deals, donc il ne peut pas diverger.
 */
export function statsDeals(deals: DealDB[]) {
  const somme = (etapes: string[]) =>
    deals
      .filter((d) => etapes.includes(d.etape))
      .reduce((n, d) => n + (d.montant ?? 0), 0);

  const euro = (n: number) =>
    n === 0 ? "—" : `${n.toLocaleString("fr-FR")} €`;

  const clos = deals.filter((d) => d.etape === "signe" || d.etape === "livre").length;
  const taux = deals.length > 0 ? Math.round((clos / deals.length) * 100) : null;

  return [
    { label: "Pipeline total", value: euro(somme([...ETAPES_DEAL])), color: "#5fd39a" },
    { label: "Signés", value: euro(somme(["signe", "livre"])), color: "#61c9db" },
    { label: "En négociation", value: euro(somme(["negociation"])), color: "#e6c060" },
    {
      label: "Taux de closing",
      value: taux === null ? "—" : `${taux} %`,
      color: "#ff6ba3",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Habitudes — définitions et relevé du jour                           */
/* ------------------------------------------------------------------ */

/**
 * Les définitions d'habitudes ne sont pas quotidiennes : elles vivent sur une
 * date sentinelle, comme le recommande la spec de Miles pour les objectifs
 * (« store on a SENTINEL date so they never auto-clear »).
 *
 * Le 1er janvier 2000 n'est le jour de personne : impossible de le confondre
 * avec une vraie journée de Twaylo.
 */
const JOUR_SENTINELLE = "2000-01-01";

/** Ce que Twaylo pratique réellement, à défaut d'avoir encore choisi. */
const HABITUDES_DEFAUT: HabitudeDef[] = [
  { id: "sport", nom: "Sport", categorie: "Corps", options: ["Gym", "Étirements", "Vélo"] },
  { id: "sommeil", nom: "Sommeil", categorie: "Corps", options: [] },
  { id: "creatif", nom: "Session créative", categorie: "Création", options: ["Écriture", "Montage", "Tournage"] },
  { id: "veille", nom: "Veille / recherche", categorie: "Création", options: [] },
  { id: "communaute", nom: "Communauté", categorie: "Audience", options: ["Commentaires", "DM", "Stories"] },
  { id: "finance", nom: "Point finance", categorie: "Business", options: [] },
];

export type HabitudeDef = {
  id: string;
  nom: string;
  categorie: string;
  options: string[];
};

export async function lireHabitudesDef(): Promise<HabitudeDef[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;

  const definitions = (data?.habitudes as { definitions?: HabitudeDef[] } | null)
    ?.definitions;

  /*
   * Une liste vide n'est pas une liste absente.
   *
   * Le test précédent (`length > 0`) confondait les deux : supprimer ses six
   * habitudes une à une les faisait toutes réapparaître au rechargement, et
   * elles étaient même réécrites en base. Impossible de repartir d'une liste
   * vide. On ne sème donc que si la clé n'existe pas du tout.
   */
  if (Array.isArray(definitions)) return definitions;

  // Premier démarrage : on sème les habitudes par défaut.
  await ecrireHabitudesDef(HABITUDES_DEFAUT);
  return HABITUDES_DEFAUT;
}

/**
 * La ligne sentinelle héberge plusieurs réglages (habitudes, blocages).
 * Écrire l'un ne doit pas effacer l'autre : on relit avant de fusionner.
 */
async function majSentinelle(patch: Record<string, unknown>): Promise<void> {
  const db = supabaseAdmin();

  const { data, error: erreurLecture } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (erreurLecture) throw erreurLecture;

  const { error } = await db.from("daily_logs").upsert(
    {
      user_id: USER_ID,
      jour: JOUR_SENTINELLE,
      habitudes: { ...((data?.habitudes ?? {}) as object), ...patch },
    },
    { onConflict: "user_id,jour" },
  );

  if (error) throw error;
}

export async function ecrireHabitudesDef(definitions: HabitudeDef[]): Promise<void> {
  await majSentinelle({ definitions });
}


export type { BlocageStocke };

/**
 * L'ordre des tâches clés, comme simple liste d'identifiants.
 *
 * La table `tasks` n'a pas de colonne d'ordre et on ne peut plus faire de DDL
 * (le jeton d'accès a été révoqué). La liste vit donc sur la ligne sentinelle,
 * à côté des habitudes et des blocages. Les tâches absentes de la liste
 * viennent après, dans leur ordre de création.
 */
export async function lireOrdreTaches(): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;

  const ordre = (data?.habitudes as { ordreTaches?: string[] } | null)?.ordreTaches;
  return Array.isArray(ordre) ? ordre : [];
}

export async function ecrireOrdreTaches(ordreTaches: string[]): Promise<void> {
  await majSentinelle({ ordreTaches });
}

export async function lireBlocages(): Promise<BlocageStocke[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;

  const blocages = (data?.habitudes as { blocages?: BlocageStocke[] } | null)?.blocages;
  return Array.isArray(blocages) ? blocages : [];
}

export async function ecrireBlocages(blocages: BlocageStocke[]): Promise<void> {
  await majSentinelle({ blocages });
}

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

/**
 * Un objectif tel qu'il vit en base.
 *
 * La progression et les étapes sont rangées en JSON dans la colonne `cible`,
 * qui est du texte libre. Ce n'est pas élégant, et c'est assumé : la table
 * `goals` n'a ni colonne de progression ni colonne d'étapes, et le jeton
 * d'accès ayant été révoqué, aucune migration n'est possible. Le même
 * compromis que la ligne sentinelle des habitudes — documenté plutôt que subi.
 */
export type ObjectifDB = {
  id: string;
  objectif: string;
  portee: string;
  statut: string;
  categorie: string | null;
  cible: string | null;
  echeance: string | null;
};

export type ContenuCible = {
  /** 0 à 100. */
  pct: number;
  /** Le chiffre affiché à côté de la barre : « 2/3 », « 87k »… */
  valeur: string;
  etapes: { texte: string; fait: boolean }[];
};

const CIBLE_VIDE: ContenuCible = { pct: 0, valeur: "", etapes: [] };

export function lireCible(brut: string | null): ContenuCible {
  if (!brut) return { ...CIBLE_VIDE };
  try {
    const o = JSON.parse(brut) as Partial<ContenuCible>;
    return {
      pct: typeof o.pct === "number" ? Math.min(100, Math.max(0, o.pct)) : 0,
      valeur: typeof o.valeur === "string" ? o.valeur : "",
      etapes: Array.isArray(o.etapes)
        ? o.etapes
            .filter((e): e is { texte: string; fait: boolean } =>
              typeof e?.texte === "string" && typeof e?.fait === "boolean")
            .slice(0, 12)
        : [],
    };
  } catch {
    // Ancienne valeur écrite à la main : on la traite comme un simple libellé.
    return { ...CIBLE_VIDE, valeur: brut };
  }
}

export async function lireObjectifs(): Promise<ObjectifDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .select("id, objectif, portee, statut, categorie, cible, echeance")
    .eq("user_id", USER_ID)
    .neq("statut", "abandonne")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as ObjectifDB[];
}

export async function creerObjectif(
  objectif: string,
  portee: string,
  cible: ContenuCible,
): Promise<ObjectifDB> {
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .insert({
      user_id: USER_ID,
      objectif,
      portee,
      cible: JSON.stringify(cible),
    })
    .select("id, objectif, portee, statut, categorie, cible, echeance")
    .single();

  if (error) throw error;
  return data as ObjectifDB;
}

export async function majObjectif(
  id: string,
  patch: { objectif?: string; cible?: ContenuCible; statut?: string },
): Promise<void> {
  const champs: Record<string, unknown> = {};
  if (patch.objectif !== undefined) champs.objectif = patch.objectif;
  if (patch.cible !== undefined) champs.cible = JSON.stringify(patch.cible);
  if (patch.statut !== undefined) champs.statut = patch.statut;
  if (Object.keys(champs).length === 0) return;

  const { error } = await supabaseAdmin()
    .from("goals")
    .update(champs)
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}

export async function supprimerObjectif(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) throw error;
}
