import { createHash } from "node:crypto";
import { USER_ID, uid, supabaseAdmin } from "./supabase";
import { archiverTachesOubliees, estOubliee, seuilOubli } from "./oublies-db";
import { REAL_DATA } from "./data-real";
import { NIVEAUX, niveauDepuisUrgence } from "./types";
import { localDateKey } from "./local-date";
import { chiffrerJourStocke, jourALaisseUneTrace } from "./xp";
import { JOUR_SENTINELLE, lireSentinelle, majSentinelle } from "./sentinelle";
import type { BlocageStocke, Contact, Niveau, Skill, Task, UneChose } from "./types";

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
  /**
   * L'instantané des tâches du jour.
   *
   * Les tâches vivent dans leur propre table, remise à neuf chaque matin.
   * Sans cet instantané, l'historique de complétion serait perdu à chaque
   * réinitialisation : on fige donc ici, jour par jour, ce qui était là et ce
   * qui avait été coché.
   */
  taches?: SnapshotTaches;
  /**
   * Les blocs de la journée type cochés ce jour-là. Rangés ici, avec le reste
   * de la journée, pour qu'une coche de bloc et la coche d'habitude qu'elle
   * entraîne partent dans la MÊME écriture.
   */
  journeeFaits?: string[];
  /**
   * La revue de la semaine, rangée sur la ligne du LUNDI.
   *
   * Elle passe par le même écrivain vérifié que le reste de la journée : sa
   * route écrivait la ligne de son côté, et le lundi les deux se marchaient
   * dessus — une revue en cours de frappe pouvait effacer les habitudes
   * cochées le matin, ou l'inverse.
   */
  revue?: unknown;
  /**
   * Les bonus de jeu gagnés ce jour-là (« journée type pliée », « journée
   * parfaite »…).
   *
   * Écrits le jour où ils tombent, et plus jamais retirés. C'est ce qui rend
   * l'XP incapable de redescendre : sans cette trace, ajouter une habitude
   * ferait perdre rétroactivement le bonus « toutes les habitudes » de chaque
   * journée passée, et le niveau baisserait tout seul.
   */
  bonus?: string[];
};

/** Ce qu'on garde d'une journée de tâches, pour le bilan dans le temps. */
export type SnapshotTaches = {
  total: number;
  faites: number;
  /** Le focus principal seul — « ai-je bouclé l'essentiel ». */
  principalTotal: number;
  principalFaites: number;
  liste: { titre: string; niveau: string; fait: boolean }[];
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
  /**
   * Sert au jugement « oubliée » et au tri. Reste côté serveur : `versTaches`
   * ne la recopie pas dans ce qui part au navigateur.
   */
  created_at?: string | null;
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
 *
 * LE COMPTE ENTRE DANS L'EMPREINTE, et ce n'est pas un détail de propreté.
 * Sans lui, deux OS différents déduisaient le MÊME identifiant du même titre.
 * Comme l'amorçage écrit en `onConflict: "id", ignoreDuplicates: true`, les
 * lignes du second compte tombaient sur celles du premier et étaient
 * silencieusement ignorées ; la sentinelle marquait pourtant « semé », et le
 * nouvel OS s'ouvrait définitivement vide — sans tâches, sans vidéos, sans
 * contacts, et sans moyen de rejouer le semis.
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
 * Ce semis initial a-t-il déjà eu lieu, une fois pour toutes ?
 *
 * Le drapeau vit sur la ligne sentinelle. Sans lui, « table vide » serait
 * confondu avec « jamais semé », et vider délibérément une liste la ferait
 * repousser au chargement suivant.
 */
async function dejaSeme(cle: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  return (data?.habitudes as Record<string, unknown> | null)?.[cle] === true;
}

async function tachesDejaSemees(): Promise<boolean> {
  return dejaSeme("tachesSemees");
}

/**
 * Ce semis initial ne concerne QUE l'OS historique.
 *
 * `REAL_DATA` n'est pas un jeu de démarrage neutre : ce sont les tâches, les
 * idées de vidéo et les coéquipiers de Twaylo. Ils étaient semés à l'identique
 * dans chaque OS créé — quelqu'un qui s'inscrivait trouvait « Créer le compte
 * Snap Twaylo » dans sa liste et cinq inconnus dans ses contacts. Un OS neuf
 * démarre donc vide, et c'est le sas qui le remplit à partir des réponses de
 * son propriétaire.
 *
 * Le drapeau est posé quand même : sans lui, la question « faut-il semer ? »
 * se reposerait à chaque lecture d'une liste vide, ce qui est le cas normal
 * d'un OS qu'on vient d'ouvrir.
 */
async function semisInterdit(cle: string): Promise<boolean> {
  if ((await uid()) === USER_ID) return false;
  await majSentinelle({ [cle]: true });
  return true;
}

/**
 * Au tout premier démarrage, la table est vide. Plutôt qu'un dashboard désert,
 * on y sème les tâches réelles de Twaylo (spec Partie 11).
 *
 * Un drapeau sur la ligne sentinelle marque le semis comme fait, une fois pour
 * toutes. Sans lui, « table vide » était confondu avec « jamais semé » : vider
 * délibérément sa liste ramenait les tâches par défaut à chaque rechargement,
 * et on ne pouvait jamais atteindre une liste vide — le cas normal « j'ai tout
 * fini, je nettoie ». Même correction que pour les habitudes.
 */
export async function lireTaches(): Promise<TacheDB[]> {
  const db = supabaseAdmin();
  const COLONNES = "id, titre, statut, urgence, cle, categorie, completed_at, created_at";

  /*
   * Le ménage des Oubliés part EN MÊME TEMPS que la lecture, plus avant.
   *
   * Il était attendu : deux allers-retours en file indienne dans une fonction
   * de lecture, sur le chemin critique de l'accueil, du Brain et de l'onglet
   * Oubliés. Pire, son échec faisait échouer la lecture — un hoquet d'écriture
   * chez Supabase, et tout l'écran restait sur les données de la veille.
   *
   * Lancés ensemble, la lecture peut renvoyer une tâche que l'écriture est en
   * train d'archiver. On applique donc le MÊME jugement en mémoire, avec le
   * même seuil, calculé une seule fois : le prédicat est partagé
   * (`estOubliee`) pour que les deux ne puissent pas diverger.
   */
  const seuil = seuilOubli();
  const [, lecture] = await Promise.all([
    archiverTachesOubliees(),
    db
      .from("tasks")
      .select(COLONNES)
      .eq("user_id", (await uid()))
      .neq("statut", "abandonnee")
      .order("created_at", { ascending: true }),
  ]);

  const { data, error } = lecture;
  if (error) throw error;
  const vivantes = (data as TacheDB[]).filter((t) => !estOubliee(t, seuil));
  if (vivantes.length > 0) return vivantes;

  // Table vide et semis déjà fait : Twaylo a tout supprimé, on respecte.
  if (await tachesDejaSemees()) return [];
  // Et chez quelqu'un d'autre, il n'y a jamais eu de semis à faire.
  if (await semisInterdit("tachesSemees")) return [];

  // Sorti de la boucle : un seul calcul, et un `.map()` reste synchrone.
  const moi = await uid();
  const { error: erreurSemis } = await db.from("tasks").upsert(
    REAL_DATA.tasks.map((t) => ({
      id: uuidStable(moi, t.text),
      user_id: moi,
      titre: t.text,
      categorie: t.categorie ?? null,
      urgence: "semaine",
      cle: true,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (erreurSemis) throw erreurSemis;

  // Le semis n'aura pas lieu deux fois : on le marque avant même la relecture.
  await majSentinelle({ tachesSemees: true });

  // Relecture plutôt que d'utiliser le retour de l'upsert : avec
  // `ignoreDuplicates`, il ne renvoie que les lignes réellement insérées.
  const { data: apres, error: erreurRelecture } = await db
    .from("tasks")
    .select(COLONNES)
    .eq("user_id", (await uid()))
    .neq("statut", "abandonnee")
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
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function creerTache(
  titre: string,
  categorie?: string,
  niveau: Niveau = "secondaire",
): Promise<TacheDB> {
  /*
   * Le niveau est vérifié ici, pas seulement chez l'appelant.
   *
   * Le Brain passe ce qu'un modèle de langage a produit : « urgent »,
   * « haute », « priorité 1 » — tout est plausible, rien n'est dans
   * l'énumération. `NIVEAUX[niveau].urgence` levait alors une exception, le
   * bot répondait « le brain a eu un souci », et la tâche que Twaylo venait
   * de dicter était simplement perdue. Un niveau inconnu vaut « secondaire »,
   * ce qui est toujours mieux que de perdre ce qui a été dit.
   */
  // `Object.hasOwn` et non `in` : ce dernier accepterait « toString », hérité
  // du prototype, et `NIVEAUX[niveau]` serait alors indéfini — le plantage
  // même qu'on cherche à éviter.
  const retenu: Niveau = Object.hasOwn(NIVEAUX, niveau) ? niveau : "secondaire";

  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .insert({
      user_id: (await uid()),
      titre,
      categorie: categorie ?? null,
      urgence: NIVEAUX[retenu].urgence,
      cle: true,
    })
    .select("id, titre, statut, urgence, cle, categorie, completed_at")
    .single();

  if (error) throw error;
  const tache = data as TacheDB;

  /*
   * La nouvelle tâche prend la TÊTE de la pile, pas la queue.
   *
   * L'ordre d'affichage vient de la liste rangée sur la sentinelle, et une
   * tâche absente de cette liste est renvoyée en dernier (`trierSelon`). Sans
   * ce placement, ce que Twaylo vient de taper atterrissait tout en bas d'une
   * liste de vingt lignes — c'est-à-dire hors de vue. On la met donc devant,
   * ici plutôt que côté navigateur : le Brain Telegram crée des tâches par le
   * même chemin et doit se comporter pareil.
   *
   * L'échec n'annule pas la création : au pire la tâche s'affiche en bas, ce
   * qui reste très loin de mériter de perdre ce que Twaylo vient d'écrire.
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

/** Fait passer une tâche d'un niveau à l'autre. */
export async function changerNiveauTache(id: string, niveau: Niveau): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ urgence: NIVEAUX[niveau].urgence })
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function renommerTache(id: string, titre: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ titre })
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
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
 * Vide toute la todo de Twaylo — le « passer au jour suivant ».
 *
 * L'instantané du jour est déjà figé dans daily_logs avant l'appel : ici on ne
 * fait qu'effacer la table de travail pour repartir sur une liste vierge. Le
 * drapeau « tâches semées » reste posé, donc les cinq tâches d'exemple ne
 * reviennent pas.
 */
export async function supprimerToutesTaches(): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("user_id", (await uid()))
    // L'archive des Oubliés survit à tout vidage : elle ne se perd jamais,
    // c'est sa raison d'être. On n'y touche que depuis l'onglet Oubliés.
    .neq("statut", "abandonnee");

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
/* Journée                                                             */
/* ------------------------------------------------------------------ */

export async function lireJour(
  jour: string,
): Promise<{ etat: EtatJour; journal: string }> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes, journal_texte")
    .eq("user_id", (await uid()))
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
 * Un jour compte s'il porte une trace réelle : une coche, un repas, une tâche
 * bouclée ou du texte dans le journal. Ouvrir l'app sans rien y mettre ne
 * compte pas — une série qui s'incrémente toute seule ne veut plus rien dire.
 *
 * La trace ne se limite volontairement pas aux habitudes. En déplacement,
 * Twaylo ne coche parfois que ses blocs de journée type : la série se cassait
 * alors sur des journées pleinement tenues, ce qui est exactement l'inverse de
 * ce qu'un compteur de série doit faire.
 *
 * La journée en cours n'interrompt pas la série tant qu'elle est vide : à 9 h
 * du matin on n'a encore rien fait, et remettre le compteur à zéro chaque nuit
 * serait absurde. On repart donc d'hier si aujourd'hui est vierge.
 */
export async function calculerSerie(aujourdhui: string): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("jour, habitudes, journal_texte")
    .eq("user_id", (await uid()))
    .neq("jour", JOUR_SENTINELLE)
    .lte("jour", aujourdhui)
    .order("jour", { ascending: false })
    .limit(400);

  if (error) throw error;
  if (!data) return 0;

  const remplis = new Set<string>();
  for (const ligne of data) {
    const chiffre = chiffrerJourStocke(ligne.habitudes, ligne.journal_texte as string | null);
    if (jourALaisseUneTrace(chiffre)) remplis.add(ligne.jour as string);
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

  /*
   * Même protection que la ligne sentinelle, et pour la même raison.
   *
   * Plusieurs choses vivent dans la ligne d'UN jour — habitudes cochées,
   * repas, chose du jour, instantané des tâches, blocs de journée type, et la
   * revue quand ce jour est un lundi — et plusieurs chemins l'écrivent. Deux
   * écritures dont les lectures se croisent, et la seconde ressuscite ce que
   * la première venait de changer : une coche perdue, une revue effacée.
   *
   * Sans verrou possible, on vérifie : après écriture, on relit et on s'assure
   * que nos clés portent bien nos valeurs, sinon on refusionne sur la version
   * fraîche.
   */
  const cles = Object.keys(patch.etat ?? {});

  /*
   * `bonus` est la seule clé qui s'ajoute au lieu de remplacer.
   *
   * Une récompense gagnée est gagnée. Écrasée comme les autres, elle
   * disparaîtrait au premier onglet resté ouvert depuis la veille, ou dès que
   * deux appareils écrivent la même journée — et l'XP redescendrait.
   */
  const bonusVoulus = Array.isArray(patch.etat?.bonus) ? patch.etat.bonus : null;

  /*
   * La relecture de vérification n'est payée que quand elle sert.
   *
   * Trois allers-retours par écriture (lire, écrire, relire) sur la route la
   * plus appelée de l'OS — tout passe par `synchroniserJour`. Or la
   * vérification n'existe que pour un cas précis : deux écrivains dont les
   * lectures se croisent. Ces écrivains sont connus et rares — la revue du
   * lundi, le journal du soir, les bonus fusionnés par union — et ce sont eux
   * dont la perte se voit (une revue effacée, une XP qui redescend).
   *
   * Les coches, elles, arrivent par dizaines depuis un seul onglet, par une
   * file qui n'envoie qu'UNE écriture à la fois : deux lectures qui se
   * croisent y sont improbables, et le pire cas est une coche à refaire, pas
   * une donnée perdue. On garde donc la boucle pour les clés à enjeu, et on
   * s'arrête après l'écriture pour les autres. Un tiers de latence en moins
   * sur le geste le plus fréquent.
   */
  const CLES_A_ENJEU = new Set(["bonus", "revue"]);
  const verifier =
    patch.journal !== undefined || cles.some((c) => CLES_A_ENJEU.has(c));

  for (let essai = 0; essai < 3; essai++) {
    const actuel = await lireJour(jour);

    const fusion: Record<string, unknown> = { ...actuel.etat, ...(patch.etat ?? {}) };
    if (bonusVoulus) {
      fusion.bonus = [...new Set([...(actuel.etat.bonus ?? []), ...bonusVoulus])];
    }

    /*
     * Une écriture qui ne change rien n'est pas écrite.
     *
     * L'instantané des tâches est reposté à CHAQUE chargement de page, avec
     * exactement le même contenu : c'est la nature d'un instantané. Chaque
     * ouverture de l'OS déclenchait donc une écriture inutile sur la ligne du
     * jour — la plus sollicitée de la base, et celle que six chemins se
     * partagent.
     *
     * La comparaison textuelle suffit ici : `fusion` est construite en
     * étalant `actuel.etat` d'abord, donc l'ordre des clés existantes est
     * conservé. Une clé nouvelle s'ajoute à la fin et fait diverger le texte,
     * ce qui est le comportement voulu.
     */
    const identique =
      JSON.stringify(fusion) === JSON.stringify(actuel.etat) &&
      (patch.journal === undefined || patch.journal === actuel.journal);
    if (identique) return;

    const ligne: Record<string, unknown> = { user_id: (await uid()), jour, habitudes: fusion };
    if (patch.journal !== undefined) ligne.journal_texte = patch.journal;

    const { error } = await db
      .from("daily_logs")
      .upsert(ligne, { onConflict: "user_id,jour" });

    if (error) throw error;
    if (!verifier) return;

    const relu = await lireJour(jour);
    const etatRelu = relu.etat as unknown as Record<string, unknown>;
    const attendu = (patch.etat ?? {}) as Record<string, unknown>;
    const tenu =
      cles.every((c) =>
        c === "bonus" && bonusVoulus
          ? bonusVoulus.every((b) => (relu.etat.bonus ?? []).includes(b))
          : JSON.stringify(etatRelu[c]) === JSON.stringify(attendu[c]),
      ) && (patch.journal === undefined || relu.journal === patch.journal);
    if (tenu) return;
  }

  console.error(`[jour ${jour}] écriture emportée trois fois par une autre — abandon`);
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
    .eq("user_id", (await uid()))
    .order("priorite", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length > 0) return data as VideoDB[];

  /*
   * Table vide et semis déjà fait : Twaylo a tout supprimé, on respecte.
   *
   * Ce garde manquait, contrairement aux tâches : supprimer les trois vidéos
   * d'amorçage — des titres bouche-trou — les faisait revenir au chargement
   * suivant, encore et encore. Un pipeline vide était impossible à atteindre.
   */
  if (await dejaSeme("videosSemees")) return [];
  if (await semisInterdit("videosSemees")) return [];

  // Même amorçage idempotent que les tâches : identifiant déduit du titre,
  // donc deux semis concurrents écrivent la même ligne.
  const moi = await uid();
  const semences = REAL_DATA.pipeline.flatMap((col) =>
    col.videos.map((v) => ({
      id: uuidStable(moi, v.title),
      user_id: moi,
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
  // Marqué avant la relecture : le semis n'aura pas lieu deux fois.
  await majSentinelle({ videosSemees: true });

  const { data: apres, error: erreurRelecture } = await db
    .from("videos")
    .select(COLONNES_VIDEO)
    .eq("user_id", (await uid()))
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
    .eq("user_id", (await uid()));

  if (error) throw error;
}

export async function creerVideo(
  titre: string,
  format = "long",
  // L'étape de destination. Saisir une vidéo dans la colonne « Montage »
  // devait l'y créer ; elle atterrissait systématiquement dans « Idée », et
  // Twaylo devait la reglisser à chaque fois.
  statut = "idee",
): Promise<VideoDB> {
  const { data, error } = await supabaseAdmin()
    .from("videos")
    .insert({
      user_id: (await uid()),
      titre,
      statut: ETAPES.includes(statut as (typeof ETAPES)[number]) ? statut : "idee",
      format,
    })
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
    .eq("user_id", (await uid()));

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
    .eq("user_id", (await uid()))
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (data.length > 0) return data as ContactDB[];

  // Même garde que les tâches et les vidéos : une liste vidée à la main le
  // reste. Sans lui, les contacts d'amorçage revenaient à chaque chargement.
  if (await dejaSeme("contactsSemes")) return [];
  if (await semisInterdit("contactsSemes")) return [];

  // Sorti de la boucle : un seul calcul, et le `.map()` reste synchrone.
  const moi = await uid();
  const { error: erreurSemis } = await db.from("contacts").upsert(
    REAL_DATA.contacts.map((c) => ({
      id: uuidStable(moi, c.nom),
      user_id: moi,
      nom: c.nom,
      type: c.type,
      relation: c.relation,
      role: c.role ?? null,
      prochaine_action: c.prochaineAction ?? null,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (erreurSemis) throw erreurSemis;
  await majSentinelle({ contactsSemes: true });

  const { data: apres, error: erreurRelecture } = await db
    .from("contacts")
    .select(COLONNES_CONTACT)
    .eq("user_id", (await uid()))
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
    .eq("user_id", (await uid()));

  if (error) throw error;
}

const RELATIONS = ["chaud", "actif", "tiede", "froid"] as const;

export async function creerContact(
  nom: string,
  type = "collab",
  // La chaleur de départ : la colonne dans laquelle Twaylo a tapé. Elle était
  // figée à « froid », donc un contact ajouté dans « Chaud » atterrissait
  // ailleurs et devait être reglissé à la main.
  relation = "froid",
): Promise<ContactDB> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .insert({
      user_id: (await uid()),
      nom,
      type,
      relation: RELATIONS.includes(relation as (typeof RELATIONS)[number])
        ? relation
        : "froid",
    })
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
    .eq("user_id", (await uid()));

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Captures                                                            */
/* ------------------------------------------------------------------ */

export type CaptureDB = { id: string; texte: string; type: string };

/**
 * Les dernières captures NON TRAITÉES — la boîte de réception.
 *
 * Le filtre manquait, et tant que rien ne routait les captures c'était sans
 * conséquence : `traite` restait faux pour tout le monde. Maintenant que dire
 * « appeler le fixeur » crée vraiment la tâche, une capture routée n'a plus
 * rien à faire sous « en attente de tri » — elle y restait affichée comme si
 * personne ne s'en était occupé.
 */
export async function lireCaptures(limite = 4): Promise<CaptureDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("captures")
    .select("id, texte, type")
    .eq("user_id", (await uid()))
    .eq("traite", false)
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
    // L'horodatage de la base ramené au jour LOCAL de Twaylo : une tâche
    // cochée à 00 h 30 appartient à sa nuit, pas à la veille UTC.
    faiteLe:
      l.statut === "faite" && l.completed_at
        ? localDateKey(new Date(l.completed_at))
        : undefined,
    /*
     * Le jour de naissance de la tâche part maintenant au navigateur.
     *
     * Il restait côté serveur, où seul l'onglet « Oubliés » s'en servait pour
     * archiver ce qui traîne depuis quatre jours. Mais l'archivage arrive trop
     * tard : ce qui compte, c'est de VOIR une tâche vieillir pendant qu'elle
     * est encore sous les yeux. Une liste sans âge donne le même poids à ce
     * qu'on vient de noter et à ce qu'on repousse depuis une semaine.
     *
     * Ramené au jour local, comme la date de coche : une tâche créée à minuit
     * et demie appartient à sa nuit.
     */
    creeLe: l.created_at ? localDateKey(new Date(l.created_at)) : undefined,
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
    .eq("user_id", (await uid()));

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
 *
 * La date et l'écrivain vérifié vivent maintenant dans `sentinelle.ts` : six
 * chemins écrivent cette ligne, et trois d'entre eux le faisaient sans
 * vérifier — d'où des réglages qui disparaissaient quand deux écritures se
 * croisaient.
 */

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
  /**
   * Habitude floutée à l'écran tant que « Révélé » n'est pas actif.
   *
   * Ce champ manquait ici, et la route qui écrit la liste ne le recopiait donc
   * pas : le floutage tenait jusqu'au rechargement, puis l'habitude sensible
   * revenait en clair — précisément quand Twaylo filme.
   */
  prive?: boolean;
};

export async function lireHabitudesDef(): Promise<HabitudeDef[]> {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
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

  /*
   * Premier démarrage. Les habitudes de Twaylo chez Twaylo, rien ailleurs.
   *
   * « Communauté → DM / Stories » ou « Point finance » ne veulent rien dire
   * pour quelqu'un qui vient d'arriver ; ce sont les siennes. Un OS neuf
   * démarre sans habitude, et le sas y pose celles qui correspondent aux
   * réponses données. La clé est écrite dans les deux cas, sinon la question
   * se reposerait à chaque lecture.
   */
  const semees = (await uid()) === USER_ID ? HABITUDES_DEFAUT : [];
  await ecrireHabitudesDef(semees);
  return semees;
}


export async function ecrireHabitudesDef(definitions: HabitudeDef[]): Promise<void> {
  await majSentinelle({ definitions });
}

/* ------------------------------------------------------------------ */
/* Skills — les compétences façon RPG                                  */
/* ------------------------------------------------------------------ */

/** Les compétences de départ de Twaylo, groupées par domaine. */
const SKILLS_DEFAUT: { nom: string; categorie: string }[] = [
  { nom: "Anglais", categorie: "Langues" },
  { nom: "Espagnol", categorie: "Langues" },
  { nom: "Maps GeoLayers", categorie: "Création" },
  { nom: "Montage", categorie: "Création" },
  { nom: "Storytelling", categorie: "Création" },
  { nom: "Shorts", categorie: "Création" },
  { nom: "Branding", categorie: "Création" },
  { nom: "Financier", categorie: "Business" },
  { nom: "Muscu", categorie: "Corps" },
  { nom: "Beauté", categorie: "Corps" },
  { nom: "Physique", categorie: "Corps" },
];

/**
 * Les compétences, rangées dans la sentinelle (config libre).
 *
 * Absentes de la config (premier accès), on sème le jeu de départ — une seule
 * fois : une fois la clé écrite, même vidée, on la respecte. Twaylo reste
 * maître de sa liste.
 */
export async function lireSkills(): Promise<Skill[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  const skills = (data?.habitudes as { skills?: Skill[] } | null)?.skills;
  if (Array.isArray(skills)) return skills;

  /*
   * « Maps GeoLayers », « Shorts », « Beauté » : ce sont les compétences de
   * Twaylo. Servies à tout le monde, elles donnaient à un nouvel OS une liste
   * de onze compétences qu'il n'a jamais choisies — et une courbe de
   * progression sur des choses qu'il ne pratique pas.
   */
  const depart = (await uid()) === USER_ID ? SKILLS_DEFAUT : [];
  const semes: Skill[] = depart.map((s, i) => ({
    id: `skill-${i}-${s.nom.toLowerCase().replace(/[^a-z]/g, "")}`,
    nom: s.nom,
    categorie: s.categorie,
    niveau: 0,
    historique: [],
  }));
  await majSentinelle({ skills: semes });
  return semes;
}

export async function ecrireSkills(skills: Skill[]): Promise<void> {
  await majSentinelle({ skills });
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

export async function lireBlocages(): Promise<BlocageStocke[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
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
/* Revenus                                                             */
/* ------------------------------------------------------------------ */

/**
 * Un relevé mensuel de revenus.
 *
 * Saisi à la main, faute de mieux : lire YouTube Analytics demande un parcours
 * OAuth complet, avec consentement Google et jeton à rafraîchir. Un chiffre
 * que Twaylo recopie une fois par mois depuis son Studio est vrai ; un
 * graphique inventé est joli et faux.
 */
export type RevenuDB = {
  id: string;
  periode: string;
  date: string;
  revenu_estime: number | null;
  rpm: number | null;
  vues_monetisees: number | null;
  objectif_mois: number | null;
  sources: Record<string, number>;
};

export async function lireRevenus(limite = 24): Promise<RevenuDB[]> {
  const { data, error } = await supabaseAdmin()
    .from("revenue_snapshots")
    .select("id, periode, date, revenu_estime, rpm, vues_monetisees, objectif_mois, sources")
    .eq("user_id", (await uid()))
    .order("date", { ascending: false })
    .limit(limite);

  if (error) throw error;
  return (data ?? []) as RevenuDB[];
}

/**
 * Enregistre le relevé d'un mois. Le même mois saisi deux fois se remplace au
 * lieu de s'ajouter — la contrainte d'unicité porte sur (user, periode, date).
 */
export async function ecrireRevenu(patch: {
  date: string;
  revenu_estime: number | null;
  rpm: number | null;
  vues_monetisees: number | null;
  objectif_mois: number | null;
  sources: Record<string, number>;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("revenue_snapshots").upsert(
    { user_id: (await uid()), periode: "mois", ...patch },
    { onConflict: "user_id,periode,date" },
  );

  if (error) throw error;
}

export async function supprimerRevenu(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("revenue_snapshots")
    .delete()
    .eq("id", id)
    .eq("user_id", (await uid()));

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* YouTube — jeton de rafraîchissement                                 */
/* ------------------------------------------------------------------ */

/**
 * Le refresh token OAuth de YouTube.
 *
 * Rangé sur la ligne sentinelle, à côté des habitudes et des blocages. Il ne
 * quitte jamais le serveur : /api/state ne lit que `definitions` et
 * `blocages` de ce jsonb, jamais `youtube`. La clé service_role contourne
 * RLS, mais le navigateur ne voit passer que des statistiques déjà calculées,
 * pas le jeton qui a servi à les obtenir.
 */
export async function lireTokenYoutube(): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", (await uid()))
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  const token = (data?.habitudes as { youtube?: { refresh_token?: string } } | null)
    ?.youtube?.refresh_token;
  return typeof token === "string" && token ? token : null;
}

export async function ecrireTokenYoutube(refreshToken: string): Promise<void> {
  await majSentinelle({ youtube: { refresh_token: refreshToken } });
}

export async function oublierTokenYoutube(): Promise<void> {
  await majSentinelle({ youtube: {} });
}
