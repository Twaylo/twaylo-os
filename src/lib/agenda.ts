import type { VEvent } from "node-ical";
import type { EvenementAgenda } from "./agenda-types";

/**
 * Lecture de Google Agenda par son URL iCal secrète.
 *
 * Pas d'OAuth : Google publie pour chaque agenda une « adresse secrète au
 * format iCal », en lecture seule, qui n'exige ni consentement ni jeton à
 * rafraîchir. Pour un dashboard mono-utilisateur qui ne fait qu'afficher, ça
 * suffit — et ça évite de demander à Twaylo un accès en écriture dont l'app
 * n'a aucun usage.
 *
 * L'URL vaut lecture complète de l'agenda : elle reste côté serveur, dans
 * `GOOGLE_ICAL_URL`, et n'est jamais renvoyée au navigateur.
 */


export function agendaConfigure(): boolean {
  return Boolean(process.env.GOOGLE_ICAL_URL);
}

/**
 * Google sert le même contenu sur `webcal://` et `https://` — le premier n'est
 * qu'une convention pour que le système propose d'ouvrir un client d'agenda.
 * `fetch` ne le connaît pas.
 */
function normaliserUrl(url: string): string {
  return url.replace(/^webcal:\/\//i, "https://");
}

/** La date civile à Paris, au format AAAA-MM-JJ. */
function cleParis(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/**
 * L'instant réel où il est minuit à Paris, le jour civil donné.
 *
 * On part de minuit UTC ce jour-là, on mesure de combien Paris est en avance
 * à cet instant, et on recule d'autant. Le décalage est ainsi lu à la bonne
 * saison — une heure en hiver, deux en été — au lieu d'être supposé.
 */
function minuitParis(cle: string): Date {
  const approx = new Date(`${cle}T00:00:00Z`);
  const mur = approx.toLocaleString("sv-SE", { timeZone: "Europe/Paris" });
  const decalage = new Date(`${mur.replace(" ", "T")}Z`).getTime() - approx.getTime();
  return new Date(approx.getTime() - decalage);
}

/**
 * Lundi 00:00 de la semaine contenant `date`, en heure de Paris.
 *
 * Le calcul passait par une Date dont les champs LOCAUX portaient l'heure de
 * Paris, puis appelait `setDate`/`setHours` — qui travaillent, eux, dans le
 * fuseau du serveur. Juste en développement (machine à Paris), faux en ligne
 * (Vercel tourne en heure universelle) : la semaine démarrait à 2 h du matin,
 * et un rendez-vous de 1 h était rangé la veille — ou disparaissait.
 */
export function lundiDeLaSemaine(date: Date): Date {
  // Le jour civil parisien, décalé jusqu'au lundi, en arithmétique de dates
  // civiles ancrée à midi : aucune bascule d'heure ne la traverse.
  const midi = new Date(`${cleParis(date)}T12:00:00Z`);
  const decalage = (midi.getUTCDay() + 6) % 7;
  midi.setUTCDate(midi.getUTCDate() - decalage);
  return minuitParis(midi.toISOString().slice(0, 10));
}

/** Une valeur ICS est soit une chaîne, soit un objet portant des paramètres. */
function texteDe(valeur: unknown): string {
  if (typeof valeur === "string") return valeur.trim();
  if (valeur && typeof valeur === "object" && "val" in valeur) {
    return String((valeur as { val: unknown }).val).trim();
  }
  return "";
}

function heureParis(d: Date): string {
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/**
 * Le rang du jour dans la semaine (0 = lundi), compté en jours CIVILS
 * parisiens.
 *
 * Une simple division par 24 h se décale d'un cran la semaine du changement
 * d'heure, qui compte 167 ou 169 heures : un dimanche pouvait être compté
 * lundi suivant.
 */
function jourIndexParis(d: Date, lundi: Date): number {
  const a = new Date(`${cleParis(lundi)}T12:00:00Z`).getTime();
  const b = new Date(`${cleParis(d)}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Les événements de la semaine, récurrences comprises.
 *
 * Une entrée `RRULE` ne décrit qu'une règle : « tous les mercredis à 15 h ».
 * Il faut la dérouler pour savoir ce qui tombe dans la fenêtre demandée —
 * sans ça, l'appel hebdomadaire avec Alex n'apparaîtrait qu'à sa toute
 * première date.
 */
export async function lireAgendaSemaine(
  reference: Date = new Date(),
): Promise<EvenementAgenda[]> {
  const url = process.env.GOOGLE_ICAL_URL;
  if (!url) return [];

  const lundi = lundiDeLaSemaine(reference);
  const dimancheSoir = new Date(lundi);
  dimancheSoir.setDate(dimancheSoir.getDate() + 7);

  const reponse = await fetch(normaliserUrl(url), {
    // L'agenda change dans la journée ; une réponse d'il y a une heure ne
    // vaut rien, mais on évite de retélécharger à chaque rendu.
    next: { revalidate: 300 },
  });
  if (!reponse.ok) throw new Error(`ICS HTTP ${reponse.status}`);

  /*
   * Import à la demande, et non en tête de module.
   *
   * `node-ical` tire des modules Node au chargement, ce qui faisait échouer la
   * collecte de données de page au build (« Failed to collect page data »).
   * Chargé ici, il ne s'évalue qu'à l'exécution de la requête.
   */
  const { default: ical } = await import("node-ical");
  const donnees = ical.sync.parseICS(await reponse.text());
  const evenements: EvenementAgenda[] = [];

  for (const entree of Object.values(donnees)) {
    if (!entree || entree.type !== "VEVENT") continue;
    const vevent = entree as VEvent;

    const journeeEntiere =
      (vevent.datetype as string | undefined) === "date" ||
      (vevent.start as unknown as { dateOnly?: boolean })?.dateOnly === true;

    /** Ajoute une occurrence si elle tombe dans la fenêtre. */
    const ajouter = (debut: Date) => {
      if (debut < lundi || debut >= dimancheSoir) return;
      const index = jourIndexParis(debut, lundi);
      if (index < 0 || index > 6) return;
      evenements.push({
        id: `${vevent.uid}-${debut.toISOString()}`,
        // `summary` peut arriver soit en chaîne, soit en objet { val, params }
        // quand la ligne ICS porte des paramètres (LANGUAGE, ALTREP…).
        titre: texteDe(vevent.summary) || "Sans titre",
        heure: journeeEntiere ? "" : heureParis(debut),
        jourIndex: index,
        debut: debut.toISOString(),
        journeeEntiere,
      });
    };

    if (vevent.rrule) {
      /*
       * Les occurrences déplacées comptent AUSSI comme exclues.
       *
       * Google n'écrit pas d'EXDATE quand un rendez-vous récurrent est
       * déplacé : il ajoute une entrée « RECURRENCE-ID » à part, et laisse la
       * règle inchangée. Ne regarder que les EXDATE laissait donc un fantôme
       * à l'ancien créneau — un rendez-vous qui n'existe plus, à côté du vrai.
       * La clé de chaque occurrence modifiée porte précisément l'instant
       * d'origine : c'est lui qu'il faut retirer de la série.
       */
      const modifiees = vevent.recurrences ?? {};
      const exclues = new Set([
        ...Object.keys(vevent.exdate ?? {}).map((k) => new Date(k).toDateString()),
        ...Object.keys(modifiees).map((k) => new Date(k).toDateString()),
      ]);
      for (const occurrence of vevent.rrule.between(lundi, dimancheSoir, true)) {
        if (exclues.has(occurrence.toDateString())) continue;
        ajouter(occurrence);
      }
      /*
       * Chaque occurrence déplacée n'est ajoutée qu'UNE fois.
       *
       * node-ical range le même objet sous deux clés (une date, une chaîne
       * ISO) : parcourir les valeurs le sortait deux fois, et le rendez-vous
       * déplacé apparaissait en double à sa nouvelle heure.
       */
      for (const modifiee of new Set(Object.values(modifiees))) {
        const debut = (modifiee as { start?: Date | string })?.start;
        if (debut) ajouter(new Date(debut));
      }
    } else {
      ajouter(new Date(vevent.start));
    }
  }

  // Les événements sur la journée entière d'abord, puis par heure.
  return evenements.sort((a, b) => {
    if (a.jourIndex !== b.jourIndex) return a.jourIndex - b.jourIndex;
    if (a.journeeEntiere !== b.journeeEntiere) return a.journeeEntiere ? -1 : 1;
    return a.debut.localeCompare(b.debut);
  });
}
