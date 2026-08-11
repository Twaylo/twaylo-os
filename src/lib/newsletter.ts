import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "./supabase";

/**
 * La liste de diffusion, en double confirmation.
 *
 * Double confirmation veut dire qu'une adresse ne compte pas tant que son
 * propriétaire n'a pas cliqué le lien reçu. Ce n'est pas une formalité : sans
 * elle, n'importe qui peut inscrire n'importe qui — et le premier réflexe
 * d'un visiteur pressé est de taper une adresse qui n'est pas la sienne pour
 * passer la porte. Une liste bâtie ainsi ne vaut rien et abîme la réputation
 * d'expéditeur, donc la délivrabilité de tous les envois suivants.
 *
 * Le jeton n'est JAMAIS stocké en clair. On garde son empreinte, comme un mot
 * de passe : quelqu'un qui lirait la base ne pourrait ni confirmer une
 * adresse à la place de son propriétaire, ni fabriquer son désabonnement.
 */

export type Statut = "en_attente" | "confirme" | "desabonne";

/** Durée de vie du lien de confirmation. Assez pour un e-mail lu le soir. */
const VALIDITE_HEURES = 48;

/**
 * Une adresse plausible, sans plus.
 *
 * On ne cherche pas à valider une adresse par une expression régulière — le
 * format réel est bien plus permissif que ce qu'on imagine, et la seule
 * preuve qu'une adresse existe est qu'un message y arrive. C'est justement ce
 * que fait la confirmation. Ici on écarte seulement l'absurde.
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

const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

/**
 * Inscrit une adresse et rend le jeton à envoyer par courriel.
 *
 * Rend `null` si l'adresse est déjà confirmée : inutile de renvoyer un lien à
 * quelqu'un qui est déjà sur la liste, et le lui envoyer quand même
 * apprendrait à un inconnu qu'elle y figure.
 */
export async function inscrire(
  email: string,
  source: string,
  langue: "fr" | "en",
): Promise<{ jeton: string | null; dejaConfirme: boolean }> {
  const adresse = normaliserEmail(email);
  const db = supabaseAdmin();

  const { data: existant, error: erreurLecture } = await db
    .from("newsletter")
    .select("id, statut")
    .eq("email", adresse)
    .maybeSingle();
  if (erreurLecture) throw erreurLecture;

  if (existant?.statut === "confirme") return { jeton: null, dejaConfirme: true };

  const jeton = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + VALIDITE_HEURES * 3_600_000).toISOString();

  /*
   * Un « upsert » sur l'adresse : se réinscrire ne crée pas de doublon, et
   * relance simplement un jeton neuf. C'est le cas normal de quelqu'un qui
   * n'a pas trouvé le premier message.
   *
   * Une adresse désabonnée qui se réinscrit repart en attente : elle doit
   * reconfirmer, on ne la remet pas sur la liste sur sa seule parole.
   */
  const { error } = await db.from("newsletter").upsert(
    {
      email: adresse,
      statut: "en_attente" satisfies Statut,
      jeton: empreinte(jeton),
      jeton_expire: expire,
      source,
      langue,
    },
    { onConflict: "email" },
  );
  if (error) throw error;

  return { jeton, dejaConfirme: false };
}

/**
 * Confirme une inscription à partir du jeton reçu par courriel.
 *
 * Le jeton est effacé au passage : un lien de confirmation ne sert qu'une
 * fois, et ne doit pas rester valable dans une boîte mail pendant des mois.
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

/** Combien de personnes ont confirmé — le seul chiffre qui compte vraiment. */
export async function compterConfirmes(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("newsletter")
    .select("id", { count: "exact", head: true })
    .eq("statut", "confirme");
  if (error) throw error;
  return count ?? 0;
}
