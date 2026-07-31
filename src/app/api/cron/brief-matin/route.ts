import { NextResponse } from "next/server";
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
 * `Authorization: Bearer CRON_SECRET` — donc le secret est vérifié ICI, et
 * sans secret configuré on refuse tout : un endpoint qui écrit chez Twaylo
 * ne s'ouvre pas par défaut.
 */
function autorise(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!autorise(req)) {
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
