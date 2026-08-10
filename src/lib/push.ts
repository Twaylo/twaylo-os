import webpush, { type PushSubscription } from "web-push";
import { lireSentinelle, majSentinelle } from "./sentinelle";

/**
 * Les notifications poussées sur l'iPhone.
 *
 * Depuis iOS 16.4, Safari sait les recevoir — mais UNIQUEMENT pour une
 * application posée sur l'écran d'accueil. Un onglet Safari ordinaire n'y a
 * pas droit, quoi qu'on fasse. C'est pour ça que l'écran de réglages parle
 * d'abord d'installation.
 */

const CLE_VAPID = "push_vapid";
const CLE_ABOS = "push_abonnements";

export type PaireVapid = { publicKey: string; privateKey: string };

/**
 * La paire de clés qui signe les envois, gardée dans la sentinelle.
 *
 * Elle POURRAIT vivre dans une variable d'environnement Vercel — c'est
 * l'usage. Elle vit ici pour une raison précise : Twaylo n'aurait rien à
 * faire pour que ça marche. Une variable à créer à la main, c'est une étape
 * de plus entre lui et une fonctionnalité qui marche.
 *
 * Elle doit être STABLE : la régénérer invaliderait tous les abonnements
 * existants, et l'iPhone cesserait de recevoir sans rien dire.
 */
export async function clesVapid(): Promise<PaireVapid> {
  const sentinelle = await lireSentinelle();
  const connue = sentinelle[CLE_VAPID] as PaireVapid | undefined;
  if (connue?.publicKey && connue?.privateKey) return connue;

  await majSentinelle({ [CLE_VAPID]: webpush.generateVAPIDKeys() });

  /*
   * On RELIT au lieu de renvoyer ce qu'on vient de générer.
   *
   * Deux appels simultanés génèrent deux paires ; une seule survit à la
   * fusion. Celui qui renverrait la sienne donnerait au navigateur une clé
   * publique sans rapport avec la clé privée conservée — l'abonnement serait
   * créé, et aucune notification n'arriverait jamais.
   */
  const apres = (await lireSentinelle())[CLE_VAPID] as PaireVapid | undefined;
  if (!apres?.publicKey) throw new Error("clés de notification introuvables après écriture");
  return apres;
}

export async function lireAbonnements(): Promise<PushSubscription[]> {
  const sentinelle = await lireSentinelle();
  const brut = sentinelle[CLE_ABOS];
  return Array.isArray(brut) ? (brut as PushSubscription[]) : [];
}

/** Ajoute un abonnement, sans doublon : l'adresse d'envoi fait l'identité. */
export async function ajouterAbonnement(abo: PushSubscription): Promise<number> {
  const actuels = await lireAbonnements();
  const suivants = [...actuels.filter((a) => a.endpoint !== abo.endpoint), abo];
  await majSentinelle({ [CLE_ABOS]: suivants });
  return suivants.length;
}

export async function retirerAbonnements(adresses: string[]): Promise<void> {
  if (adresses.length === 0) return;
  const actuels = await lireAbonnements();
  const suivants = actuels.filter((a) => !adresses.includes(a.endpoint));
  if (suivants.length !== actuels.length) await majSentinelle({ [CLE_ABOS]: suivants });
}

export type Notification = {
  titre: string;
  corps: string;
  /** Regroupe les notifications : une nouvelle relance remplace la précédente. */
  etiquette?: string;
};

/**
 * Envoie à tous les appareils inscrits. Ne lève jamais : une notification
 * ratée ne doit pas faire échouer le récapitulatif du soir qui la portait.
 *
 * @returns le nombre d'appareils réellement atteints
 */
export async function envoyerNotification(notif: Notification): Promise<number> {
  let abonnements: PushSubscription[];
  let cles: PaireVapid;
  try {
    [abonnements, cles] = await Promise.all([lireAbonnements(), clesVapid()]);
  } catch (err) {
    console.error("[push] configuration illisible :", err);
    return 0;
  }
  if (abonnements.length === 0) return 0;

  webpush.setVapidDetails("mailto:taylowpro@gmail.com", cles.publicKey, cles.privateKey);
  const charge = JSON.stringify(notif);

  /*
   * Les abonnements morts sont RETIRÉS, pas seulement ignorés.
   *
   * Quand l'application est désinstallée de l'écran d'accueil, le service de
   * notification répond 404 ou 410. Sans nettoyage, la liste grossit
   * indéfiniment et chaque relance perd du temps sur des adresses mortes.
   */
  const perimes: string[] = [];
  let atteints = 0;

  await Promise.all(
    abonnements.map(async (abo) => {
      try {
        await webpush.sendNotification(abo, charge);
        atteints += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) perimes.push(abo.endpoint);
        else console.error(`[push] envoi impossible (${code ?? "?"}) :`, err);
      }
    }),
  );

  try {
    await retirerAbonnements(perimes);
  } catch (err) {
    console.error("[push] nettoyage des abonnements impossible :", err);
  }

  return atteints;
}
