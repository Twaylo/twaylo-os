import { NextResponse } from "next/server";

import { creerObjectif, ecrireHabitudesDef, ecrireSkills, lireHabitudesDef, lireSkills } from "@/lib/db";
import { ecrireJournees, lireJournees } from "@/lib/journees-db";
import { nettoyerPlan, planUtilisable, type PlanOs } from "@/lib/sas-plan";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cleSemaine } from "@/lib/skills-suivi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Applique le plan du sas.
 *
 * Le plan est RENETTOYÉ ici, alors qu'il l'a déjà été à sa création. Ce n'est
 * pas de la redondance : entre les deux, il est passé par le navigateur, où
 * n'importe quoi a pu lui arriver. Une route qui écrit en base ne fait jamais
 * confiance à ce qui lui revient de l'écran.
 *
 * Rien n'est REMPLACÉ, tout est AJOUTÉ. Le sas peut être relancé quand on veut ;
 * s'il écrasait la journée type et les habitudes, le relancer par curiosité
 * effacerait des semaines de réglages.
 */

function identifiant(prefixe: string, nom: string, i: number): string {
  const base = nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${prefixe}-${base || "item"}-${i}`;
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "La base n'est pas configurée." }, { status: 503 });
  }

  let plan: PlanOs;
  try {
    plan = nettoyerPlan((await req.json())?.plan);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  if (!planUtilisable(plan)) {
    return NextResponse.json({ error: "Plan vide." }, { status: 400 });
  }

  const pose = { journee: 0, habitudes: 0, objectifs: 0, skills: 0 };
  const rates: string[] = [];

  /*
   * Chaque partie est posée séparément, et un échec n'arrête pas les autres.
   *
   * Les quatre écritures touchent des endroits différents de la base. Tout
   * abandonner parce que la création d'un objectif a échoué laisserait la
   * personne devant un espace à moitié construit sans le savoir — alors qu'on
   * peut lui dire exactement ce qui manque.
   */

  if (plan.blocs.length > 0) {
    try {
      const config = await lireJournees();
      const id = `sas-${Date.now().toString(36)}`;
      const journee = {
        id,
        nom: "Ma journée",
        blocs: plan.blocs.map((b, i) => ({
          id: identifiant("b", b.titre, i),
          debut: b.debut,
          fin: b.fin,
          titre: b.titre,
          categorie: b.categorie,
          habitude: "",
          habitudeOption: "",
        })),
      };
      // Ajoutée ET rendue active : une journée type construite mais rangée
      // derrière un menu ne serait jamais vue.
      await ecrireJournees({ active: id, liste: [...config.liste, journee] });
      pose.journee = journee.blocs.length;
    } catch (err) {
      console.error("[sas] journée type impossible :", err);
      rates.push("la journée type");
    }
  }

  if (plan.habitudes.length > 0) {
    try {
      const actuelles = await lireHabitudesDef();
      const connus = new Set(actuelles.map((h) => h.nom.toLowerCase()));
      const ajouts = plan.habitudes
        .filter((h) => !connus.has(h.nom.toLowerCase()))
        .map((h, i) => ({
          id: identifiant("h", h.nom, i),
          nom: h.nom,
          categorie: h.categorie,
          options: h.options,
        }));
      if (ajouts.length > 0) await ecrireHabitudesDef([...actuelles, ...ajouts]);
      pose.habitudes = ajouts.length;
    } catch (err) {
      console.error("[sas] habitudes impossibles :", err);
      rates.push("les habitudes");
    }
  }

  if (plan.skills.length > 0) {
    try {
      const actuelles = await lireSkills();
      const connus = new Set(actuelles.map((s) => s.nom.toLowerCase()));
      const semaine = cleSemaine();
      const ajouts = plan.skills
        .filter((s) => !connus.has(s.nom.toLowerCase()))
        .map((s, i) => ({
          id: identifiant("s", s.nom, i),
          nom: s.nom,
          categorie: s.categorie,
          niveau: s.niveau,
          // Un premier point posé tout de suite : sans lui la courbe ne
          // démarrerait qu'à la semaine suivante.
          historique: [{ mois: semaine, niveau: s.niveau }],
        }));
      if (ajouts.length > 0) await ecrireSkills([...actuelles, ...ajouts]);
      pose.skills = ajouts.length;
    } catch (err) {
      console.error("[sas] compétences impossibles :", err);
      rates.push("les compétences");
    }
  }

  for (const o of plan.objectifs) {
    try {
      await creerObjectif(o.objectif, o.portee, { pct: 0, valeur: "", etapes: [] });
      pose.objectifs += 1;
    } catch (err) {
      console.error("[sas] objectif impossible :", err);
    }
  }
  if (pose.objectifs === 0 && plan.objectifs.length > 0) rates.push("les objectifs");

  return NextResponse.json({ ok: rates.length === 0, pose, rates });
}
