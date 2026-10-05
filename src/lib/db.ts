import { createHash } from "node:crypto";
import { USER_ID, uid, supabaseAdmin } from "./supabase";
import { localDateKey } from "./local-date";
import { JOUR_SENTINELLE, lireSentinelle, majSentinelle } from "./sentinelle";
import {
  BLOC_PAR_DEFAUT,
  OBJECTIFS_P90,
  blocDe,
  encoderMeta,
  encoderOp,
  etapeVersDB,
  urgenceDepuisBloc,
  type IdBloc,
  type EtapeOp,
} from "./p90";
import { SEMIS_OPS, SEMIS_TACHES, blocSemis } from "./p90-semis";

/**
 * L'accès aux données du cockpit PROJECT 90, côté serveur uniquement.
 *
 * Trois tables, et c'est tout : `tasks` (la todo et le Kanban, la MÊME donnée),
 * `deals` (les OP sponsors) et `goals` (les cinq objectifs). Ce fichier en
 * portait onze — habitudes, vidéos, contacts, captures, revenus, skills,
 * blocages, journées types, nutrition, séries, jeton YouTube. Tout ça est
 * parti avec les onglets qui s'en servaient.
 *
 * Tout passe par la clé service role, qui contourne RLS. C'est voulu : le
 * navigateur ne parle jamais directement à Postgres, il parle aux routes API
 * de cette app, qui sont elles-mêmes derrière la porte à mot de passe. La clé
 * anon reste bloquée par RLS et ne peut rien lire même si elle fuite.
 */

/* ------------------------------------------------------------------ */
/* Tâches — la todo ET le Kanban                                       */
/* ------------------------------------------------------------------ */

export type TacheDB = {
  id: string;
  titre: string;
  statut: string;
  /** Porte le BLOC HORAIRE : quatre valeurs contraintes, quatre blocs. */
  urgence: string;
  cle: boolean;
  /** Porte le JSON de la meta P90 (objectif, responsables, échéance, impact). */
  categorie: string | null;
  completed_at: string | null;
  created_at?: string | null;
};

const COLONNES_TACHE = "id, titre, statut, urgence, cle, categorie, completed_at, created_at";

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
 *
 * LE COMPTE ENTRE DANS L'EMPREINTE, et ce n'est pas un détail de propreté.
 * Sans lui, deux OS différents déduisaient le MÊME identifiant du même titre,
 * les lignes du second tombaient sur celles du premier et étaient
 * silencieusement ignorées — et le nouvel OS s'ouvrait définitivement vide.
 */
function uuidStable(compte: string, texte: string): string {
  const h = createHash("sha1").update(`twaylo:${compte}:${texte}`).digest("hex");
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
 * Ce semis a-t-il déjà eu lieu, une fois pour toutes ?
 *
 * Le drapeau vit sur la ligne sentinelle. Sans lui, « table vide » serait
 * confondu avec « jamais semé », et vider délibérément une liste la ferait
 * repousser au chargement suivant — on ne pourrait jamais atteindre une liste
 * vide, qui est le cas normal d'une journée bouclée.
 */
async function dejaSeme(cle: string): Promise<boolean> {
  return (await lireSentinelle())[cle] === true;
}

/**
 * Le plan des 90 jours ne concerne QUE l'OS de Twaylo.
 *
 * Ce ne sont pas des données de démonstration : ce sont ses objectifs, ses
 * échéances et ses coéquipiers. Les semer dans l'OS de quelqu'un d'autre lui
 * ferait trouver « Dépôt INPI » dans sa liste. Un OS neuf démarre donc vide.
 *
 * Le drapeau est posé quand même : sans lui, la question « faut-il semer ? »
 * se reposerait à chaque lecture d'une liste vide.
 */
async function semisInterdit(cle: string): Promise<boolean> {
  if ((await uid()) === USER_ID) return false;
  await majSentinelle({ [cle]: true });
  return true;
}

/**
 * La todo : tout ce qui n'est pas archivé.
 *
 * Plus d'archivage automatique, et c'est un changement de fond. L'ancienne
 * version faisait glisser aux Oubliés toute tâche non prioritaire passée
 * quatre jours sans être cochée. Dans un cockpit dont la todo est pilotée par
 * les ÉCHÉANCES, cette règle effaçait de l'écran des tâches du plan encore à
 * venir — « Clôture des précommandes », datée du 30 novembre, aurait disparu
 * le 9 octobre. Les Oubliés restent, mais comme filet : on y tombe quand on
 * supprime une tâche, jamais tout seul.
 */
export async function lireTaches(): Promise<TacheDB[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("tasks")
    .select(COLONNES_TACHE)
    .eq("user_id", (await uid()))
    .neq("statut", "abandonnee")
    .order("created_at", { ascending: true });

  if (error) throw error;
  const vivantes = (data ?? []) as TacheDB[];
  if (vivantes.length > 0) return vivantes;

  // Table vide et semis déjà fait : Twaylo a tout supprimé, on respecte.
  if (await dejaSeme("p90TachesSemees")) return [];
  if (await semisInterdit("p90TachesSemees")) return [];

  const moi = await uid();
  const { error: erreurSemis } = await db.from("tasks").upsert(
    SEMIS_TACHES.map((t) => ({
      id: uuidStable(moi, t.titre),
      user_id: moi,
      titre: t.titre,
      statut: t.enCours ? "en_cours" : "ouverte",
      urgence: urgenceDepuisBloc(blocSemis(t)),
      cle: true,
      categorie: encoderMeta({
        objectif: t.objectif,
        responsables: t.responsables,
        echeance: t.echeance,
        impact: t.impact ?? 2,
        bloque: false,
      }),
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (erreurSemis) throw erreurSemis;

  // Le semis n'aura pas lieu deux fois : marqué avant même la relecture.
  await majSentinelle({ p90TachesSemees: true });

  /*
   * L'ordre d'affichage suit le plan, pas l'heure d'insertion.
   *
   * Les 26 lignes partent dans un seul `upsert` : leurs `created_at` sont à la
   * milliseconde près identiques et leur ordre de retour n'est pas garanti. Le
   * plan est rangé par échéance — l'écrire dans la liste d'ordre fait que la
   * première todo de Twaylo s'ouvre dans l'ordre du calendrier.
   */
  try {
    await ecrireOrdreTaches(SEMIS_TACHES.map((t) => uuidStable(moi, t.titre)));
  } catch (err) {
    console.error("[taches] ordre du semis impossible :", err);
  }

  // Relecture plutôt que le retour de l'upsert : avec `ignoreDuplicates`, il
  // ne renvoie que les lignes réellement insérées.
  const { data: apres, error: erreurRelecture } = await db
    .from("tasks")
    .select(COLONNES_TACHE)
    .eq("user_id", (await uid()))
    .neq("statut", "abandonnee")
    .order("created_at", { ascending: true });

  if (erreurRelecture) throw erreurRelecture;
  return (apres ?? []) as TacheDB[];
}

/** Les quatre statuts que la contrainte de la table accepte. */
const STATUTS = ["ouverte", "en_cours", "faite", "abandonnee"];

/**
 * UN SEUL correctif pour une tâche : statut, titre, meta, bloc.
 *
 * Il y avait quatre fonctions — cocher, renommer, changer de niveau, geler —
 * et déplacer une carte du Kanban devait en appeler deux, dans le bon ordre,
 * sans garantie que la seconde aboutisse. Un geste = une écriture.
 *
 * `completed_at` suit le statut sans qu'on ait à y penser : il portait la date
 * de coche et pouvait rester accroché à une tâche décochée, qui comptait alors
 * comme faite dans tout ce qui lit cette colonne.
 */
export async function majTache(
  id: string,
  patch: { statut?: string; titre?: string; categorie?: string | null; bloc?: IdBloc },
): Promise<void> {
  const champs: Record<string, unknown> = {};

  if (patch.statut !== undefined) {
    if (!STATUTS.includes(patch.statut)) throw new Error(`Statut inconnu : ${patch.statut}`);
    champs.statut = patch.statut;
    champs.completed_at = patch.statut === "faite" ? new Date().toISOString() : null;
  }
  if (patch.titre !== undefined) champs.titre = patch.titre;
  if (patch.categorie !== undefined) champs.categorie = patch.categorie;
  if (patch.bloc !== undefined) champs.urgence = urgenceDepuisBloc(patch.bloc);
  if (Object.keys(champs).length === 0) return;

  const { error } = await supabaseAdmin()
    .from("tasks")
    .update(champs)
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function creerTache(
  titre: string,
  categorie?: string | null,
  bloc: IdBloc = BLOC_PAR_DEFAUT,
): Promise<TacheDB> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .insert({
      user_id: (await uid()),
      titre,
      categorie: categorie ?? null,
      // `blocDe` borne la valeur : un bloc inconnu vaut Opérations plutôt que
      // de faire échouer l'insertion sur la contrainte de la colonne.
      urgence: blocDe(bloc).urgence,
      cle: true,
    })
    .select(COLONNES_TACHE)
    .single();

  if (error) throw error;
  const tache = data as TacheDB;

  /*
   * La nouvelle tâche prend la TÊTE de la pile, pas la queue.
   *
   * L'ordre d'affichage vient de la liste rangée sur la sentinelle, et une
   * tâche absente de cette liste est renvoyée en dernier. Sans ce placement,
   * ce que Twaylo vient de taper atterrissait tout en bas d'une liste de vingt
   * lignes — c'est-à-dire hors de vue.
   *
   * L'échec n'annule pas la création : au pire la tâche s'affiche en bas, ce
   * qui reste très loin de mériter de perdre ce qui vient d'être écrit.
   */
  try {
    await placerEnTeteOrdre(tache.id);
  } catch (err) {
    console.error("[taches] placement en tête impossible :", err);
  }

  return tache;
}

/** La liste d'ordre est bornée : au-delà, les plus anciennes places tombent. */
const MAX_ORDRE = 300;

/**
 * Met un identifiant en tête de la liste d'ordre — en vérifiant qu'il y est
 * resté.
 *
 * Lire puis écrire la sentinelle n'est pas atomique : deux tâches tapées coup
 * sur coup partent en deux invocations serverless distinctes, qui lisent la
 * MÊME liste avant que l'une ou l'autre n'écrive. La seconde écrasait alors le
 * placement de la première, dont l'identifiant disparaissait de la liste — et
 * `trierSelon` la renvoyait tout en bas au rechargement suivant, précisément
 * ce que le placement en tête vise à éviter.
 *
 * Pas de verrou possible (aucune DDL : le jeton d'accès a été révoqué), donc
 * on relit après écriture et on recommence si notre identifiant a été emporté.
 * La séquence converge : l'écrivain écrasé se réinsère PAR-DESSUS la liste
 * gagnante au lieu de la remplacer, personne ne perd sa place.
 *
 * Au passage, les identifiants morts sont purgés : sans ça ils consommaient
 * le plafond et finissaient par évincer des tâches vivantes.
 */
export async function placerEnTeteOrdre(id: string): Promise<void> {
  const db = supabaseAdmin();

  for (let essai = 0; essai < 3; essai++) {
    const ordre = await lireOrdreTaches();

    /*
     * Le ménage des identifiants morts ne se fait qu'à l'approche du plafond.
     *
     * Le faire à chaque création coûtait une lecture de toute la table pour
     * rien : tant que la liste a de la place, un identifiant mort n'évince
     * personne. On ne paie donc cette lecture que lorsqu'elle sert vraiment.
     */
    let retenus = ordre.filter((x) => x !== id);
    if (retenus.length >= MAX_ORDRE - 20) {
      const { data: vivantes, error } = await db
        .from("tasks")
        .select("id")
        .eq("user_id", (await uid()));
      if (error) throw error;
      const existants = new Set((vivantes ?? []).map((t) => t.id as string));
      retenus = retenus.filter((x) => existants.has(x));
    }

    await ecrireOrdreTaches([id, ...retenus].slice(0, MAX_ORDRE));

    // Notre identifiant est-il bien dans la liste ? Peu importe son rang exact :
    // si une création concurrente s'est glissée devant, les deux sont placées.
    const relu = await lireOrdreTaches();
    if (relu.includes(id)) return;

    // Une écriture concurrente nous a emportés : on laisse passer l'orage.
    await new Promise((resoudre) => setTimeout(resoudre, 60 + essai * 90));
  }
}


/**
 * Sort une tâche de la todo SANS l'effacer : elle rejoint les Oubliés.
 *
 * C'est la version que pilote la voix. Le Brain reçoit une transcription, et
 * une transcription se trompe : « supprime la course » peut viser la mauvaise
 * ligne. Rien ne justifie qu'un mot mal entendu détruise quelque chose, alors
 * qu'un archivage se reprend en un geste depuis l'onglet Oubliés. L'effacement
 * pour de bon reste possible — à l'écran, là où l'on voit ce qu'on vise.
 */
export async function archiverTache(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ statut: "abandonnee" })
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function supprimerTache(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

/**
 * Efface seulement les tâches cochées — le « passer au jour suivant » qui
 * reporte au lendemain tout ce qui n'a pas été fait.
 *
 * L'instantané complet du jour (faites comprises) est déjà rangé dans
 * daily_logs avant l'appel : ici on ne retire de la table de travail que ce qui
 * est terminé, et les tâches inachevées restent en place pour demain.
 */
export async function supprimerTachesFaites(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("user_id", (await uid()))
    .eq("statut", "faite");

  if (error) throw error;
}


/* ------------------------------------------------------------------ */
/* Ce qui part au navigateur                                           */
/* ------------------------------------------------------------------ */

/** Une tâche telle que le navigateur la reçoit. */
export type TacheReseau = {
  id: string;
  titre: string;
  /** Brut : le Kanban a besoin des quatre états, pas d'un booléen. */
  statut: string;
  /** Brut : le navigateur en déduit le bloc horaire. */
  urgence: string;
  /** Brut : le navigateur en décode la meta P90. */
  categorie: string | null;
  /** Jour LOCAL de la coche, pour distinguer « faite » de « faite aujourd'hui ». */
  faiteLe?: string;
  /** Jour LOCAL de la création, pour l'âge affiché dans la liste. */
  creeLe?: string;
};

/**
 * De la base vers le navigateur, sans rien interpréter.
 *
 * L'ancienne version renvoyait `done: boolean` et perdait `en_cours` en route :
 * le Kanban ne pouvait pas distinguer « à faire » de « en cours ». Les champs
 * partent donc bruts, et c'est le domaine (`p90.ts`) qui les lit — un seul
 * endroit où la règle est écrite, partagé par le serveur et le navigateur.
 */
export function versTaches(lignes: TacheDB[]): TacheReseau[] {
  return lignes.map((l) => ({
    id: l.id,
    titre: l.titre,
    statut: l.statut,
    urgence: l.urgence,
    categorie: l.categorie ?? null,
    // L'horodatage de la base ramené au jour LOCAL de Twaylo : une tâche
    // cochée à 00 h 30 appartient à sa nuit, pas à la veille UTC.
    faiteLe:
      l.statut === "faite" && l.completed_at
        ? localDateKey(new Date(l.completed_at))
        : undefined,
    creeLe: l.created_at ? localDateKey(new Date(l.created_at)) : undefined,
  }));
}

/**
 * Applique l'ordre choisi par Twaylo. Ce que la liste ne mentionne pas — une
 * tâche créée depuis — vient après, dans son ordre de création.
 */
export function trierSelon<T extends { id: string }>(taches: T[], ordre: string[]): T[] {
  if (ordre.length === 0) return taches;
  const rang = new Map(ordre.map((id, i) => [id, i]));
  return [...taches].sort(
    (a, b) =>
      (rang.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rang.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

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
    .eq("user_id", (await uid()))
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;

  const ordre = (data?.habitudes as { ordreTaches?: string[] } | null)?.ordreTaches;
  return Array.isArray(ordre) ? ordre : [];
}

export async function ecrireOrdreTaches(ordreTaches: string[]): Promise<void> {
  await majSentinelle({ ordreTaches });
}


/**
 * LES TÂCHES GELÉES — celles qui reviennent tous les jours.
 *
 * « Poster sur Snap et Facebook » n'est pas une tâche qu'on finit : c'est une
 * tâche qu'on refait. Cochée le soir, elle disparaissait au passage au jour
 * suivant avec toutes les autres, et il fallait la retaper chaque matin.
 * Gelée, elle est simplement décochée et reste à sa place.
 *
 * Une liste d'identifiants sur la sentinelle, comme l'ordre des tâches : la
 * table `tasks` n'a pas de colonne pour ça et aucune migration n'est possible
 * (le jeton d'accès a été révoqué).
 *
 * Bornée à 60 : une todo dont la moitié est quotidienne n'est plus une todo,
 * c'est une journée type — et celle-là existe déjà, dans son onglet.
 */
const MAX_GELEES = 60;

export async function lireTachesGelees(): Promise<string[]> {
  const brut = (await lireSentinelle()).tachesGelees;
  return Array.isArray(brut) ? brut.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Gèle ou dégèle une tâche.
 *
 * Passe par l'écrivain vérifié de la sentinelle, comme tout le reste : geler
 * une tâche pendant que l'OS enregistre l'ordre des tâches ne doit pas effacer
 * l'un ou l'autre.
 */
export async function basculerTacheGelee(id: string, gelee: boolean): Promise<string[]> {
  const actuelles = await lireTachesGelees();
  const suivantes = gelee
    ? actuelles.includes(id)
      ? actuelles
      : [id, ...actuelles].slice(0, MAX_GELEES)
    : actuelles.filter((x) => x !== id);
  if (suivantes.length !== actuelles.length) {
    await majSentinelle({ tachesGelees: suivantes });
  }
  return suivantes;
}

export type DealDB = {
  id: string;
  nom: string;
  etape: string;
  montant: number | null;
  note: string | null;
  /** Date d'échéance (AAAA-MM-JJ), nulle tant qu'elle n'est pas fixée. */
  echeance: string | null;
};

const COLONNES_DEAL = "id, nom, etape, montant, note, echeance";
/** Le jeu d'avant la migration 0003 — voir `sansEcheance` plus bas. */
const COLONNES_DEAL_ANCIEN = "id, nom, etape, montant, note";
export const ETAPES_DEAL = ["prospect", "negociation", "signe", "livre", "regle"] as const;

/**
 * La colonne `echeance` manque-t-elle encore ?
 *
 * La migration 0003 s'applique à la main dans Supabase. Tant qu'elle n'est pas
 * passée, demander la colonne fait échouer toute la lecture et la page Sponsors
 * devient blanche. Plutôt que d'imposer l'ordre des opérations, on retombe sur
 * l'ancien jeu de colonnes : les deals s'affichent, sans date, et la
 * fonctionnalité s'allume d'elle-même une fois la migration lancée.
 */
function sansEcheance(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /echeance/i.test(error.message ?? "");
}

export async function lireDeals(): Promise<DealDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .select(COLONNES_DEAL)
    .eq("user_id", (await uid()))
    .order("created_at", { ascending: true });

  if (!error) return data as DealDB[];
  if (!sansEcheance(error)) throw error;

  const repli = await supabaseAdmin()
    .from("deals")
    .select(COLONNES_DEAL_ANCIEN)
    .eq("user_id", (await uid()))
    .order("created_at", { ascending: true });
  if (repli.error) throw repli.error;
  return (repli.data as Omit<DealDB, "echeance">[]).map((d) => ({ ...d, echeance: null }));
}

export async function creerDeal(nom: string, etape = "prospect"): Promise<DealDB> {
  // On ne demande QUE les anciennes colonnes : un deal naît sans échéance, et
  // réessayer l'insertion en cas de colonne manquante risquerait d'en créer
  // deux (l'insertion peut avoir abouti même si la projection a échoué).
  const { data, error } = await supabaseAdmin()
    .from("deals")
    .insert({ user_id: (await uid()), nom, etape })
    .select(COLONNES_DEAL_ANCIEN)
    .single();

  if (error) throw error;
  return { ...(data as Omit<DealDB, "echeance">), echeance: null };
}

export async function majDeal(
  id: string,
  patch: {
    etape?: string;
    montant?: number | null;
    note?: string | null;
    nom?: string;
    echeance?: string | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("deals")
    .update(patch)
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function supprimerDeal(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
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

  let brutParse: unknown;
  try {
    brutParse = JSON.parse(brut);
  } catch {
    // Ancienne valeur écrite à la main : on la traite comme un simple libellé.
    return { ...CIBLE_VIDE, valeur: brut };
  }

  /*
   * Un parse réussi ne suffit pas.
   *
   * « 100 » est du JSON valide et renvoie le nombre 100, pas un objet : le
   * `catch` ne se déclenchait donc pas, et la cible chiffrée disparaissait de
   * l'écran. Pire, la première modification de l'objectif écrasait ensuite ce
   * « 100 » en base. « null » posait le même problème dans l'autre sens.
   */
  if (typeof brutParse === "string" || typeof brutParse === "number") {
    // Valeur encodée en JSON (`"87k"`) : c'est le contenu qui fait le libellé,
    // pas le texte brut avec ses guillemets.
    return { ...CIBLE_VIDE, valeur: String(brutParse) };
  }

  if (typeof brutParse !== "object" || brutParse === null || Array.isArray(brutParse)) {
    // `null`, `true`, un tableau : du JSON valide, mais rien d'affichable.
    return { ...CIBLE_VIDE };
  }

  {
    const o = brutParse as Partial<ContenuCible>;
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
  }
}

export async function lireObjectifs(): Promise<ObjectifDB[]> {
  /*
   * Les objectifs abandonnés sont renvoyés comme les autres.
   *
   * Ils étaient écartés ici, alors que la vue les attend : elle range en
   * archive tout ce qui n'est plus « en cours », avec un badge et un bouton
   * pour les remettre en route. Filtrés à la lecture, marquer un objectif
   * abandonné le faisait disparaître pour de bon — bouton de restauration
   * inatteignable, et le Brain incapable de le retrouver pour le relancer.
   * C'est à l'affichage de trier, pas à la lecture d'amputer.
   */
  const { data, error } = await supabaseAdmin()
    .from("goals")
    .select("id, objectif, portee, statut, categorie, cible, echeance")
    .eq("user_id", (await uid()))
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
      user_id: (await uid()),
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
  patch: { objectif?: string; cible?: ContenuCible; statut?: string; portee?: string },
): Promise<void> {
  const champs: Record<string, unknown> = {};
  if (patch.objectif !== undefined) champs.objectif = patch.objectif;
  if (patch.cible !== undefined) champs.cible = JSON.stringify(patch.cible);
  if (patch.statut !== undefined) champs.statut = patch.statut;
  // L'horizon : un objectif qu'on repousse du mois au trimestre reste le même
  // objectif. Sans ce champ, il fallait le supprimer et le retaper ailleurs.
  if (patch.portee !== undefined) champs.portee = patch.portee;
  if (Object.keys(champs).length === 0) return;

  const { error } = await supabaseAdmin()
    .from("goals")
    .update(champs)
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function supprimerObjectif(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Les cinq objectifs du PROJECT 90, repérés par leur clé             */
/* ------------------------------------------------------------------ */

/**
 * Le préfixe posé dans `goals.categorie`.
 *
 * Les cinq objectifs sont des constantes du cockpit (`OBJECTIFS_P90`) : leur
 * nom, leur KPI, leur cible et leurs jalons vivent dans le code. La base ne
 * porte que ce qui bouge — la valeur atteinte et les jalons cochés.
 *
 * Il faut donc relier une ligne de `goals` à l'objectif qu'elle suit. Par son
 * titre, ce serait fragile : renommer « Twaylo » en « Chaîne Twaylo » dans le
 * code casserait le lien et la valeur saisie disparaîtrait de l'écran. La clé
 * est donc rangée dans `categorie`, qui est du texte libre et que rien
 * d'autre n'utilise.
 */
export const PREFIXE_P90 = "p90:";

export type JalonDB = { texte: string; fait: boolean };

export type ObjectifP90DB = {
  id: string;
  /** L'identifiant de l'objectif dans `OBJECTIFS_P90` (« momentum », …). */
  cle: string;
  /** La valeur atteinte, telle que Twaylo l'a saisie. */
  valeur: string;
  /** Les jalons cochés, repérés par leur texte. */
  jalons: JalonDB[];
  statut: string;
};

/**
 * Les cinq lignes d'objectif, semées au premier passage.
 *
 * Semées ici et non dans un script : une migration demanderait le jeton
 * d'accès, qui a été révoqué. L'identifiant déduit de la clé rend le semis
 * rejouable — deux onglets ouverts en même temps écrivent les mêmes cinq
 * lignes au lieu d'en créer dix.
 *
 * Aucun drapeau de sentinelle ici, contrairement aux tâches : ces cinq lignes
 * ne sont pas un jeu de démarrage qu'on peut vouloir jeter, ce sont les
 * objectifs du cockpit. Si l'une manque, elle doit revenir — sinon la page
 * Objectifs afficherait un trou définitif.
 */
export async function lireObjectifsP90(): Promise<ObjectifP90DB[]> {
  const db = supabaseAdmin();
  const moi = await uid();
  const COLONNES = "id, objectif, portee, statut, categorie, cible";

  const lire = async () => {
    const { data, error } = await db
      .from("goals")
      .select(COLONNES)
      .eq("user_id", moi)
      .like("categorie", `${PREFIXE_P90}%`);
    if (error) throw error;
    return (data ?? []) as {
      id: string;
      statut: string;
      categorie: string | null;
      cible: string | null;
    }[];
  };

  let lignes = await lire();
  const presentes = new Set(lignes.map((l) => (l.categorie ?? "").slice(PREFIXE_P90.length)));
  const manquantes = OBJECTIFS_P90.filter((o) => !presentes.has(o.id));

  if (manquantes.length > 0) {
    const { error } = await db.from("goals").upsert(
      manquantes.map((o) => ({
        id: uuidStable(moi, `${PREFIXE_P90}${o.id}`),
        user_id: moi,
        objectif: o.nom,
        // Les 90 jours sont un trimestre, et la contrainte de la colonne
        // n'accepte que quatre horizons : c'est le seul qui corresponde.
        portee: "trimestre",
        categorie: `${PREFIXE_P90}${o.id}`,
        cible: JSON.stringify({
          pct: 0,
          valeur: "",
          etapes: o.jalons.map((j) => ({ texte: j.texte, fait: false })),
        }),
      })),
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
    lignes = await lire();
  }

  return lignes.map((l) => {
    const contenu = lireCible(l.cible);
    return {
      id: l.id,
      cle: (l.categorie ?? "").slice(PREFIXE_P90.length),
      valeur: contenu.valeur,
      jalons: contenu.etapes,
      statut: l.statut,
    };
  });
}

/**
 * Enregistre la valeur atteinte ou les jalons cochés d'un objectif.
 *
 * Fusionne au lieu de remplacer : cocher un jalon ne doit pas effacer la
 * valeur saisie dix secondes plus tôt, et inversement. Les deux vivent dans le
 * même JSON, c'est donc ici que la fusion doit se faire.
 */
export async function majObjectifP90(
  cle: string,
  patch: { valeur?: string; jalons?: JalonDB[]; statut?: string },
): Promise<void> {
  const lignes = await lireObjectifsP90();
  const ligne = lignes.find((l) => l.cle === cle);
  if (!ligne) throw new Error(`Objectif P90 inconnu : ${cle}`);

  await majObjectif(ligne.id, {
    cible: {
      pct: 0,
      valeur: patch.valeur ?? ligne.valeur,
      etapes: patch.jalons ?? ligne.jalons,
    },
    ...(patch.statut ? { statut: patch.statut } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Les OP sponsors : semis, et l'étape « Payé » sans migration         */
/* ------------------------------------------------------------------ */

/**
 * Les OP, semées au premier passage comme les tâches.
 *
 * Même protection : identifiant déduit de la marque, drapeau sur la sentinelle,
 * et rien chez quelqu'un d'autre que Twaylo.
 */
export async function lireDealsP90(): Promise<DealDB[]> {
  const existantes = await lireDeals();
  if (existantes.length > 0) return existantes;

  if (await dejaSeme("p90OpsSemees")) return [];
  if (await semisInterdit("p90OpsSemees")) return [];

  const moi = await uid();
  const { error } = await supabaseAdmin()
    .from("deals")
    .upsert(
      SEMIS_OPS.map((op) => {
        const { etape } = etapeVersDB(op.facture ? "facture" : "livre");
        return {
          id: uuidStable(moi, `op:${op.marque}`),
          user_id: moi,
          nom: op.marque,
          etape,
          montant: op.brut,
          note: encoderOp({
            chaine: op.chaine,
            facture: op.facture,
            expandia: op.expandia,
            litige: op.litige ?? false,
            diffusion: op.diffusion,
            paiement: op.paiement,
            note: op.note,
          }),
        };
      }),
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;

  await majSentinelle({ p90OpsSemees: true });
  return lireDeals();
}

/**
 * Une violation de contrainte, et non une autre erreur.
 *
 * Postgres répond `23514` quand une valeur sort d'un `check`. C'est le cas
 * exact de l'étape « réglé » si la migration 0004 n'a jamais été appliquée en
 * base — et elle s'applique à la main, donc rien ne garantit qu'elle l'ait été.
 */
function contrainteRefusee(error: { code?: string } | null): boolean {
  return error?.code === "23514";
}

/**
 * Déplace une OP, en survivant à une migration non appliquée.
 *
 * « Payé » s'écrit `etape = 'regle'`, valeur ajoutée par la migration 0004.
 * Si elle n'est pas passée, l'écriture est refusée — et marquer une OP payée
 * « ne marcherait tout simplement pas », sans un mot. On retombe alors sur
 * « livré » plus le drapeau `y` dans le JSON, que la lecture comprend aussi
 * bien. La fonctionnalité ne dépend donc plus de l'état de la base.
 */
export async function majDealP90(
  id: string,
  patch: { nom?: string; montant?: number | null; note?: string | null; etape?: EtapeOp },
): Promise<void> {
  const { etape: etapeBase, facture } = patch.etape
    ? etapeVersDB(patch.etape)
    : { etape: undefined, facture: false };

  const champs: { nom?: string; montant?: number | null; note?: string | null; etape?: string } = {};
  if (patch.nom !== undefined) champs.nom = patch.nom;
  if (patch.montant !== undefined) champs.montant = patch.montant;
  if (patch.note !== undefined) champs.note = patch.note;
  if (etapeBase !== undefined) champs.etape = etapeBase;

  if (Object.keys(champs).length === 0) return;

  const ecrire = async (c: typeof champs) => {
    const { error } = await supabaseAdmin()
      .from("deals")
      .update(c)
      .eq("id", id)
      .eq("user_id", (await uid()));
    return error;
  };

  const error = await ecrire(champs);
  if (!error) return;

  if (!contrainteRefusee(error) || patch.etape !== "paye") throw error;

  /*
   * Repli : « livré », et le paiement marqué dans le JSON.
   *
   * La note du correctif est réécrite pour porter le drapeau — sans quoi
   * l'étape retomberait à « Livré » au rechargement et l'OP repasserait pour
   * impayée.
   */
  console.error("[deals] étape « regle » refusée par la base, repli sur le drapeau JSON");
  const note = typeof patch.note === "string" ? patch.note : null;
  const avecDrapeau = marquerPayeDansNote(note);
  const erreurRepli = await ecrire({ ...champs, etape: "livre", note: avecDrapeau });
  if (erreurRepli) throw erreurRepli;
  if (!facture) return;
}

/**
 * Pose le drapeau « payé » dans le JSON de la note, sans toucher au reste.
 *
 * Écrit à la main plutôt qu'en passant par `encoderOp` : au moment du repli on
 * n'a que le texte, et le re-décoder pour le ré-encoder ferait perdre une clé
 * qu'une version plus récente aurait ajoutée.
 */
function marquerPayeDansNote(note: string | null): string {
  let base: Record<string, unknown> = {};
  if (note && note.trim().startsWith("{")) {
    try {
      const parse = JSON.parse(note);
      if (parse && typeof parse === "object" && !Array.isArray(parse)) {
        base = parse as Record<string, unknown>;
      }
    } catch {
      /* Une note illisible n'empêche pas de marquer le paiement. */
    }
  } else if (note && note.trim()) {
    base = { n: note.trim().slice(0, 400) };
  }
  return JSON.stringify({ ...base, f: 1, y: 1 });
}

/* ------------------------------------------------------------------ */
/* La revue de semaine                                                 */
/* ------------------------------------------------------------------ */

/**
 * La revue vit sur la ligne du LUNDI de sa semaine, dans `daily_logs`.
 *
 * Pourquoi pas une table dédiée : elle aurait demandé une migration, et le
 * jeton d'accès a été révoqué. Ancrer la revue sur le premier jour de sa
 * semaine est défendable en soi — une revue appartient à une semaine, et une
 * semaine commence un lundi.
 *
 * La fusion est simple, et elle peut l'être : la revue est désormais la SEULE
 * chose qui écrit une ligne de journée. Les habitudes, les repas, la chose du
 * jour et l'instantané des tâches sont partis avec leurs onglets, et avec eux
 * les écritures concurrentes contre lesquelles l'ancien `ecrireJour` se
 * protégeait.
 */
export async function lireRevueJour(lundi: string): Promise<unknown> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
    .eq("jour", lundi)
    .maybeSingle();

  if (error) throw error;
  return (data?.habitudes as Record<string, unknown> | null)?.revue ?? null;
}

export async function ecrireRevueJour(lundi: string, revue: unknown): Promise<void> {
  const db = supabaseAdmin();
  const moi = await uid();

  const { data, error: erreurLecture } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", moi)
    .eq("jour", lundi)
    .maybeSingle();
  if (erreurLecture) throw erreurLecture;

  const actuel = (data?.habitudes ?? {}) as Record<string, unknown>;
  const { error } = await db
    .from("daily_logs")
    .upsert(
      { user_id: moi, jour: lundi, habitudes: { ...actuel, revue } },
      { onConflict: "user_id,jour" },
    );
  if (error) throw error;
}
