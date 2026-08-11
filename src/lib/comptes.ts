import { JOUR_SENTINELLE } from "./sentinelle";
import { supabaseAdmin } from "./supabase";

/**
 * Les comptes : plusieurs OS sur la même base.
 *
 * Aucune table nouvelle, et ce n'est pas un bricolage : chaque table porte
 * déjà une colonne `user_id` depuis le premier jour, posée exactement pour ce
 * moment. Il ne manquait qu'un endroit où ranger la liste des comptes — c'est
 * cette ligne-ci, sous un identifiant qui ne peut appartenir à personne
 * (`__comptes__` ne passe pas le filtre des identifiants autorisés).
 *
 * Les mots de passe ne sont JAMAIS stockés. On garde un sel et une empreinte
 * PBKDF2 : quelqu'un qui lirait la base ne pourrait pas se connecter avec.
 */

const REGISTRE = "__comptes__";
const ITERATIONS = 210_000;

export type Compte = { sel: string; empreinte: string; cree: string };

/** Un identifiant : minuscules, chiffres et tirets. Court, lisible, sûr. */
export const FORME_ID = /^[a-z0-9][a-z0-9-]{1,30}$/;

export function normaliserId(brut: string): string {
  return brut
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function empreinter(motDePasse: string, sel: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", enc.encode(motDePasse), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(sel), iterations: ITERATIONS, hash: "SHA-256" },
    cle,
    256,
  );
  return hex(bits);
}

async function lireRegistre(): Promise<Record<string, Compte>> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", REGISTRE)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();
  if (error) throw error;
  const brut = (data?.habitudes ?? {}) as Record<string, unknown>;
  return (brut.comptes ?? {}) as Record<string, Compte>;
}

async function ecrireRegistre(comptes: Record<string, Compte>): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("daily_logs")
    .upsert(
      { user_id: REGISTRE, jour: JOUR_SENTINELLE, habitudes: { comptes } },
      { onConflict: "user_id,jour" },
    );
  if (error) throw error;
}

export async function compteExiste(id: string): Promise<boolean> {
  return Boolean((await lireRegistre())[id]);
}

/**
 * Crée un compte. Renvoie l'erreur à afficher, ou null si c'est fait.
 *
 * L'identifiant est vérifié contre le registre ET contre le compte historique :
 * laisser quelqu'un créer « twaylo » lui donnerait l'OS de Twaylo.
 */
export async function creerCompte(
  id: string,
  motDePasse: string,
  idHistorique: string,
): Promise<string | null> {
  if (!FORME_ID.test(id)) {
    return "Choisis un nom en minuscules, sans espace ni accent (2 à 31 caractères).";
  }
  if (id === idHistorique || id === REGISTRE) return "Ce nom est déjà pris.";
  if (motDePasse.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";

  const comptes = await lireRegistre();
  if (comptes[id]) return "Ce nom est déjà pris.";
  /*
   * Un plafond dur, en plus de la limite par adresse.
   *
   * La limite de fréquence est tenue en mémoire, donc par instance : plusieurs
   * instances en parallèle la contournent mécaniquement. Ce plafond-ci est
   * dans la base, donc il tient quoi qu'il arrive — et il protège la seule
   * chose qui compte, la taille de la ligne qui les contient toutes.
   */
  if (Object.keys(comptes).length >= 200) {
    return "Trop de comptes ouverts pour l'instant. Reviens plus tard.";
  }

  const sel = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  comptes[id] = {
    sel,
    empreinte: await empreinter(motDePasse, sel),
    cree: new Date().toISOString(),
  };

  /*
   * On relit juste avant d'écrire, et on refuse si le nom est apparu
   * entre-temps. Deux créations simultanées du même nom écraseraient sinon
   * l'une l'autre — et la seconde prendrait l'OS de la première.
   */
  const frais = await lireRegistre();
  if (frais[id]) return "Ce nom est déjà pris.";
  await ecrireRegistre({ ...frais, [id]: comptes[id] });
  return null;
}

/** Vrai si le couple identifiant / mot de passe ouvre bien ce compte. */
export async function verifierCompte(id: string, motDePasse: string): Promise<boolean> {
  const compte = (await lireRegistre())[id];
  if (!compte) return false;
  const attendu = await empreinter(motDePasse, compte.sel);
  // Comparaison à temps constant : la durée ne doit rien dire du mot de passe.
  if (attendu.length !== compte.empreinte.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ compte.empreinte.charCodeAt(i);
  return diff === 0;
}
