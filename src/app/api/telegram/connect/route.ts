import { NextResponse } from "next/server";

/**
 * Branche le bot Telegram en un clic, depuis l'OS lui-même.
 *
 * Construire l'URL `setWebhook` à la main — coller le jeton juste après `bot`,
 * puis un `secret_token` identique au caractère près à la variable Vercel — est
 * une source d'erreurs sans fin quand on n'est pas développeur. Ici l'OS le fait
 * pour Twaylo : il tient déjà le jeton et le secret dans ses variables
 * d'environnement, et se déclare lui-même auprès de Telegram.
 *
 * L'astuce qui tue la classe entière de bugs de « secret qui ne correspond
 * pas » : le `secret_token` envoyé à Telegram EST la variable que le webhook
 * vérifiera ensuite. Même source, donc toujours d'accord.
 *
 * Cette route est protégée par le mot de passe (le middleware la couvre) : seul
 * Twaylo, connecté, peut la déclencher.
 */

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const userId = process.env.TELEGRAM_USER_ID;

  const manque: string[] = [];
  if (!token) manque.push("TELEGRAM_BOT_TOKEN");
  if (!secret) manque.push("TELEGRAM_WEBHOOK_SECRET");
  if (!userId) manque.push("TELEGRAM_USER_ID");
  if (manque.length > 0) {
    return page(
      false,
      "Il manque des variables sur Vercel",
      `Ajoute ${manque.join(", ")} dans les Environment Variables, redéploie, puis reviens sur cette page.`,
    );
  }

  const webhookUrl = `${new URL(req.url).origin}/api/telegram/webhook`;

  let data: { ok?: boolean; description?: string };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        // Repart propre : on jette les vieux messages restés en attente pendant
        // les tentatives ratées, sinon ils arrivent tous d'un coup au branchement.
        drop_pending_updates: true,
      }),
    });
    data = await res.json();
  } catch (err) {
    return page(
      false,
      "Telegram est injoignable",
      `L'OS n'a pas pu contacter Telegram. Réessaie dans un instant. (${String(err)})`,
    );
  }

  if (!data.ok) {
    return page(
      false,
      "Telegram a refusé le branchement",
      `Message de Telegram : « ${data.description ?? "erreur inconnue"} ». Le plus probable : la variable TELEGRAM_BOT_TOKEN sur Vercel n'est pas le bon jeton. Corrige-la, redéploie, et reviens.`,
    );
  }

  return page(
    true,
    "Ton bot est branché ! 🎉",
    "Retourne dans Telegram, sur ton bot, et envoie <b>/todo</b> — il doit te répondre avec tes tâches à cocher. Envoie aussi une note (écrite ou vocale), il la rangera tout seul.",
  );
}

/** Une page simple, lisible, aux couleurs de l'OS. */
function page(ok: boolean, titre: string, corps: string) {
  const accent = ok ? "#3ddc84" : "#ff3d8b";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brancher le bot Telegram · Twaylo OS</title>
<style>
  html, body { margin: 0; height: 100%; background: #07121d; color: #eaf2f8;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 460px; width: 100%; background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${accent};
    border-radius: 16px; padding: 28px 26px; }
  .emoji { font-size: 40px; }
  h1 { font-size: 22px; margin: 12px 0 10px; color: ${accent}; }
  p { font-size: 15px; line-height: 1.55; color: rgba(234,242,248,0.8); margin: 0 0 14px; }
  b { color: #eaf2f8; }
  a { color: ${accent}; font-weight: 700; text-decoration: none; }
  .home { display: inline-block; margin-top: 8px; font-size: 13px;
    color: rgba(234,242,248,0.5); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="emoji">${ok ? "✅" : "⚠️"}</div>
      <h1>${titre}</h1>
      <p>${corps}</p>
      <a class="home" href="/">← Retour à l'OS</a>
    </div>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
