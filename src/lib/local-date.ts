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

/** Le jour local décalé de `days` — négatif pour remonter dans le passé. */
export function localDateKeyOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** Les N derniers jours locaux, du plus ancien au plus récent. */
export function lastLocalDays(n: number, from: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => localDateKeyOffset(i - (n - 1), from));
}
