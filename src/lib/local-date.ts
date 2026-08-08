/**
 * Le jour « local » de Twaylo.
 *
 * Le piège documenté en Partie 10 (bug 2) : si le serveur ancre la journée sur
 * minuit UTC, les habitudes se remettent à zéro à 2h du matin en été à Paris,
 * alors que Twaylo n'est même pas couché. Toute question « on est quel jour ? »
 * doit passer par ici — clé de stockage locale comme ancre de daily_logs.
 *
 * On passe par `en-CA` parce que son format court est déjà YYYY-MM-DD.
 */
export const USER_TIMEZONE = process.env.NEXT_PUBLIC_USER_TIMEZONE ?? "Europe/Paris";

export function localDateKey(date: Date = new Date(), timeZone = USER_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Le jour local décalé de `days` — négatif pour remonter dans le passé.
 *
 * Le décalage se fait en arithmétique de dates civiles, ancrée à midi UTC,
 * jamais en ajoutant des jours à un instant. `setDate` travaillait dans le
 * fuseau du serveur (UTC sur Vercel) puis on reformatait à Paris : autour d'un
 * changement d'heure, un jour se retrouvait compté deux fois et un autre
 * sauté. Midi est assez loin des deux bascules pour qu'aucune ne le franchisse.
 */
export function localDateKeyOffset(days: number, from: Date = new Date()): string {
  const d = new Date(`${localDateKey(from)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Les N derniers jours locaux, du plus ancien au plus récent. */
export function lastLocalDays(n: number, from: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => localDateKeyOffset(i - (n - 1), from));
}
