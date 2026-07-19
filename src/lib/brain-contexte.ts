import { supabaseAdmin, USER_ID } from "./supabase";
import {
  lireBlocages,
  lireContacts,
  lireDeals,
  lireHabitudesDef,
  lireJour,
  lireOrdreTaches,
  lireTaches,
  lireVideos,
  calculerSerie,
  type EtatJour,
} from "./db";
import { NIVEAUX, niveauDepuisUrgence, type Niveau } from "./types";
import { lireAgendaSemaine } from "./agenda";

/**
 * Ce que le brain sait de Twaylo.
 *
 * Tout est relu à chaque question plutôt que mis en cache : une réponse à
 * « qu'est-ce que je fais maintenant ? » qui s'appuierait sur l'état d'il y a
 * dix minutes serait pire que pas de réponse du tout.
 *
 * Le contexte est assemblé en texte, pas en JSON. Un modèle lit mieux une
 * liste écrite qu'une structure imbriquée, et ça coûte moins de jetons.
 */

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Les derniers jours de journal, pour que le brain ait de la mémoire. */
async function lireJournalRecent(
  jusqua: string,
  combien = 14,
): Promise<{ jour: string; texte: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("jour, journal_texte")
    .eq("user_id", USER_ID)
    .neq("jour", "2000-01-01")
    .lte("jour", jusqua)
    .order("jour", { ascending: false })
    .limit(combien);

  if (error) throw error;
  return (data ?? [])
    .filter((l) => (l.journal_texte ?? "").trim())
    .map((l) => ({ jour: l.jour as string, texte: (l.journal_texte as string).trim() }));
}

export async function assemblerContexte(jour: string): Promise<string> {
  // En parallèle : aucune de ces lectures ne dépend des autres, et le brain
  // doit répondre vite.
  const [taches, journee, habitudes, blocages, deals, contacts, videos, serie, journal, agenda, ordre] =
    await Promise.all([
      lireTaches(),
      lireJour(jour),
      lireHabitudesDef(),
      lireBlocages(),
      lireDeals(),
      lireContacts(),
      lireVideos(),
      calculerSerie(jour),
      lireJournalRecent(jour),
      // L'agenda peut être absent ou injoignable : il ne doit pas faire
      // échouer toute la réponse.
      lireAgendaSemaine().catch(() => []),
      lireOrdreTaches(),
    ]);

  const bloc: string[] = [];
  const aujourdhui = new Date(`${jour}T12:00:00Z`);

  bloc.push(`# Aujourd'hui\n${JOURS[(aujourdhui.getUTCDay() + 6) % 7]} ${jour}`);
  bloc.push(`Série en cours : ${serie} jour${serie > 1 ? "s" : ""} d'affilée.`);

  if (journee.etat.une_chose?.texte) {
    const u = journee.etat.une_chose;
    bloc.push(`Focus du jour : ${u.texte}${u.fait ? " (fait)" : " (pas encore fait)"}`);
  }

  /* ---- Tâches, par niveau ---- */
  const parNiveau: Record<Niveau, string[]> = {
    principal: [],
    secondaire: [],
    annexe: [],
  };
  // Dans l'ordre choisi par Twaylo, pas dans l'ordre de création : quand il
  // demande « qu'est-ce que je fais maintenant », le haut de sa liste est la
  // réponse, et c'est un ordre qu'il a rangé à la main.
  const rang = new Map(ordre.map((id, i) => [id, i]));
  const tachesOrdonnees = [...taches].sort(
    (a, b) =>
      (rang.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rang.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );

  for (const t of tachesOrdonnees) {
    const n = niveauDepuisUrgence(t.urgence);
    parNiveau[n].push(`${t.statut === "faite" ? "[x]" : "[ ]"} ${t.titre}`);
  }
  const lignesTaches: string[] = [];
  for (const n of ["principal", "secondaire", "annexe"] as Niveau[]) {
    if (parNiveau[n].length === 0) continue;
    lignesTaches.push(`## ${NIVEAUX[n].nom}\n${parNiveau[n].join("\n")}`);
  }
  if (lignesTaches.length) bloc.push(`# Tâches\n${lignesTaches.join("\n\n")}`);

  /* ---- Habitudes ---- */
  const faites = (journee.etat as EtatJour).faites ?? {};
  const lignesHabitudes = habitudes.map((h) => {
    const f = faites[h.id] ?? [];
    if (f.length === 0) return `[ ] ${h.nom}`;
    // « fait » est le marqueur des habitudes sans variante : inutile à citer.
    const detail = f.filter((o) => o !== "fait");
    return `[x] ${h.nom}${detail.length ? ` — ${detail.join(", ")}` : ""}`;
  });
  if (lignesHabitudes.length) bloc.push(`# Habitudes du jour\n${lignesHabitudes.join("\n")}`);

  /* ---- Ce qui coince ---- */
  if (blocages.length) {
    const lignes = blocages.map((b) => {
      const jours = Math.round(
        (Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${b.depuis}T00:00:00Z`)) / 86_400_000,
      );
      return `- ${b.texte} — chez ${b.proprietaire}, depuis ${jours} jour(s)`;
    });
    bloc.push(`# Ce qui coince\n${lignes.join("\n")}`);
  }

  /* ---- Agenda ---- */
  if (agenda.length) {
    const lignes = agenda.map(
      (e) => `- ${JOURS[e.jourIndex]} ${e.heure || "(journée)"} — ${e.titre}`,
    );
    bloc.push(`# Agenda de la semaine\n${lignes.join("\n")}`);
  }

  /* ---- Contenu ---- */
  if (videos.length) {
    const lignes = videos.map((v) => `- [${v.statut}] ${v.titre} (${v.format})`);
    bloc.push(`# Pipeline vidéo\n${lignes.join("\n")}`);
  }

  /* ---- Business ---- */
  if (deals.length) {
    const lignes = deals.map(
      (d) => `- ${d.nom} — ${d.etape}${d.montant ? ` — ${d.montant} €` : ""}${d.note ? ` — ${d.note}` : ""}`,
    );
    bloc.push(`# Sponsors\n${lignes.join("\n")}`);
  }

  if (contacts.length) {
    const lignes = contacts.map(
      (c) => `- ${c.nom}${c.role ? ` (${c.role})` : ""} — ${c.relation}${c.prochaine_action ? ` — à faire : ${c.prochaine_action}` : ""}`,
    );
    bloc.push(`# Contacts\n${lignes.join("\n")}`);
  }

  /* ---- Journal ---- */
  if (journal.length) {
    const lignes = journal.map((j) => `## ${j.jour}\n${j.texte}`);
    bloc.push(`# Journal des derniers jours\n${lignes.join("\n\n")}`);
  }

  return bloc.join("\n\n");
}

export const CONSIGNE_BRAIN = `Tu es le brain de Twaylo : son second cerveau, branché en direct sur son OS personnel.

Twaylo est YouTubeur et explorateur, français. Il te parle en français, tu réponds en français.

Ce que tu as sous les yeux ci-dessous est son état RÉEL à cet instant : ses tâches, ses habitudes, son agenda, ses blocages, son pipeline vidéo, ses sponsors, ses contacts, son journal.

Comment répondre :
- Court. Il te consulte entre deux tournages, pas pour lire un rapport.
- Concret. Cite ses vraies tâches, ses vraies dates, ses vrais noms. Jamais de généralités sur la productivité.
- Direct. S'il te demande quoi faire maintenant, donne UNE chose, pas une liste de dix.
- Honnête. Si l'information n'est pas dans son état, dis-le au lieu d'inventer. Ne devine jamais un chiffre, une date ou un nom.
- Sans flagornerie. Pas de « excellente question ». Tu réponds, c'est tout.

Si tu remarques quelque chose qu'il n'a pas demandé mais qui compte — un blocage qui traîne depuis trois semaines, un sponsor jamais relancé, une habitude abandonnée depuis dix jours — dis-le en une phrase à la fin.`;
