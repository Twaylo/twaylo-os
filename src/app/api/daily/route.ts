import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireJour } from "@/lib/db";

/**
 * Écrit l'état d'une journée : compteurs d'habitudes, journal, unique chose,
 * repas.
 *
 * Appelée en différé par le navigateur, jamais à chaque frappe — le stockage
 * local sert de tampon instantané, cette route de mémoire durable.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: {
    jour?: string;
    faites?: Record<string, string[]>;
    journal?: string;
    uneChose?: { texte: string; fait: boolean };
    nutrition?: { repas: unknown[] };
    taches?: unknown;
    /** Les blocs de la journée type cochés aujourd'hui. */
    journeeFaits?: unknown;
    /** Les bonus de jeu gagnés aujourd'hui. */
    bonus?: unknown;
  };

  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const { jour } = corps;
  if (!jour || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    return NextResponse.json({ error: "Paramètre `jour` invalide." }, { status: 400 });
  }

  /*
   * Le journal : une chaîne, et pas plus longue que ça.
   *
   * Il partait tel quel, sans même vérifier que c'en était une. Deux raisons
   * de le borner : la ligne du jour est relue entière à chaque écriture (le
   * fusionneur vérifié) et le calcul de progression en relit QUATRE CENTS
   * d'un coup. Un copier-coller d'une page web dans le champ du soir, et
   * c'est tout l'historique qui devient lourd sans que rien ne l'explique.
   * Vingt mille caractères, c'est une dizaine de pages : personne n'écrit ça
   * un soir, et un accident ne fait plus de dégâts.
   */
  const MAX_JOURNAL = 20_000;
  const journal =
    corps.journal === undefined
      ? undefined
      : typeof corps.journal === "string"
        ? corps.journal.slice(0, MAX_JOURNAL)
        : "";

  /*
   * On ne construit le patch qu'avec ce qui a été fourni : un champ absent ne
   * doit pas être écrasé par une valeur vide.
   *
   * Et chaque champ est BORNÉ. La ligne du jour est relue en entier à chaque
   * écriture, et par centaines au calcul de progression : tout ce qui entre
   * ici sans limite se paie ensuite sur chaque lecture d'historique. Les
   * formes sont connues et petites — on s'y tient plutôt que d'écrire ce
   * qu'on nous envoie.
   */
  const etat: Record<string, unknown> = {};

  if (corps.faites !== undefined) {
    const faites: Record<string, string[]> = {};
    for (const [id, options] of Object.entries(corps.faites ?? {}).slice(0, 60)) {
      if (!Array.isArray(options)) continue;
      faites[String(id).slice(0, 40)] = options.slice(0, 12).map((o) => String(o).slice(0, 40));
    }
    etat.faites = faites;
  }

  if (corps.uneChose !== undefined) {
    const u = (corps.uneChose ?? {}) as { texte?: unknown; fait?: unknown };
    etat.une_chose = { texte: String(u.texte ?? "").slice(0, 300), fait: u.fait === true };
  }

  if (corps.nutrition !== undefined) {
    const repas = (corps.nutrition as { repas?: unknown })?.repas;
    etat.nutrition = { repas: Array.isArray(repas) ? repas.slice(0, 24) : [] };
  }

  if (corps.taches !== undefined) {
    const t = (corps.taches ?? {}) as {
      total?: unknown;
      faites?: unknown;
      principalTotal?: unknown;
      principalFaites?: unknown;
      liste?: unknown;
    };
    const entier = (v: unknown) =>
      Number.isFinite(Number(v)) ? Math.max(0, Math.min(9999, Math.round(Number(v)))) : 0;
    etat.taches = {
      total: entier(t.total),
      faites: entier(t.faites),
      principalTotal: entier(t.principalTotal),
      principalFaites: entier(t.principalFaites),
      liste: (Array.isArray(t.liste) ? t.liste : []).slice(0, 200).map((l) => {
        const e = (l ?? {}) as { titre?: unknown; niveau?: unknown; fait?: unknown };
        return {
          titre: String(e.titre ?? "").slice(0, 200),
          niveau: String(e.niveau ?? "secondaire").slice(0, 20),
          fait: e.fait === true,
        };
      }),
    };
  }
  /*
   * Les coches de la journée type passent par ICI, et non par leur propre
   * route.
   *
   * Cocher un bloc lié à une habitude change deux choses de la journée d'un
   * seul geste. Deux requêtes séparées, c'était deux lire-fusionner-écrire
   * concurrents sur la MÊME ligne daily_logs : la seconde repartait d'une
   * lecture prise avant la première, et l'une des deux coches était perdue.
   * Le canal `synchroniserJour` regroupe les changements en une écriture.
   */
  if (Array.isArray(corps.journeeFaits)) {
    etat.journeeFaits = corps.journeeFaits.slice(0, 48).map((f) => String(f).slice(0, 40));
  }
  /*
   * Les bonus s'ajoutent, ils ne remplacent pas : `ecrireJour` fusionne cette
   * clé avec celle déjà en base. Le navigateur peut donc n'envoyer que ce
   * qu'il vient de gagner sans risquer d'effacer le reste.
   */
  if (Array.isArray(corps.bonus)) {
    etat.bonus = corps.bonus.slice(0, 12).map((b) => String(b).slice(0, 24));
  }

  try {
    await ecrireJour(jour, {
      etat: Object.keys(etat).length > 0 ? etat : undefined,
      journal,
    });
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[daily] écriture impossible :", err);
    return NextResponse.json(
      { persiste: false, error: "Écriture impossible." },
      { status: 500 },
    );
  }
}
