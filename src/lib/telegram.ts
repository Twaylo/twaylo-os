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

/**
 * Le secret du webhook, nettoyé des caractères que Telegram refuse.
 *
 * Telegram n'accepte dans un `secret_token` que `A–Z a–z 0–9 _ -` — un espace,
 * un accent ou un symbole le fait rejeter d'un « unallowed characters ». Plutôt
 * que d'exiger que Twaylo connaisse cette règle, on retire nous-mêmes ce qui
 * dépasse. La condition sine qua non : appliquer EXACTEMENT le même nettoyage
 * à l'inscription (setWebhook) et à la vérification (webhook entrant), sinon
 * les deux ne coïncideraient plus. D'où cette source unique.
 */
export function secretWebhookTelegram(): string {
  return (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").replace(/[^A-Za-z0-9_-]/g, "");
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

/** La pastille qui marque le niveau d'une tâche, comme les sections de l'OS. */
const PUCE_NIVEAU: Record<string, string> = {
  principal: "⭐",
  secondaire: "🔹",
  annexe: "▫️",
};

export type TacheBouton = {
  id: string;
  titre: string;
  faite: boolean;
  niveau?: string;
  categorie?: string;
};

/**
 * La liste des tâches, un bouton par ligne, à cocher d'un tap depuis Telegram.
 *
 * Une ligne par tâche : au doigt, sur un téléphone, des boutons empilés se
 * visent bien mieux que deux colonnes serrées. La pastille de niveau (⭐ 🔹 ▫️)
 * reproduit les sections de l'OS puisqu'un clavier Telegram ne sait pas porter
 * de titres de groupe ; la catégorie suit en suffixe quand elle tient. Le
 * libellé est tronqué — un bouton trop long est coupé sans prévenir, autant le
 * faire proprement. `callback_data` reste sous les 64 octets de l'API :
 * « t: » plus un identifiant tient large.
 */
export function todoKeyboard(taches: TacheBouton[]) {
  if (taches.length === 0) return undefined;
  return {
    inline_keyboard: taches.slice(0, 40).map((t) => {
      const puce = PUCE_NIVEAU[t.niveau ?? "secondaire"] ?? "";
      const cat = t.categorie ? ` · ${t.categorie}` : "";
      return [
        {
          text: `${t.faite ? "✅" : "⬜️"} ${puce} ${t.titre}${cat}`.slice(0, 60),
          callback_data: `t:${t.id}`,
        },
      ];
    }),
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

/**
 * Affiche « en train d'écrire… » dans le fil, le temps que le Brain réfléchit.
 * L'indicateur dure ~5 s côté Telegram ; sans réponse d'ici là il s'efface, ce
 * qui suffit à dire à Twaylo que le bot a bien reçu et travaille.
 */
export async function sendChatAction(chatId: number, action = "typing"): Promise<void> {
  await call("sendChatAction", { chat_id: chatId, action });
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
