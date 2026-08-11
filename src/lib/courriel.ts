/**
 * L'envoi des courriels, par l'API de Resend.
 *
 * Aucune dépendance ajoutée : Resend s'appelle en une requête HTTP, et un
 * paquet de plus dans le projet coûterait plus cher qu'il ne rapporte ici.
 *
 * Sans clé configurée, l'envoi ÉCHOUE au lieu de faire semblant. Faire
 * semblant serait pire : la personne verrait « regarde ta boîte mail » et
 * attendrait un message qui n'arriverait jamais. En développement, le lien
 * est écrit dans la console — ce qui permet de dérouler tout le parcours
 * sans compte d'envoi.
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
<html><body style="margin:0;padding:0;background:#05090f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05090f;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0b1119;border:1px solid #1e2733;border-radius:14px;">
<tr><td style="padding:28px 28px 0;">
<div style="font:700 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.16em;color:#ffd60a;text-transform:uppercase;">Tway'tools</div>
</td></tr>
<tr><td style="padding:18px 28px 0;">
<h1 style="margin:0;font:800 21px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f2f5f8;">${echapper(titre)}</h1>
<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#9fb0c0;">${echapper(phrase)}</p>
</td></tr>
<tr><td style="padding:24px 28px 0;">
<a href="${echapper(lien)}" style="display:inline-block;background:#ffd60a;color:#05090f;text-decoration:none;font:800 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:10px;">${echapper(bouton)}</a>
</td></tr>
<tr><td style="padding:22px 28px 28px;">
<p style="margin:0;font:400 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#5d6b7a;">${echapper(pied)}</p>
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
    sujet: "Confirme ton adresse — Tway'tools",
    titre: "Une dernière chose",
    phrase:
      "Clique pour confirmer ton adresse. Ça ouvre les Tway'tools et ça t'inscrit à la newsletter de Twaylo — tu peux partir quand tu veux, en un clic.",
    bouton: "Confirmer mon adresse",
    pied: "Si tu n'as rien demandé, ignore ce message : sans ce clic, rien n'est enregistré. Lien valable 48 heures.",
  },
  en: {
    sujet: "Confirm your address — Tway'tools",
    titre: "One last thing",
    phrase:
      "Click to confirm your address. It unlocks the Tway'tools and signs you up to Twaylo's newsletter — you can leave whenever you like, in one click.",
    bouton: "Confirm my address",
    pied: "If you didn't ask for this, ignore this message: without that click, nothing is recorded. Link valid for 48 hours.",
  },
} as const;

export async function envoyerConfirmation(
  email: string,
  lien: string,
  langue: "fr" | "en",
): Promise<void> {
  const m = TEXTES[langue];
  await envoyer({
    to: email,
    sujet: m.sujet,
    html: gabarit(m.titre, m.phrase, m.bouton, lien, m.pied),
    texte: `${m.titre}\n\n${m.phrase}\n\n${lien}\n\n${m.pied}`,
  });
}
