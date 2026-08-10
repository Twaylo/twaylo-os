import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  hasValidApiSecret,
  timingSafeEqual,
  verifySessionToken,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { construireBriefMatin } from "@/lib/brief";
import { sendMessage } from "@/lib/telegram";
import { localDateKey } from "@/lib/local-date";
import { envoyerNotification } from "@/lib/push";
import { rappelDuMatin } from "@/lib/rappels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Le programme du matin, envoyé sur Telegram par le cron Vercel (6 h Paris).
 *
 * La route est publique dans le middleware — Vercel ne sait envoyer que
 * `Authorization: Bearer CRON_SECRET` — donc l'autorisation est vérifiée ICI.
 * Trois clés ouvrent : le secret du cron, l'API secret, ou la session du
 * dashboard — pour que Twaylo, connecté, déclenche un test en ouvrant
 * simplement l'URL. Rien de configuré = tout est refusé.
 */
async function autorise(req: NextRequest): Promise<boolean> {
  const cron = process.env.CRON_SECRET;
  // Comparaison à temps constant, comme partout ailleurs dans le projet : un
  // `===` sur un secret renseigne un attaquant sur le nombre de caractères
  // justes, et cette route n'est plus filtrée par le middleware.
  const porteur = req.headers.get("authorization") ?? "";
  if (cron && timingSafeEqual(porteur, `Bearer ${cron}`)) return true;
  if (hasValidApiSecret(req.headers.get("x-api-secret"))) return true;
  const secret = process.env.AUTH_SECRET;
  const mdp = process.env.DASHBOARD_PASSWORD;
  if (!secret || !mdp) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret, mdp);
}

export async function GET(req: NextRequest) {
  if (!(await autorise(req))) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ envoye: false, raison: "configuration manquante" });
  }
  const jour = localDateKey();

  /*
   * La notification iPhone d'abord, et sans dépendre de Telegram.
   *
   * Vercel n'autorise que deux tâches planifiées, toutes deux déjà prises :
   * les notifications se greffent donc sur celles-ci, qui tombent au bon
   * moment. La route s'arrêtait avant même de commencer quand le bot n'était
   * pas configuré — les notifications n'auraient jamais eu lieu.
   */
  let notifiees = 0;
  try {
    const rappel = await rappelDuMatin(jour);
    if (rappel) notifiees = await envoyerNotification(rappel);
  } catch (err) {
    console.error("[brief-matin] notification impossible :", err);
  }

  const chatId = Number(process.env.TELEGRAM_USER_ID);
  if (!process.env.TELEGRAM_BOT_TOKEN || !Number.isFinite(chatId) || chatId === 0) {
    return NextResponse.json({ envoye: false, notifiees, raison: "Telegram non configuré" });
  }

  try {
    const texte = await construireBriefMatin(jour);
    await sendMessage(chatId, texte);
    return NextResponse.json({ envoye: true, notifiees });
  } catch (err) {
    console.error("[brief-matin] envoi impossible :", err);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}
