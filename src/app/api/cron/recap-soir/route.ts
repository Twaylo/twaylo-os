import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { construireRecapSoir } from "@/lib/brief";
import { sendMessage } from "@/lib/telegram";
import { localDateKey } from "@/lib/local-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Le récap du soir (21 h Paris) — même garde que le brief du matin. */
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
    const texte = await construireRecapSoir(localDateKey());
    await sendMessage(chatId, texte);
    return NextResponse.json({ envoye: true });
  } catch (err) {
    console.error("[recap-soir] envoi impossible :", err);
    return NextResponse.json({ error: "Envoi impossible." }, { status: 500 });
  }
}
