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

/** Lundi 00:00 de la semaine contenant `date`, en heure de Paris. */
export function lundiDeLaSemaine(date: Date): Date {
  const paris = new Date(date.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  // getDay() renvoie 0 pour dimanche : on le ramène en fin de semaine.
  const decalage = (paris.getDay() + 6) % 7;
  paris.setDate(paris.getDate() - decalage);
  paris.setHours(0, 0, 0, 0);
  return paris;
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

function jourIndexParis(d: Date, lundi: Date): number {
  const jours = Math.floor((d.getTime() - lundi.getTime()) / 86_400_000);
  return jours;
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
      // Les occurrences supprimées ou déplacées ne doivent pas réapparaître.
      const exclues = new Set(
        Object.keys(vevent.exdate ?? {}).map((k) => new Date(k).toDateString()),
      );
      for (const occurrence of vevent.rrule.between(lundi, dimancheSoir, true)) {
        if (exclues.has(occurrence.toDateString())) continue;
        ajouter(occurrence);
      }
      // Une occurrence déplacée est stockée à part, avec sa nouvelle date.
      for (const modifiee of Object.values(vevent.recurrences ?? {})) {
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
