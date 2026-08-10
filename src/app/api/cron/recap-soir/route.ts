import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  hasValidApiSecret,
  timingSafeEqual,
  verifySessionToken,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { construireRecapSoir } from "@/lib/brief";
import { sendMessage } from "@/lib/telegram";
import { localDateKey } from "@/lib/local-date";
import { envoyerNotification } from "@/lib/push";
import { rappelDuSoir } from "@/lib/rappels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Le récap du soir (21 h Paris) — mêmes trois clés que le brief du matin. */
async function autorise(req: NextRequest): Promise<boolean> {
  const cron = process.env.CRON_SECRET;
  // Temps constant, comme le brief du matin — cette route n'est plus filtrée
  // par le middleware.
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
   * La notification iPhone part indépendamment de Telegram.
   *
   * Vercel n'autorise que deux tâches planifiées, toutes deux déjà prises :
   * la notification se greffe donc sur celle-ci, qui tombe déjà au bon moment.
   * Mais elle ne doit pas dépendre de Telegram — la route s'arrêtait avant
   * même de commencer si le bot n'était pas configuré, et les notifications
   * n'auraient jamais eu lieu.
   */
  let notifiees = 0;
  try {
    const rappel = await rappelDuSoir(jour);
    if (rappel) notifiees = await envoyerNotification(rappel);
  } catch (err) {
    console.error("[recap-soir] notification impossible :", err);
  }

  const chatId = Number(process.env.TELEGRAM_USER_ID);
  if (!process.env.TELEGRAM_BOT_TOKEN || !Number.isFinite(chatId) || chatId === 0) {
    return NextResponse.json({ envoye: false, notifiees, raison: "Telegram non configuré" });
  }

  try {
    const texte = await construireRecapSoir(jour);
    await sendMessage(chatId, texte);
    return NextResponse.json({ envoye: true, notifiees });
  } catch (err) {
    console.error("[recap-soir] envoi impossible :", err);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}
