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

/**
 * La liste des tâches, un bouton par ligne, à cocher d'un tap depuis Telegram.
 *
 * Une ligne par tâche : au doigt, sur un téléphone, des boutons empilés se
 * visent bien mieux que deux colonnes serrées. Le libellé est tronqué — un
 * bouton Telegram trop long est coupé sans prévenir, autant le faire nous-mêmes
 * proprement. `callback_data` reste sous les 64 octets qu'impose l'API :
 * « t:  » plus un identifiant tient large.
 */
export function todoKeyboard(taches: { id: string; titre: string; faite: boolean }[]) {
  if (taches.length === 0) return undefined;
  return {
    inline_keyboard: taches.slice(0, 40).map((t) => [
      {
        text: `${t.faite ? "✅" : "⬜️"} ${t.titre}`.slice(0, 58),
        callback_data: `t:${t.id}`,
      },
    ]),
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
  replyMarkup?: unknown,
): Promise<void> {
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    // Absent, Telegram retire le clavier : c'est ce qu'on veut après une
    // correction d'urgence. Présent, il remplace les boutons — pour recocher
    // la todo sur place.
    reply_markup: replyMarkup,
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
