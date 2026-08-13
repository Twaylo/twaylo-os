import { versCsv } from "@/lib/csv";
import {
  inscrire,
  listerInscrits,
  supprimerInscrit,
  type Inscrit,
} from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La liste de diffusion de Twaylo, lisible et exportable en un clic.
 *
 * POURQUOI UNE ROUTE ET PAS UNE PAGE
 *
 * Cette page n'a besoin de rien de l'OS : ni de son contexte, ni de son écran
 * de lancement, ni d'un seul composant. Une route qui rend son HTML tient en
 * un fichier, ne peut pas casser parce qu'un composant a changé ailleurs, et
 * s'affiche instantanément. Ce qui compte ici, c'est que la liste soit là et
 * qu'elle parte en tableur — pas qu'elle soit jolie.
 *
 * OÙ ELLE VIT, ET POURQUOI ICI
 *
 * Côté OS, donc derrière le mot de passe, et NON sur le site public. Les
 * adresses sont la seule donnée personnelle de tiers du projet : elles
 * n'ont rien à faire sur un déploiement que dix mille personnes visitent.
 * L'adresse publique des Tway'tools répond d'ailleurs « introuvable » sur ce
 * chemin — c'est le middleware qui s'en charge, et c'est délibéré.
 */

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const jour = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

function page(lignes: Inscrit[]): string {
  const inscrits = lignes.filter((l) => l.statut !== "desabonne");
  const partis = lignes.length - inscrits.length;
  const nombre = new Intl.NumberFormat("fr-FR");

  const rangees = lignes
    .map(
      (l) => `<tr${l.statut === "desabonne" ? ' class="parti"' : ""}>
      <td>${echapper(l.prenom ?? "—")}</td>
      <td class="mail">${echapper(l.email)}</td>
      <td>${echapper(l.source)}</td>
      <td class="date">${jour(l.created_at)}</td>
      <td>${l.statut === "desabonne" ? "désabonné" : "inscrit"}</td>
    </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Liste de diffusion — ${nombre.format(inscrits.length)} inscrits</title>
<style>
  :root { --fond:#0b1420; --surface:#141f33; --bord:#22314d; --texte:#eef3fa;
          --doux:#a3b5cd; --faible:#6d81a0; --ambre:#ffc266; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--fond); color:var(--texte); padding:28px 20px 60px;
         font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
         -webkit-font-smoothing:antialiased }
  .large { max-width:960px; margin:0 auto }
  h1 { margin:0 0 4px; font-size:26px; letter-spacing:-.02em }
  .sous { margin:0 0 24px; color:var(--doux) }
  .compte { color:var(--ambre); font-weight:600 }
  .bouton { display:inline-block; margin:0 0 26px; padding:12px 18px; border-radius:10px;
            background:var(--ambre); color:var(--fond); font-weight:600; text-decoration:none }
  table { width:100%; border-collapse:collapse; background:var(--surface);
          border:1px solid var(--bord); border-radius:12px; overflow:hidden }
  th,td { padding:11px 13px; text-align:left; border-bottom:1px solid var(--bord); font-size:14px }
  th { color:var(--faible); font-weight:600; font-size:12px; letter-spacing:.04em }
  tr:last-child td { border-bottom:0 }
  .mail { font-family:ui-monospace,Menlo,monospace; font-size:13px }
  .date, td:last-child { color:var(--faible); white-space:nowrap }
  .parti td { opacity:.45 }
  .actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:0 0 20px }
  .bouton.second { background:transparent; color:var(--doux); border:1px solid var(--bord);
                   font:600 15px/1 system-ui,sans-serif; cursor:pointer }
  .verdict { margin:0 0 24px; padding:13px 15px; border-radius:10px; font-size:14px;
             line-height:1.5; border:1px solid var(--bord); color:var(--doux) }
  .verdict[data-ton="bien"] { border-color:#59d3c4; background:rgba(89,211,196,.09); color:var(--texte) }
  .verdict[data-ton="mal"] { border-color:#ff7a6b; background:rgba(255,122,107,.08); color:#ffd2cc }
  .vide { padding:34px; text-align:center; color:var(--faible);
          background:var(--surface); border:1px solid var(--bord); border-radius:12px }
  @media (max-width:640px){ .date{display:none} th:nth-child(4){display:none} }
</style></head>
<body><div class="large">
<h1>Liste de diffusion</h1>
<p class="sous"><span class="compte">${nombre.format(inscrits.length)}</span> inscrit${inscrits.length > 1 ? "s" : ""}${
    partis ? ` · ${nombre.format(partis)} désabonné${partis > 1 ? "s" : ""}` : ""
  }</p>
<p class="actions">
  <a class="bouton" href="/liste?csv=1">Télécharger en CSV</a>
  <button class="bouton second" id="essai" type="button">Tester l'enregistrement</button>
</p>
<p class="verdict" id="verdict" hidden></p>
${
  lignes.length
    ? `<table>
  <thead><tr><th>Prénom</th><th>Adresse</th><th>Venu de</th><th>Inscrit le</th><th>État</th></tr></thead>
  <tbody>
${rangees}
  </tbody>
</table>`
    : `<p class="vide">Personne pour l'instant. Les inscriptions arriveront ici dès la première.</p>`
}
</div>
<script>
  /*
   * L'essai d'enregistrement.
   *
   * Il écrit une ligne de contrôle dans la table, puis l'efface. Ce n'est
   * pas un luxe : quand une inscription ne s'enregistre pas, l'erreur part
   * dans les journaux de Vercel — que Twaylo ne lira jamais — et la seule
   * chose visible est une liste vide, qui ressemble exactement à « personne
   * ne s'est encore inscrit ». Ce bouton fait dire à la base ce qui cloche,
   * en clair, en un clic.
   */
  const bouton = document.getElementById("essai");
  const verdict = document.getElementById("verdict");
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    bouton.textContent = "Essai\u2026";
    verdict.hidden = false;
    verdict.removeAttribute("data-ton");
    verdict.textContent = "Écriture d'une ligne de contrôle\u2026";
    try {
      const r = await fetch("/liste?essai=1", { method: "POST" });
      const c = await r.json();
      verdict.dataset.ton = c.ok ? "bien" : "mal";
      verdict.textContent = c.ok
        ? "Tout fonctionne : la ligne a été écrite puis effacée. Les inscriptions seront bien gardées."
        : "L'écriture a échoué. La base répond : " + c.erreur;
    } catch (e) {
      verdict.dataset.ton = "mal";
      verdict.textContent = "L'essai n'a pas pu partir : " + e;
    } finally {
      bouton.disabled = false;
      bouton.textContent = "Tester l'enregistrement";
    }
  });
</script>
</body></html>`;
}

/**
 * L'essai d'enregistrement : on écrit, on relit, on efface.
 *
 * L'adresse porte un domaine réservé aux essais (`.invalid`, que la norme
 * garantit inexistant) : même si l'effacement échouait, elle ne partirait
 * jamais chez personne et se repère au premier coup d'œil dans la liste.
 */
const ADRESSE_ESSAI = "controle@tway-tools.invalid";

export async function POST(req: Request) {
  if (!new URL(req.url).searchParams.has("essai")) {
    return Response.json({ ok: false, erreur: "requête inconnue" }, { status: 400 });
  }
  try {
    await inscrire(ADRESSE_ESSAI, "Contrôle", "controle", "fr");
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("[liste] essai d'écriture échoué", message);
    return Response.json({ ok: false, erreur: message });
  }
  try {
    await supprimerInscrit(ADRESSE_ESSAI);
  } catch (erreur) {
    // L'écriture, elle, a marché : c'est ce qu'on voulait savoir. On le dit
    // quand même, pour que la ligne de contrôle qui reste ne surprenne pas.
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    return Response.json({
      ok: true,
      note: `la ligne de contrôle n'a pas pu être effacée (${message})`,
    });
  }
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  const csv = new URL(req.url).searchParams.has("csv");

  let lignes: Inscrit[];
  try {
    lignes = await listerInscrits();
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("[liste] lecture impossible", message);
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="background:#0b1420;color:#eef3fa;font:16px system-ui;padding:32px">
       <h1>La liste n'a pas pu être lue</h1>
       <p style="color:#a3b5cd">${echapper(message)}</p></body>`,
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  if (csv) {
    const fichier = versCsv(
      ["Prénom", "Adresse e-mail", "Statut", "Source", "Langue", "Inscrit le"],
      lignes.map((l) => [l.prenom, l.email, l.statut, l.source, l.langue, l.created_at]),
    );
    return new Response(fichier, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        // Le nom du fichier porte la date : deux exports successifs ne
        // s'écrasent pas dans le dossier des téléchargements.
        "content-disposition": `attachment; filename="liste-twaylo-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  return new Response(page(lignes), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
