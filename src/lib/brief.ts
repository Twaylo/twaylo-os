import { calculerSerie, lireHabitudesDef, lireJour, lireTaches } from "./db";
import { lireBlocsFaits, lireJournees } from "./journees-db";
import { lireOubliees } from "./oublies-db";
import { lireProgression } from "./progression-db";
import { relanceDuJour } from "./relance";
import { niveauDepuisUrgence } from "./types";
import {
  BONUS,
  detailXp,
  palierDe,
  prochainPalierSerie,
  xpDuJour,
  type JourChiffre,
} from "./xp";

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

/**
 * L'état chiffré d'une journée, vu du serveur.
 *
 * Il ne suffit pas de relire la ligne stockée : l'instantané des tâches n'est
 * écrit qu'à la clôture du jour, et le récap du soir tomberait donc toujours
 * avant. On recompose donc à partir des sources vivantes — table des tâches,
 * définitions d'habitudes, modèle de journée actif — exactement comme le fait
 * le navigateur. Les deux affichent alors le même chiffre.
 */
async function chiffrerJournee(jour: string): Promise<{
  chiffre: JourChiffre;
  blocs: { id: string; titre: string; debut: string }[];
  blocsFaits: string[];
  nomJournee: string;
}> {
  const [taches, journees, blocsFaits, habitudes, journee] = await Promise.all([
    lireTaches(),
    lireJournees(),
    lireBlocsFaits(jour),
    lireHabitudesDef(),
    lireJour(jour),
  ]);

  const active =
    journees.liste.find((j) => j.id === journees.active) ?? journees.liste[0] ?? null;
  const blocs = (active?.blocs ?? []).map((b) => ({
    id: b.id,
    titre: b.titre,
    debut: b.debut,
  }));

  const faitesJour = journee.etat.faites ?? {};
  const parNiveau = (n: string) =>
    taches.filter((t) => t.statut === "faite" && niveauDepuisUrgence(t.urgence) === n).length;

  return {
    chiffre: {
      blocsFaits: blocs.filter((b) => blocsFaits.includes(b.id)).length,
      blocsTotal: blocs.length,
      habitudesFaites: habitudes.filter((h) => (faitesJour[h.id] ?? []).length > 0).length,
      habitudesTotal: habitudes.length,
      principalesFaites: parNiveau("principal"),
      principalesTotal: taches.filter(
        (t) => niveauDepuisUrgence(t.urgence) === "principal",
      ).length,
      secondairesFaites: parNiveau("secondaire"),
      annexesFaites: parNiveau("annexe"),
      journalEcrit: journee.journal.trim().length > 0,
      uneChoseFaite: Boolean(journee.etat.une_chose?.fait),
      repas: journee.etat.nutrition?.repas?.length ?? 0,
      bonus: journee.etat.bonus ?? [],
    },
    blocs,
    blocsFaits,
    nomJournee: active?.nom ?? "",
  };
}

/** 6 h — le programme : le prioritaire, puis les immuables de la journée type. */
export async function construireBriefMatin(jour: string): Promise<string> {
  const [taches, journees, serie, progression] = await Promise.all([
    lireTaches(),
    lireJournees(),
    calculerSerie(jour),
    lireProgression(jour).catch(() => null),
  ]);

  const lignes: string[] = [`🌅 <b>${dateLisible(jour)} — ta journée</b>`];

  /*
   * La relance passe en tête, avant le programme.
   *
   * Une journée sautée hier n'est pas une information de bas de message :
   * c'est LA chose à savoir en ouvrant le téléphone, et c'est le moment où
   * une reprise coûte encore peu.
   */
  if (progression) {
    const sautes = progression.dernierJourRempli
      ? Math.max(
          0,
          Math.round(
            (Date.parse(`${jour}T00:00:00Z`) -
              Date.parse(`${progression.dernierJourRempli}T00:00:00Z`)) /
              86_400_000,
          ) - 1,
        )
      : 0;
    if (sautes > 0) {
      lignes.push("");
      lignes.push(
        `🕳 <b>${sautes} jour${sautes > 1 ? "s" : ""} sans rien noter.</b> On repart aujourd'hui — une seule coche suffit à relancer la série.`,
      );
    }
  }

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
      const flamme = progression?.seriesBlocs[b.id] ?? 0;
      lignes.push(`${b.debut} — ${html(b.titre)}${flamme >= 3 ? ` 🔥${flamme}` : ""}`);
    }
  }

  /* Le niveau et l'XP à prendre : ce qui donne une raison de cocher tôt. */
  if (progression) {
    const palier = palierDe(progression.xpAvant);
    lignes.push("");
    lignes.push(
      `🎮 Niveau <b>${palier.niveau}</b> · ${palier.grade} — ${palier.pourNiveau - palier.dansNiveau} XP avant le niveau ${palier.niveau + 1}.`,
    );
  }

  if (serie > 0) {
    const prochain = prochainPalierSerie(serie);
    lignes.push(
      `🔥 Série : <b>${serie} jour${serie > 1 ? "s" : ""}</b>${
        prochain ? ` — plus que ${prochain - serie} avant le palier ${prochain}.` : "."
      }`,
    );
  }

  return lignes.join("\n");
}

/** Le soir — le bilan : ce qui est fait, ce qui manque, la série. */
export async function construireRecapSoir(jour: string): Promise<string> {
  const [etatJour, oubliees, serie, progression] = await Promise.all([
    chiffrerJournee(jour),
    lireOubliees(),
    calculerSerie(jour),
    lireProgression(jour).catch(() => null),
  ]);

  const { chiffre, blocs, blocsFaits, nomJournee } = etatJour;
  const xp = xpDuJour(chiffre);

  /*
   * Journée vide : ce n'est plus un récap, c'est un dernier appel.
   *
   * Envoyer « 0/7, 0 habitude, 0 tâche » à quelqu'un qui n'a rien fait ne
   * l'aide pas : il le sait. Ce qui aide, c'est de rappeler ce qui est encore
   * récupérable dans les heures qui restent, et de désigner UN geste.
   */
  if (xp === 0) {
    const relance = relanceDuJour({
      xpJour: 0,
      serie,
      dernierJourRempli: progression?.dernierJourRempli ?? null,
      aujourdhui: jour,
      heure: 21,
      blocsRestants: blocs.filter((b) => !blocsFaits.includes(b.id)).length,
      premierBloc: blocs.find((b) => !blocsFaits.includes(b.id))?.titre,
    });
    const lignes = [`${relance?.emoji ?? "⏳"} <b>${relance?.titre ?? "Journée vide"}</b>`];
    lignes.push("");
    lignes.push(relance?.texte ?? "Rien n'a été noté aujourd'hui.");
    if (serie > 0) {
      lignes.push("");
      lignes.push(
        `🔥 Ta série de <b>${serie} jour${serie > 1 ? "s" : ""}</b> tient encore — jusqu'à minuit.`,
      );
    }
    return lignes.join("\n");
  }

  const lignes: string[] = [`🌙 <b>Récap du jour — ${dateLisible(jour)}</b>`];

  if (blocs.length > 0) {
    const faits = blocs.filter((b) => blocsFaits.includes(b.id));
    lignes.push("");
    lignes.push(
      `📅 <b>Journée type${nomJournee ? ` · ${html(nomJournee)}` : ""} : ${faits.length}/${blocs.length}</b>`,
    );
    for (const b of blocs) {
      lignes.push(`${blocsFaits.includes(b.id) ? "✅" : "⬜️"} ${html(b.titre)}`);
    }
    if (faits.length === blocs.length) lignes.push("Journée type PLIÉE. 💪");
  }

  if (chiffre.habitudesTotal > 0) {
    lignes.push("");
    lignes.push(
      `☑️ Habitudes : <b>${chiffre.habitudesFaites}/${chiffre.habitudesTotal}</b>`,
    );
  }

  const tachesFaites =
    chiffre.principalesFaites + chiffre.secondairesFaites + chiffre.annexesFaites;
  if (tachesFaites > 0 || chiffre.principalesTotal > 0) {
    lignes.push(
      `⭐ Tâches bouclées : <b>${tachesFaites}</b>${
        chiffre.principalesTotal > 0
          ? ` (focus principal ${chiffre.principalesFaites}/${chiffre.principalesTotal})`
          : ""
      }`,
    );
  }

  if (oubliees.length > 0) {
    lignes.push(`🕳 Les Oubliés : <b>${oubliees.length}</b> en attente d'une décision.`);
  }

  /* ---- La partie jeu : l'XP du jour, les bonus, le niveau ---- */

  lignes.push("");
  lignes.push(`⚡ <b>+${xp} XP aujourd'hui</b>`);
  const detail = detailXp(chiffre);
  if (detail.length > 0) {
    lignes.push(detail.map((l) => `${l.emoji} ${html(l.label)} +${l.xp}`).join(" · "));
  }

  const gagnes = chiffre.bonus;
  const manques = BONUS.filter((b) => b.id !== "parfaite" && !gagnes.includes(b.id));
  if (gagnes.length > 0) {
    lignes.push(
      `🏅 Bonus : ${BONUS.filter((b) => gagnes.includes(b.id))
        .map((b) => `${b.emoji} ${b.label}`)
        .join(" · ")}`,
    );
  }
  if (manques.length > 0 && manques.length < BONUS.length - 1) {
    lignes.push(`À un cheveu : ${manques.map((b) => b.label).join(", ")}.`);
  }

  if (progression) {
    const avant = palierDe(progression.xpAvant);
    const apres = palierDe(progression.xpAvant + xp);
    if (apres.niveau > avant.niveau) {
      lignes.push("");
      lignes.push(`🆙 <b>NIVEAU ${apres.niveau} — ${apres.grade}.</b> Tu montes.`);
    } else {
      lignes.push(
        `🎮 Niveau ${apres.niveau} · ${apres.dansNiveau}/${apres.pourNiveau} XP`,
      );
    }
    /*
     * Le record se compare aux jours PRÉCÉDENTS.
     *
     * `progression.record` inclut la ligne d'aujourd'hui telle qu'elle dort en
     * base ; s'en servir reviendrait à comparer la journée à elle-même, et le
     * record ne tomberait jamais.
     */
    const meilleurAvant = Math.max(
      0,
      ...progression.jours.filter((j) => j.jour !== jour).map((j) => j.xp),
    );
    if (meilleurAvant > 0 && xp > meilleurAvant) {
      lignes.push(`🏆 <b>Nouveau record :</b> meilleure journée depuis le début.`);
    }
  }

  lignes.push("");
  const prochain = prochainPalierSerie(serie);
  lignes.push(
    `🔥 Série : <b>${serie} jour${serie > 1 ? "s" : ""}</b>${
      prochain ? ` — palier ${prochain} dans ${prochain - serie}.` : "."
    } À demain.`,
  );

  // Le dimanche, le récap du soir devient aussi le bilan de la semaine.
  if (progression) {
    const semaine = bilanSemaine(jour, progression.jours, xp);
    if (semaine) lignes.push("", semaine);
  }

  return lignes.join("\n");
}

/**
 * Le bilan hebdomadaire, greffé sur le récap du dimanche soir.
 *
 * Greffé, et non envoyé à part : le plan Vercel n'autorise que deux tâches
 * planifiées par jour, et les deux sont prises par le brief et le récap. Une
 * semaine se lit très bien au moment où l'on clôt la dernière journée.
 */
function bilanSemaine(
  jour: string,
  jours: { jour: string; xp: number }[],
  xpAujourdhui: number,
): string | null {
  // 0 = dimanche en UTC ; la date est une clé de jour, pas un instant.
  if (new Date(`${jour}T00:00:00Z`).getUTCDay() !== 0) return null;

  const xpDe = (j: string) =>
    j === jour ? xpAujourdhui : (jours.find((x) => x.jour === j)?.xp ?? 0);

  const sept: { jour: string; xp: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${jour}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const cle = d.toISOString().slice(0, 10);
    sept.push({ jour: cle, xp: xpDe(cle) });
  }

  const total = sept.reduce((n, s) => n + s.xp, 0);
  const tenus = sept.filter((s) => s.xp > 0).length;
  const meilleur = sept.reduce((a, b) => (b.xp > a.xp ? b : a));

  const precedents: number[] = [];
  for (let i = 13; i >= 7; i--) {
    const d = new Date(`${jour}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    precedents.push(xpDe(d.toISOString().slice(0, 10)));
  }
  const totalAvant = precedents.reduce((n, x) => n + x, 0);

  const lignes = [
    "📊 <b>Ta semaine</b>",
    `${total} XP · ${tenus}/7 jours tenus`,
    `Meilleur jour : ${new Date(`${meilleur.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" })} (${meilleur.xp} XP)`,
  ];
  if (totalAvant > 0) {
    const delta = Math.round(((total - totalAvant) / totalAvant) * 100);
    lignes.push(
      delta >= 0
        ? `📈 ${delta > 0 ? `+${delta} %` : "stable"} par rapport à la semaine d'avant.`
        : `📉 ${delta} % par rapport à la semaine d'avant — on rattrape lundi.`,
    );
  }
  return lignes.join("\n");
}
