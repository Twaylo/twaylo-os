import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/auth";
import { classifyCapture } from "@/lib/router/classifyCapture";
import { routeCapture } from "@/lib/router/routeCapture";
import { transcribeVoice } from "@/lib/transcribe";
import {
  answerCallbackQuery,
  downloadVoice,
  editMessageText,
  sendMessage,
  urgenceKeyboard,
} from "@/lib/telegram";
import { USER_ID, isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { CAPTURE_META } from "@/lib/labels";
import type { CaptureType, Urgence } from "@/lib/types";

/**
 * Le webhook Telegram (spec Partie 5).
 *
 * Cette route est publique — le middleware l'exclut de la porte à mot de
 * passe — parce que Telegram ne peut pas porter le cookie de session. Elle
 * s'authentifie autrement : un secret d'en-tête que seul Telegram connaît,
 * plus un filtre sur l'identifiant de l'expéditeur.
 *
 * Règle de codes de retour : 401 si la requête ne vient pas de Telegram
 * (elle n'a rien à faire ici), 200 dans tous les autres cas — même en
 * erreur. Un non-2xx déclenche des réessais en boucle chez Telegram, ce qui
 * transformerait un bug ponctuel en tempête de requêtes.
 */

type TelegramUpdate = {
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
    voice?: { file_id: string; duration: number };
  };
  callback_query?: {
    id: string;
    from?: { id: number };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

/** Les seules valeurs que la contrainte `check` de la base accepte. */
const URGENCES_VALIDES = ["aujourdhui", "semaine", "mois", "un_jour"];

const LABEL_URGENCE: Record<string, string> = {
  aujourdhui: "aujourd'hui",
  semaine: "cette semaine",
  mois: "ce mois",
  un_jour: "un jour",
};

function confirmation(
  type: CaptureType,
  urgence: Urgence,
  resume: string,
  moteur: string,
  persiste: boolean,
): string {
  const meta = CAPTURE_META[type];
  const lignes = [
    `<b>${meta.label}</b> · ${LABEL_URGENCE[urgence] ?? urgence}`,
    resume,
  ];
  if (moteur === "regex") lignes.push("<i>trié hors ligne (IA injoignable)</i>");
  if (!persiste) lignes.push("<i>⚠️ non enregistré — base non connectée</i>");
  return lignes.join("\n");
}

/** Vrai seulement si la requête porte le secret exact convenu avec Telegram. */
function secretValide(req: Request): boolean {
  const attendu = process.env.TELEGRAM_WEBHOOK_SECRET;
  const recu = req.headers.get("x-telegram-bot-api-secret-token");
  if (!attendu || !recu) return false;
  return timingSafeEqual(recu, attendu);
}

/** Vrai seulement si l'expéditeur est Twaylo — le bot n'écoute que lui. */
function expediteurAutorise(id: number | undefined): boolean {
  const attendu = process.env.TELEGRAM_USER_ID;
  if (!attendu || id === undefined) return false;
  return String(id) === attendu.trim();
}

export async function POST(req: Request) {
  if (!secretValide(req)) {
    console.warn("[telegram] secret d'en-tête invalide — requête rejetée");
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignore: "corps illisible" });
  }

  try {
    if (update.callback_query) return await gererBouton(update.callback_query);
    if (update.message) return await gererMessage(update.message);
    return NextResponse.json({ ok: true, ignore: "type d'update non géré" });
  } catch (err) {
    // 200 volontaire : on log, on n'invite pas Telegram à réessayer en boucle.
    console.error("[telegram] traitement impossible :", err);
    return NextResponse.json({ ok: true, erreur: true });
  }
}

async function gererMessage(message: NonNullable<TelegramUpdate["message"]>) {
  if (!expediteurAutorise(message.from?.id)) {
    console.warn(`[telegram] expéditeur non autorisé : ${message.from?.id}`);
    return NextResponse.json({ ok: true, ignore: "expéditeur inconnu" });
  }

  const chatId = message.chat.id;

  // 1. Obtenir le texte — tapé, ou transcrit depuis le vocal.
  let texte: string;
  let source: "voix" | "texte";

  if (message.voice) {
    source = "voix";
    try {
      texte = await transcribeVoice(await downloadVoice(message.voice.file_id));
    } catch (err) {
      console.error("[telegram] transcription impossible :", err);
      await sendMessage(
        chatId,
        "Je n'ai pas réussi à transcrire ce vocal. Réessaie, ou écris-le.",
      );
      return NextResponse.json({ ok: true, erreur: "transcription" });
    }
  } else if (message.text?.trim()) {
    source = "texte";
    texte = message.text.trim();
  } else {
    await sendMessage(chatId, "Envoie-moi du texte ou un vocal.");
    return NextResponse.json({ ok: true, ignore: "message vide" });
  }

  // 2. Classer, 3. router, 4. confirmer.
  const classification = await classifyCapture(texte);
  const { captureId, persiste } = await routeCapture(texte, classification, source);

  await sendMessage(
    chatId,
    confirmation(
      classification.type,
      classification.urgence,
      classification.resume,
      classification.moteur,
      persiste,
    ),
    // Sans identifiant de capture, aucun bouton : il n'y aurait rien à corriger.
    captureId ? urgenceKeyboard(captureId) : undefined,
  );

  return NextResponse.json({ ok: true, type: classification.type, persiste });
}

/** Correction d'urgence en un tap (spec Partie 5, étape 9). */
async function gererBouton(query: NonNullable<TelegramUpdate["callback_query"]>) {
  if (!expediteurAutorise(query.from?.id)) {
    return NextResponse.json({ ok: true, ignore: "expéditeur inconnu" });
  }

  const [prefixe, valeur, captureId] = (query.data ?? "").split(":");
  if (prefixe !== "u" || !valeur || !captureId) {
    await answerCallbackQuery(query.id, "Action inconnue");
    return NextResponse.json({ ok: true, ignore: "callback_data illisible" });
  }

  if (!isSupabaseConfigured()) {
    await answerCallbackQuery(query.id, "Base non connectée");
    return NextResponse.json({ ok: true, persiste: false });
  }

  const db = supabaseAdmin();

  let libelle: string;

  if (valeur === "cle") {
    // « Clé » n'est pas une urgence : il étoile la tâche pour qu'elle remonte
    // dans la carte Tâches clés. Le routage a mémorisé son identifiant, donc
    // on la corrige directement.
    const { data: capture } = await db
      .from("captures")
      .select("routed_to")
      .eq("id", captureId)
      .single();

    const route = capture?.routed_to as { table?: string; id?: string } | null;

    if (route?.table === "tasks" && route.id) {
      await db
        .from("tasks")
        .update({ cle: true, urgence: "aujourdhui" })
        .eq("id", route.id)
        .eq("user_id", USER_ID);
      libelle = "tâche clé";
    } else {
      await answerCallbackQuery(query.id, "Seule une tâche peut être marquée clé");
      return NextResponse.json({ ok: true, ignore: "pas une tâche" });
    }
  } else {
    /*
     * `valeur` vient d'un `callback_query` : c'est une donnée extérieure, et
     * c'était la seule écriture du projet à la prendre telle quelle. Les
     * autres routes valident contre une liste blanche ; celle-ci ne le
     * faisait pas, et il lui manquait aussi le filtre `user_id` que portent
     * les vingt autres opérations. Cette route étant la seule accessible hors
     * cookie de session, elle mérite au moins autant de méfiance qu'elles.
     */
    if (!URGENCES_VALIDES.includes(valeur)) {
      await answerCallbackQuery(query.id, "Urgence inconnue");
      return NextResponse.json({ ok: true, ignore: "urgence invalide" });
    }
    await db
      .from("captures")
      .update({ priorite: valeur })
      .eq("id", captureId)
      .eq("user_id", USER_ID);
    libelle = LABEL_URGENCE[valeur] ?? valeur;
  }

  await answerCallbackQuery(query.id, `Corrigé : ${libelle}`);

  if (query.message) {
    await editMessageText(
      query.message.chat.id,
      query.message.message_id,
      `✅ Corrigé — ${libelle}`,
    );
  }

  return NextResponse.json({ ok: true, corrige: valeur });
}
