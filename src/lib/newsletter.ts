import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "./supabase";

/**
 * La liste de diffusion : prénom, adresse, et la porte s'ouvre.
 *
 * POURQUOI PAS DE DOUBLE CONFIRMATION
 *
 * La première version exigeait un clic dans un courriel avant d'ouvrir quoi
 * que ce soit. C'est la bonne pratique, et c'était le mauvais choix ici :
 * elle impose un service d'envoi configuré — sans lui, PERSONNE n'entre. Un
 * lien posé sous une vidéo qui amène dix mille personnes ne peut pas dépendre
 * d'une clé d'API dont l'absence ferme tout, silencieusement. Et chaque étape
 * intercalée entre le clic et la carte fait perdre du monde.
 *
 * L'inscription est donc immédiate, et le consentement est donné là où il
 * doit l'être : sur le formulaire, en toutes lettres, avant d'appuyer. Le
 * désabonnement reste possible en un clic, par un jeton permanent posé dans
 * chaque envoi. C'est légal, c'est honnête, et ça n'a besoin de rien d'autre
 * qu'une base de données.
 *
 * Le jeton n'est JAMAIS stocké en clair. On garde son empreinte, comme un mot
 * de passe : quelqu'un qui lirait la base ne pourrait pas fabriquer le
 * désabonnement de quelqu'un d'autre.
 */

export type Statut = "en_attente" | "confirme" | "desabonne";

/**
 * Une adresse plausible, sans plus.
 *
 * On ne cherche pas à valider une adresse par une expression régulière — le
 * format réel est bien plus permissif que ce qu'on imagine, et la seule
 * preuve qu'une adresse existe est qu'un message y arrive — ce qu'aucun
 * formulaire ne saura jamais. Ici on écarte seulement l'absurde, et une
 * adresse qui rebondit se retire d'elle-même au premier envoi.
 */
export function adressePlausible(brut: string): boolean {
  const v = brut.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const parts = v.split("@");
  if (parts.length !== 2) return false;
  const [local, domaine] = parts;
  if (!local || domaine.length < 3) return false;
  // Un point, au moins un caractère de chaque côté, pas de point final.
  return /^[^.].*\.[a-z]{2,}$/i.test(domaine) && !domaine.endsWith(".");
}

/** Minuscules et espaces retirés : « Twaylo@X.fr » et « twaylo@x.fr » sont la même personne. */
export function normaliserEmail(brut: string): string {
  return brut.trim().toLowerCase();
}

/**
 * Le prénom, nettoyé sans être corrigé.
 *
 * On retire les caractères de contrôle, on resserre les espaces et on borne
 * la longueur — rien de plus. Pas de majuscule imposée, pas d'accent retiré,
 * aucune « validation » du genre « un prénom ne contient pas de chiffre » :
 * ce sont des règles fausses dès qu'on sort de sa propre langue, et le seul
 * résultat serait de refuser des gens sur leur nom.
 */
export function nettoyerPrenom(brut: string): string {
  return (
    brut
      // Les caractères de contrôle, désignés par leur code : les poser en
      // clair dans la source rendrait ce fichier « binaire » pour les outils
      // de recherche, et invisible dans une revue.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  );
}

/** Un prénom utilisable : au moins une lettre, pas un espace ni un point. */
export function prenomPlausible(brut: string): boolean {
  const v = nettoyerPrenom(brut);
  return v.length >= 2 && /\p{L}/u.test(v);
}

const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

/**
 * Inscrit quelqu'un, tout de suite, et rend son jeton de désabonnement.
 *
 * Le jeton n'expire plus : ce n'est plus un lien de confirmation à usage
 * unique mais la clé permanente qui permettra de partir en un clic depuis
 * n'importe quel envoi.
 */
export async function inscrire(
  email: string,
  prenom: string,
  source: string,
  langue: "fr" | "en",
): Promise<{ jeton: string; dejaInscrit: boolean }> {
  const adresse = normaliserEmail(email);
  const db = supabaseAdmin();

  const { data: existant, error: erreurLecture } = await db
    .from("newsletter")
    .select("id, statut")
    .eq("email", adresse)
    .maybeSingle();
  if (erreurLecture) throw erreurLecture;

  const jeton = randomBytes(32).toString("base64url");

  /*
   * Un « upsert » sur l'adresse : revenir ne crée pas de doublon.
   *
   * Une personne qui s'était désabonnée et qui remplit à nouveau le
   * formulaire redevient inscrite. Elle vient de redonner son accord, en
   * toutes lettres, sur cet écran : le lui refuser au nom d'un refus plus
   * ancien reviendrait à décider à sa place.
   */
  const { error } = await db.from("newsletter").upsert(
    {
      email: adresse,
      prenom: nettoyerPrenom(prenom),
      statut: "confirme" satisfies Statut,
      confirme_le: new Date().toISOString(),
      desabonne_le: null,
      jeton: empreinte(jeton),
      jeton_expire: null,
      source,
      langue,
    },
    { onConflict: "email" },
  );
  if (error) throw error;

  return { jeton, dejaInscrit: existant?.statut === "confirme" };
}

/**
 * Confirme une inscription à partir d'un jeton.
 *
 * Gardée pour les liens de confirmation partis avant le passage à
 * l'inscription immédiate : ils doivent continuer de fonctionner. Elle ne
 * sert plus à personne d'autre, et n'est plus sur le chemin de l'entrée.
 */
export async function confirmer(jeton: string): Promise<{ ok: boolean; email?: string }> {
  if (!jeton) return { ok: false };
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("newsletter")
    .select("id, email, statut, jeton_expire")
    .eq("jeton", empreinte(jeton))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false };

  if (data.jeton_expire && new Date(data.jeton_expire) < new Date()) return { ok: false };

  const { error: erreurMaj } = await db
    .from("newsletter")
    .update({
      statut: "confirme" satisfies Statut,
      confirme_le: new Date().toISOString(),
      jeton: null,
      jeton_expire: null,
    })
    .eq("id", data.id);
  if (erreurMaj) throw erreurMaj;

  return { ok: true, email: data.email };
}

/**
 * Désabonne, à partir du jeton permanent posé dans chaque envoi.
 *
 * La ligne n'est pas supprimée : sans trace, une adresse désabonnée pourrait
 * être réimportée plus tard par mégarde. On garde donc le refus.
 */
export async function desabonner(jeton: string): Promise<boolean> {
  if (!jeton) return false;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("newsletter")
    .select("id")
    .eq("jeton", empreinte(jeton))
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const { error: erreurMaj } = await db
    .from("newsletter")
    .update({
      statut: "desabonne" satisfies Statut,
      desabonne_le: new Date().toISOString(),
      jeton: null,
    })
    .eq("id", data.id);
  if (erreurMaj) throw erreurMaj;
  return true;
}

/** Une ligne de la liste, telle qu'on la relit. */
export type Inscrit = {
  prenom: string | null;
  email: string;
  statut: Statut;
  source: string;
  langue: string;
  created_at: string;
};

/**
 * Toute la liste, du plus récent au plus ancien.
 *
 * Sans pagination, et c'est un choix : une liste de diffusion se lit en
 * entier ou ne se lit pas. À dix mille adresses la réponse pèse moins d'un
 * mégaoctet, et elle n'est demandée que depuis l'OS, par une seule personne.
 * Paginer ici compliquerait l'export sans rien économiser d'utile.
 */
export async function listerInscrits(): Promise<Inscrit[]> {
  const { data, error } = await supabaseAdmin()
    .from("newsletter")
    .select("prenom, email, statut, source, langue, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Inscrit[];
}

/** Combien de personnes ont confirmé — le seul chiffre qui compte vraiment. */
export async function compterConfirmes(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("newsletter")
    .select("id", { count: "exact", head: true })
    .eq("statut", "confirme");
  if (error) throw error;
  return count ?? 0;
}
