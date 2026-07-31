import { calculerSerie, lireHabitudesDef, lireJour, lireTaches } from "./db";
import { lireBlocsFaits, lireJournees } from "./journees-db";
import { lireOubliees } from "./oublies-db";
import { niveauDepuisUrgence } from "./types";

/**
 * Les deux messages Telegram du quotidien : le programme du matin et le récap
 * du soir. Construits ici, envoyés par les routes cron — le Brain n'a pas à
 * réfléchir pour ça, c'est un état des lieux, pas une conversation.
 *
 * Format HTML Telegram (balises <b> uniquement — le reste est du texte brut,
 * les chevrons des titres de blocs sont neutralisés).
 */

function html(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateLisible(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** 6 h — le programme : le prioritaire, puis les immuables de la journée type. */
export async function construireBriefMatin(jour: string): Promise<string> {
  const [taches, journees, serie] = await Promise.all([
    lireTaches(),
    lireJournees(),
    calculerSerie(jour),
  ]);

  const lignes: string[] = [`🌅 <b>${dateLisible(jour)} — ta journée</b>`];

  const principales = taches.filter(
    (t) => niveauDepuisUrgence(t.urgence) === "principal" && t.statut !== "faite",
  );
  lignes.push("");
  lignes.push("⭐ <b>Focus principal</b>");
  if (principales.length === 0) {
    lignes.push("Aucun focus posé — choisis LA chose qui fait ta journée.");
  } else {
    for (const t of principales.slice(0, 6)) lignes.push(`▫️ ${html(t.titre)}`);
  }

  const active =
    journees.liste.find((j) => j.id === journees.active) ?? journees.liste[0];
  if (active && active.blocs.length > 0) {
    lignes.push("");
    lignes.push(`📅 <b>Journée type · ${html(active.nom)}</b>`);
    for (const b of active.blocs) {
      lignes.push(`${b.debut} — ${html(b.titre)}`);
    }
  }

  if (serie > 0) {
    lignes.push("");
    lignes.push(`🔥 Série en cours : <b>${serie} jour${serie > 1 ? "s" : ""}</b> — on la prolonge.`);
  }

  return lignes.join("\n");
}

/** Le soir — le bilan : ce qui est fait, ce qui manque, la série. */
export async function construireRecapSoir(jour: string): Promise<string> {
  const [taches, journees, blocsFaits, habitudes, journee, oubliees, serie] =
    await Promise.all([
      lireTaches(),
      lireJournees(),
      lireBlocsFaits(jour),
      lireHabitudesDef(),
      lireJour(jour),
      lireOubliees(),
      calculerSerie(jour),
    ]);

  const lignes: string[] = [`🌙 <b>Récap du jour — ${dateLisible(jour)}</b>`];

  const active =
    journees.liste.find((j) => j.id === journees.active) ?? journees.liste[0];
  if (active && active.blocs.length > 0) {
    const faits = active.blocs.filter((b) => blocsFaits.includes(b.id));
    const manques = active.blocs.filter((b) => !blocsFaits.includes(b.id));
    lignes.push("");
    lignes.push(`📅 <b>Journée type : ${faits.length}/${active.blocs.length}</b>`);
    for (const b of active.blocs) {
      lignes.push(`${blocsFaits.includes(b.id) ? "✅" : "⬜️"} ${html(b.titre)}`);
    }
    if (manques.length === 0 && faits.length > 0) {
      lignes.push("Journée type PLIÉE. 💪");
    }
  }

  const faitesJour = journee.etat.faites ?? {};
  const habFaites = habitudes.filter((h) => (faitesJour[h.id] ?? []).length > 0).length;
  if (habitudes.length > 0) {
    lignes.push("");
    lignes.push(`☑️ Habitudes : <b>${habFaites}/${habitudes.length}</b>`);
  }

  const total = taches.length;
  const faites = taches.filter((t) => t.statut === "faite").length;
  const principales = taches.filter((t) => niveauDepuisUrgence(t.urgence) === "principal");
  const principalesFaites = principales.filter((t) => t.statut === "faite").length;
  if (total > 0) {
    lignes.push(
      `⭐ Tâches : <b>${faites}/${total}</b>${
        principales.length > 0 ? ` (focus principal ${principalesFaites}/${principales.length})` : ""
      }`,
    );
  }

  if (oubliees.length > 0) {
    lignes.push(`🕳 Les Oubliés : <b>${oubliees.length}</b> en attente d'une décision.`);
  }

  lignes.push("");
  lignes.push(`🔥 Série : <b>${serie} jour${serie > 1 ? "s" : ""}</b>. À demain.`);

  return lignes.join("\n");
}
