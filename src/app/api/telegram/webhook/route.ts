import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/auth";
import { transcribeVoice } from "@/lib/transcribe";
import { repondreEtAgir } from "@/lib/brain-agent";
import { localDateKey } from "@/lib/local-date";
import {
  answerCallbackQuery,
  downloadVoice,
  editMessageText,
  secretWebhookTelegram,
  sendChatAction,
  sendMessage,
  todoKeyboard,
} from "@/lib/telegram";
import { USER_ID, isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { lireOrdreTaches, lireTaches, versTaches } from "@/lib/db";
import type { TacheBouton } from "@/lib/telegram";

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

// Le Brain assemble le contexte puis mène une boucle d'outils : quelques
// secondes, parfois plus d'une dizaine. Sans ce plafond relevé, Vercel coupe la
// fonction à 10 s, Telegram ne reçoit pas son 200 et réessaie — l'action se
// jouerait alors deux fois.
export const maxDuration = 60;

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

/** Vrai seulement si la requête porte le secret exact convenu avec Telegram. */
function secretValide(req: Request): boolean {
  // Le même nettoyage qu'à l'inscription : Telegram nous renvoie le secret déjà
  // épuré, on doit le comparer à sa version épurée, pas à la valeur brute.
  const attendu = secretWebhookTelegram();
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

  // Une commande (/todo, /aide…) : on la traite à part, avant la capture.
  // Seul le texte peut en porter une ; un vocal tombe toujours en capture.
  const commande = message.text?.trim();
  if (commande?.startsWith("/")) {
    return await gererCommande(chatId, commande);
  }

  // 1. Obtenir le texte — tapé, ou transcrit depuis le vocal.
  let texte: string;

  if (message.voice) {
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
    texte = message.text.trim();
  } else {
    await sendMessage(chatId, "Envoie-moi du texte ou un vocal.");
    return NextResponse.json({ ok: true, ignore: "message vide" });
  }

  // 2. Le message part au Brain, qui comprend, AGIT sur l'OS (crée une tâche,
  //    la coche, ajoute une idée…) et répond. Fini la boîte à notes passive.
  // « en train d'écrire… » tout de suite, pour ne pas laisser Twaylo devant un
  // silence pendant que le Brain réfléchit. Sans attente ni blocage si ça rate.
  void sendChatAction(chatId).catch(() => {});
  try {
    const reponse = await repondreEtAgir(texte, localDateKey());
    await sendMessage(chatId, reponse);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram] brain en échec :", err);
    await sendMessage(chatId, "⚠️ Le brain a eu un souci. Réessaie dans un instant.");
    return NextResponse.json({ ok: true, erreur: "brain" });
  }
}

/* ------------------------------------------------------------------ */
/* Commandes — la télécommande de l'OS depuis Telegram                 */
/* ------------------------------------------------------------------ */

/** L'ordre des sections, identique à celui de la carte Tâches de l'OS. */
const ORDRE_NIVEAUX = ["principal", "secondaire", "annexe"];

const AIDE = [
  "<b>Twaylo OS · bot</b>",
  "",
  "Parle-moi — à l'écrit ou en vocal — et j'agis sur ton OS, ou je réponds.",
  "",
  "Exemples :",
  "• « ajoute une tâche : monter le short »",
  "• « coche l'intro Somalie »",
  "• « idée vidéo sur les pirates somaliens »",
  "• « ajoute Josefa en contact »",
  "• « c'est quoi mon focus aujourd'hui ? »",
  "",
  "<b>/todo</b> — tes tâches, à cocher d'un tap",
  "<b>/aide</b> — ce message",
].join("\n");

/** Aiguille les commandes. Le `@nom_du_bot` que Telegram ajoute est retiré. */
async function gererCommande(chatId: number, texte: string) {
  const cmd = texte.split(/\s+/)[0].toLowerCase().replace(/@.*/, "");
  switch (cmd) {
    case "/todo":
    case "/taches":
    case "/tâches":
      return await envoyerTodo(chatId);
    case "/start":
    case "/aide":
    case "/help":
      await sendMessage(chatId, AIDE);
      return NextResponse.json({ ok: true, commande: cmd });
    default:
      await sendMessage(chatId, "Commande inconnue. <b>/todo</b> pour tes tâches, ou envoie une note à ranger.");
      return NextResponse.json({ ok: true, ignore: "commande inconnue" });
  }
}

/**
 * Les tâches, rangées EXACTEMENT comme sur l'OS : d'abord l'ordre que Twaylo a
 * fixé à la main, puis regroupées par niveau (focus principal, secondaire,
 * annexes). Les deux tris s'enchaînent, et comme le tri de JavaScript est
 * stable, le second préserve l'ordre du premier à l'intérieur d'un niveau.
 */
async function lireTachesTriees(): Promise<TacheBouton[]> {
  const [lignes, ordre] = await Promise.all([lireTaches(), lireOrdreTaches()]);
  const rang = new Map(ordre.map((id, i) => [id, i]));
  const taches: TacheBouton[] = versTaches(lignes).map((t) => ({
    id: t.id,
    titre: t.text,
    faite: t.done,
    niveau: t.niveau ?? "secondaire",
    categorie: t.categorie,
  }));

  // Trois tris enchaînés, du moins prioritaire au plus prioritaire (le tri de
  // JS est stable, donc chacun préserve l'ordre du précédent à clé égale) :
  //   1. l'ordre manuel de Twaylo,
  //   2. la catégorie — les tâches d'une même catégorie se retrouvent côte à
  //      côte ; sans catégorie passe en dernier (sentinelle ￿),
  //   3. le niveau — la clé principale, comme les sections de l'OS.
  const cleCat = (c?: string) => (c && c.trim() ? c : "￿");
  taches.sort((a, b) => (rang.get(a.id) ?? 1e9) - (rang.get(b.id) ?? 1e9));
  taches.sort((a, b) => cleCat(a.categorie).localeCompare(cleCat(b.categorie), "fr"));
  taches.sort(
    (a, b) =>
      ORDRE_NIVEAUX.indexOf(a.niveau ?? "secondaire") -
      ORDRE_NIVEAUX.indexOf(b.niveau ?? "secondaire"),
  );
  return taches;
}

/** L'en-tête : le total, puis le compte par niveau, comme les sections de l'OS. */
function enteteTodo(taches: TacheBouton[]): string {
  const faites = taches.filter((t) => t.faite).length;
  const segment = (emoji: string, niveau: string) => {
    const groupe = taches.filter((t) => (t.niveau ?? "secondaire") === niveau);
    if (groupe.length === 0) return null;
    return `${emoji} ${groupe.filter((t) => t.faite).length}/${groupe.length}`;
  };
  const parNiveau = [
    segment("⭐", "principal"),
    segment("🔹", "secondaire"),
    segment("▫️", "annexe"),
  ]
    .filter(Boolean)
    .join("   ");
  return [
    `<b>Tâches</b> · ${faites}/${taches.length} faites`,
    parNiveau,
    "Tape une ligne pour cocher ou décocher.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function envoyerTodo(chatId: number) {
  if (!isSupabaseConfigured()) {
    await sendMessage(chatId, "Base non connectée — impossible de lire tes tâches.");
    return NextResponse.json({ ok: true, persiste: false });
  }
  const taches = await lireTachesTriees();
  if (taches.length === 0) {
    await sendMessage(chatId, "Aucune tâche pour l'instant. Envoie-m'en une à ranger.");
    return NextResponse.json({ ok: true, taches: 0 });
  }
  await sendMessage(chatId, enteteTodo(taches), todoKeyboard(taches));
  return NextResponse.json({ ok: true, taches: taches.length });
}

/** Coche ou décoche une tâche depuis un bouton, puis rafraîchit la liste. */
async function basculerTacheBouton(
  query: NonNullable<TelegramUpdate["callback_query"]>,
  taskId: string,
) {
  if (!isSupabaseConfigured()) {
    await answerCallbackQuery(query.id, "Base non connectée");
    return NextResponse.json({ ok: true, persiste: false });
  }

  const db = supabaseAdmin();
  const { data: tache } = await db
    .from("tasks")
    .select("statut")
    .eq("id", taskId)
    .eq("user_id", USER_ID)
    .single();

  if (!tache) {
    await answerCallbackQuery(query.id, "Tâche introuvable");
    return NextResponse.json({ ok: true, ignore: "tâche inconnue" });
  }

  const faite = tache.statut !== "faite"; // on bascule
  await db
    .from("tasks")
    .update({
      statut: faite ? "faite" : "ouverte",
      completed_at: faite ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", USER_ID);

  await answerCallbackQuery(query.id, faite ? "✅ Fait" : "⬜️ Décochée");

  // On redessine la liste sur place : les cases reflètent le nouvel état sans
  // renvoyer un second message.
  if (query.message) {
    const taches = await lireTachesTriees();
    await editMessageText(
      query.message.chat.id,
      query.message.message_id,
      enteteTodo(taches),
      todoKeyboard(taches),
    );
  }

  return NextResponse.json({ ok: true, faite });
}

/** Correction d'urgence en un tap (spec Partie 5, étape 9). */
async function gererBouton(query: NonNullable<TelegramUpdate["callback_query"]>) {
  if (!expediteurAutorise(query.from?.id)) {
    return NextResponse.json({ ok: true, ignore: "expéditeur inconnu" });
  }

  // La télécommande de la todo passe par le préfixe « t: ».
  const donnees = query.data ?? "";
  if (donnees.startsWith("t:")) {
    return await basculerTacheBouton(query, donnees.slice(2));
  }

  const [prefixe, valeur, captureId] = donnees.split(":");
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
