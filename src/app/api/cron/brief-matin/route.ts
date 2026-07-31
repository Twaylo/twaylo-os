import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hasValidApiSecret, verifySessionToken } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { construireBriefMatin } from "@/lib/brief";
import { sendMessage } from "@/lib/telegram";
import { localDateKey } from "@/lib/local-date";

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
  if (cron && req.headers.get("authorization") === `Bearer ${cron}`) return true;
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
  if (!isSupabaseConfigured() || !process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ envoye: false, raison: "configuration manquante" });
  }
  const chatId = Number(process.env.TELEGRAM_USER_ID);
  if (!Number.isFinite(chatId) || chatId === 0) {
    return NextResponse.json({ envoye: false, raison: "TELEGRAM_USER_ID manquant" });
  }

  try {
    const texte = await construireBriefMatin(localDateKey());
    await sendMessage(chatId, texte);
    return NextResponse.json({ envoye: true });
  } catch (err) {
    console.error("[brief-matin] envoi impossible :", err);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}
