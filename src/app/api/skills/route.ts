import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ecrireSkills, lireSkills } from "@/lib/db";
import type { Skill } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Les compétences de Twaylo (façon RPG). */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ skills: [] });
  try {
    return NextResponse.json({ skills: await lireSkills() });
  } catch (err) {
    console.error("[skills] lecture impossible :", err);
    return NextResponse.json({ error: "Lecture impossible." }, { status: 500 });
  }
}

/** Enregistre la liste complète. Elle est courte : on la revalide entièrement. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ persiste: false });

  let corps: { skills?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (!Array.isArray(corps.skills)) {
    return NextResponse.json({ error: "`skills` doit être une liste." }, { status: 400 });
  }

  // On nettoie chaque entrée plutôt que d'écrire des données extérieures brutes :
  // niveau borné à 0-100, textes coupés, historique réduit au nécessaire.
  const propre: Skill[] = corps.skills
    .slice(0, 60)
    // Une entrée nulle faisait échouer le nettoyage AVANT le try, donc une
    // erreur 500 brute — d'une route dont le rôle est justement d'assainir ce
    // qui vient de l'extérieur.
    .filter((brut): brut is Partial<Skill> => Boolean(brut) && typeof brut === "object")
    .map((brut) => {
    const s = brut as Partial<Skill>;
    return {
      id: String(s.id ?? "").slice(0, 80) || `skill-${Math.abs(hash(String(s.nom ?? "")))}`,
      nom: String(s.nom ?? "").slice(0, 60),
      categorie: String(s.categorie ?? "Autre").slice(0, 40),
      niveau: borner(Number(s.niveau)),
      // `mois` porte soit un mois (`AAAA-MM`, les anciennes données) soit une
      // SEMAINE (`AAAA-MM-JJ`, le lundi qui la commence). Aucune migration
      // n'est possible sur cette base, et les deux formats se trient
      // correctement entre eux dans l'ordre alphabétique.
      historique: Array.isArray(s.historique)
        ? s.historique
            .slice(0, 60)
            .filter(
              (h) =>
                Boolean(h) &&
                typeof h === "object" &&
                /^\d{4}-\d{2}(-\d{2})?$/.test(String((h as { mois?: unknown }).mois)),
            )
            .map((h) => ({
              mois: String((h as { mois: string }).mois),
              niveau: borner(Number((h as { niveau: number }).niveau)),
            }))
        : [],
    };
  });

  try {
    await ecrireSkills(propre);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[skills] écriture impossible :", err);
    return NextResponse.json({ error: "Écriture impossible." }, { status: 500 });
  }
}

function borner(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Repli d'identifiant si `id` manque : dérivé stable du nom. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
