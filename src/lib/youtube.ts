import { ecrireTokenYoutube, lireTokenYoutube } from "./db";

/**
 * Connexion à YouTube Studio, via l'API YouTube Analytics.
 *
 * OAuth 2.0 côté serveur : Twaylo autorise une fois, Google renvoie un
 * `refresh_token` longue durée qu'on range en base, et chaque lecture de
 * statistiques échange ce jeton contre un `access_token` frais. Le navigateur
 * ne voit jamais aucun des deux — il reçoit des chiffres déjà calculés.
 *
 * Les revenus (`estimatedRevenue`) exigent la portée monétaire et une chaîne
 * dans le Partner Program. Si l'un manque, l'appel échoue proprement et on
 * renvoie des revenus nuls plutôt que de faire échouer toute la lecture.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

/*
 * Trois portées :
 *   - yt-analytics.readonly          : vues, temps de visionnage, abonnés
 *   - yt-analytics-monetary.readonly : revenus estimés
 *   - youtube.readonly               : nombre total d'abonnés de la chaîne
 */
const SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function youtubeConfigure(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/youtube/callback"
  );
}

/** L'URL de consentement Google. `access_type=offline` est ce qui donne le refresh token. */
export function urlAutorisation(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // `consent` force Google à renvoyer un refresh token même si Twaylo a déjà
    // autorisé l'app une fois — sinon il n'arrive qu'à la toute première fois.
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Échange le code de consentement contre les jetons, et range le refresh token. */
export async function echangerCode(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`échange OAuth : ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de refresh token. Révoque l'accès dans ton compte Google puis réessaie.",
    );
  }
  await ecrireTokenYoutube(data.refresh_token);
}

/** Un access token frais, obtenu à partir du refresh token stocké. */
async function accessToken(): Promise<string> {
  const refresh = await lireTokenYoutube();
  if (!refresh) throw new Error("YouTube non connecté.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`rafraîchissement OAuth : ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("access token absent de la réponse.");
  return data.access_token;
}

export type StatsYoutube = {
  connecte: boolean;
  periode: string;
  vues: number;
  minutesVisionnees: number;
  abonnesGagnes: number;
  /** Nul si la chaîne n'est pas monétisée ou si la portée monétaire manque. */
  revenuEstime: number | null;
  /** Revenu pour 1000 vues, calculé — nul si pas de revenu. */
  rpm: number | null;
  /** Nombre total d'abonnés de la chaîne, aujourd'hui. */
  abonnesTotal: number | null;
  /** Vues par jour, du plus ancien au plus récent — pour la frise. */
  parJour: { date: string; vues: number }[];
};

function jourParis(decalageJours = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalageJours);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Interroge un rapport Analytics et renvoie ses lignes. */
async function rapport(
  token: string,
  metrics: string,
  extra: Record<string, string> = {},
): Promise<{ colonnes: string[]; lignes: (string | number)[][] }> {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: jourParis(-29),
    endDate: jourParis(0),
    metrics,
    ...extra,
  });
  const res = await fetch(`${ANALYTICS_URL}?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Analytics ${res.status} : ${await res.text()}`);
  const data = (await res.json()) as {
    columnHeaders?: { name: string }[];
    rows?: (string | number)[][];
  };
  return {
    colonnes: (data.columnHeaders ?? []).map((c) => c.name),
    lignes: data.rows ?? [],
  };
}

export async function lireStatsYoutube(): Promise<StatsYoutube> {
  const token = await accessToken();

  // 1. Les totaux non monétaires — toujours disponibles.
  const totaux = await rapport(token, "views,estimatedMinutesWatched,subscribersGained");
  const [vues = 0, minutes = 0, abonnes = 0] = (totaux.lignes[0] ?? []) as number[];

  // 2. Les revenus, à part : l'appel échoue si la chaîne n'est pas monétisée.
  let revenuEstime: number | null = null;
  try {
    const rev = await rapport(token, "estimatedRevenue");
    const valeur = (rev.lignes[0]?.[0] as number | undefined) ?? null;
    revenuEstime = valeur === null ? null : Math.round(valeur * 100) / 100;
  } catch (err) {
    console.warn("[youtube] revenus indisponibles (chaîne non monétisée ?) :", err);
  }

  // 3. Le total d'abonnés de la chaîne.
  let abonnesTotal: number | null = null;
  try {
    const res = await fetch(`${CHANNELS_URL}?part=statistics&mine=true`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        items?: { statistics?: { subscriberCount?: string } }[];
      };
      const n = data.items?.[0]?.statistics?.subscriberCount;
      if (n) abonnesTotal = Number(n);
    }
  } catch (err) {
    console.warn("[youtube] total abonnés indisponible :", err);
  }

  // 4. Les vues par jour, pour la frise.
  let parJour: { date: string; vues: number }[] = [];
  try {
    const q = await rapport(token, "views", { dimensions: "day", sort: "day" });
    const iDate = q.colonnes.indexOf("day");
    const iVues = q.colonnes.indexOf("views");
    parJour = q.lignes.map((l) => ({
      date: String(l[iDate]),
      vues: Number(l[iVues]) || 0,
    }));
  } catch (err) {
    console.warn("[youtube] frise indisponible :", err);
  }

  const rpm =
    revenuEstime !== null && vues > 0
      ? Math.round((revenuEstime / (vues / 1000)) * 100) / 100
      : null;

  return {
    connecte: true,
    periode: "30 derniers jours",
    vues,
    minutesVisionnees: minutes,
    abonnesGagnes: abonnes,
    revenuEstime,
    rpm,
    abonnesTotal,
    parJour,
  };
}

export async function youtubeConnecte(): Promise<boolean> {
  if (!youtubeConfigure()) return false;
  return (await lireTokenYoutube()) !== null;
}
