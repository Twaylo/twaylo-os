import type { Urgence } from "./types";

/**
 * Le minimum vital de l'API Bot Telegram (spec Partie 5).
 * Pas de SDK : trois endpoints suffisent et un `fetch` les couvre.
 */

const API = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN manquant");
  return t;
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram ${method} : ${json.description ?? res.status}`);
  }
  return json.result as T;
}

/** Les cinq choix d'urgence, pour corriger le verdict de l'IA d'un seul tap. */
const URGENCE_BOUTONS: { label: string; urgence: Urgence | "cle" }[] = [
  { label: "Aujourd'hui", urgence: "aujourdhui" },
  { label: "Cette semaine", urgence: "semaine" },
  { label: "Ce mois", urgence: "mois" },
  { label: "Un jour", urgence: "un_jour" },
  { label: "⭐ Clé", urgence: "cle" },
];

export function urgenceKeyboard(captureId: string) {
  return {
    inline_keyboard: [
      URGENCE_BOUTONS.slice(0, 2).map((b) => ({
        text: b.label,
        callback_data: `u:${b.urgence}:${captureId}`,
      })),
      URGENCE_BOUTONS.slice(2, 4).map((b) => ({
        text: b.label,
        callback_data: `u:${b.urgence}:${captureId}`,
      })),
      [
        {
          text: URGENCE_BOUTONS[4].label,
          callback_data: `u:cle:${captureId}`,
        },
      ],
    ],
  };
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<{ message_id: number }> {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

export async function answerCallbackQuery(id: string, text: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: id, text });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  });
}

/**
 * Récupère l'audio d'un vocal. Telegram ne sert pas le fichier directement :
 * il faut d'abord demander son chemin, puis le télécharger.
 */
export async function downloadVoice(fileId: string): Promise<Blob> {
  const file = await call<{ file_path: string }>("getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${token()}/${file.file_path}`);
  if (!res.ok) {
    throw new Error(`Téléchargement du vocal impossible : ${res.status}`);
  }
  return res.blob();
}
