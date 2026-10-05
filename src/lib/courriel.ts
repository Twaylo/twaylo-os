/**
 * L'envoi des courriels, par l'API de Resend.
 *
 * Aucune dépendance ajoutée : Resend s'appelle en une requête HTTP, et un
 * paquet de plus dans le projet coûterait plus cher qu'il ne rapporte ici.
 *
 * L'envoi n'est plus sur le chemin de l'entrée : l'inscription est immédiate,
 * et ce message ne fait que souhaiter la bienvenue. Sans clé configurée, on
 * n'envoie rien et personne n'est bloqué — c'est tout l'intérêt d'avoir sorti
 * le courriel du parcours. En développement, le message est écrit dans la
 * console pour pouvoir le relire.
 */

const RESEND = "https://api.resend.com/emails";

/** L'adresse d'expédition, vérifiée chez Resend. */
function expediteur(): string {
  return process.env.COURRIEL_EXPEDITEUR ?? "Twaylo <onboarding@resend.dev>";
}

export function envoiConfigure(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type Envoi = { to: string; sujet: string; html: string; texte: string };

async function envoyer({ to, sujet, html, texte }: Envoi): Promise<void> {
  const cle = process.env.RESEND_API_KEY;

  if (!cle) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY manquante : impossible d'envoyer le courriel.");
    }
    // En développement, on déroule le parcours sans compte d'envoi.
    console.warn(`[courriel] pas de clé — message destiné à ${to} :\n${texte}`);
    return;
  }

  const reponse = await fetch(RESEND, {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({ from: expediteur(), to: [to], subject: sujet, html, text: texte }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    // L'adresse n'est PAS recopiée dans le message d'erreur : elle finirait
    // dans les journaux de la plateforme, où elle n'a rien à faire.
    throw new Error(`Resend a refusé l'envoi (${reponse.status}) ${detail.slice(0, 200)}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Le gabarit
   ═══════════════════════════════════════════════════════════════════════ */

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Un courriel sobre, en tableau, sans image ni police distante.
 *
 * Les clients de messagerie sont restés au HTML de 2005 : la mise en page
 * moderne y casse, et une image distante prévient l'expéditeur que le message
 * a été ouvert — un pistage qu'on ne veut pas plus ici que sur le site.
 */
function gabarit(titre: string, phrase: string, bouton: string, lien: string, pied: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b1420;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1420;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141f33;border:1px solid #22314d;border-radius:14px;">
<tr><td style="padding:28px 28px 0;">
<div style="font:700 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.02em;color:#ffc266;">Tway'tools</div>
</td></tr>
<tr><td style="padding:18px 28px 0;">
<h1 style="margin:0;font:800 21px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#eef3fa;">${echapper(titre)}</h1>
<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#a3b5cd;">${echapper(phrase)}</p>
</td></tr>
<tr><td style="padding:24px 28px 0;">
<a href="${echapper(lien)}" style="display:inline-block;background:#ffc266;color:#0b1420;text-decoration:none;font:800 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:10px;">${echapper(bouton)}</a>
</td></tr>
<tr><td style="padding:22px 28px 28px;">
<p style="margin:0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#6d81a0;">${echapper(pied)}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Les deux messages
   ═══════════════════════════════════════════════════════════════════════ */

const TEXTES = {
  fr: {
    sujet: "Bienvenue dans les Tway'tools",
    titre: (prenom: string) => (prenom ? `Bienvenue, ${prenom}` : "Bienvenue"),
    phrase:
      "Tu es inscrit. Pirats Attack t'est ouvert, et tu seras prévenu en premier quand le prochain outil sortira. Tu peux partir quand tu veux, le lien est en bas de chaque message.",
    bouton: "Ouvrir la carte",
    pied: "Tu reçois ce message parce que tu as donné ton adresse sur tway-tools. Aucune publicité, aucun partage à qui que ce soit.",
  },
  en: {
    sujet: "Welcome to the Tway'tools",
    titre: (prenom: string) => (prenom ? `Welcome, ${prenom}` : "Welcome"),
    phrase:
      "You're in. Pirats Attack is open to you, and you'll be the first to know when the next tool ships. You can leave whenever you like — the link sits at the bottom of every message.",
    bouton: "Open the map",
    pied: "You're getting this because you gave your address on tway-tools. No ads, no sharing with anyone.",
  },
} as const;

/**
 * Le mot de bienvenue.
 *
 * Il ne conditionne RIEN : la personne est déjà entrée quand il part. C'est
 * pour ça qu'il ne rend jamais d'erreur — un service d'envoi en panne ne doit
 * pas transformer une inscription réussie en écran rouge.
 */
export async function envoyerBienvenue(
  email: string,
  prenom: string,
  lien: string,
  langue: "fr" | "en",
): Promise<void> {
  const m = TEXTES[langue];
  const titre = m.titre(prenom);
  try {
    await envoyer({
      to: email,
      sujet: m.sujet,
      html: gabarit(titre, m.phrase, m.bouton, lien, m.pied),
      texte: `${titre}\n\n${m.phrase}\n\n${lien}\n\n${m.pied}`,
    });
  } catch (erreur) {
    console.error(
      "[courriel] bienvenue non envoyée",
      erreur instanceof Error ? erreur.message : erreur,
    );
  }
}
