import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { CATEGORIES_BLOC } from "@/lib/journees";
import { MAX, nettoyerPlan, planUtilisable } from "@/lib/sas-plan";
import { reponsesValides, resumerReponses } from "@/lib/sas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Le sas : six réponses en entrée, un espace de travail en sortie.
 *
 * Cette route ne fait que PROPOSER. Elle n'écrit rien : le plan revient à
 * l'écran, la personne le voit avant qu'il ne touche à quoi que ce soit, et
 * c'est `/api/sas/appliquer` qui l'enregistre. Un sas qui remplacerait la
 * journée type sans montrer ce qu'il met à la place serait un sas qu'on
 * n'ose plus lancer une seconde fois.
 */

const CONSIGNE = `Tu construis l'espace de travail de départ d'un tableau de bord personnel, à partir de ce qu'une personne vient de répondre.

Tu réponds UNIQUEMENT par un objet JSON, sans texte autour, avec exactement ces clés :

{
  "resume": "une phrase à la deuxième personne du singulier, qui dit ce que tu as construit et pourquoi",
  "blocs": [{ "debut": "07:00", "fin": "08:00", "titre": "…", "categorie": "…" }],
  "habitudes": [{ "nom": "…", "categorie": "…", "options": ["…"] }],
  "objectifs": [{ "objectif": "…", "portee": "semaine|mois|trimestre|annee" }],
  "skills": [{ "nom": "…", "categorie": "Langues|Création|Business|Corps|Autre", "niveau": 0-60 }]
}

Catégories de blocs autorisées : ${Object.keys(CATEGORIES_BLOC).join(", ")}.

Les règles qui comptent :

- MOINS, ET MIEUX. Au plus ${MAX.blocs} blocs, ${MAX.habitudes} habitudes, ${MAX.objectifs} objectifs, ${MAX.skills} compétences — et vise plutôt la moitié. Un espace de départ surchargé est abandonné en trois jours ; un espace léger se remplit tout seul.
- LA CONTRAINTE DE TEMPS EST UN PLAFOND, pas une suggestion. Si la personne dit avoir moins de deux heures à elle, la journée type ne contient pas six heures de blocs.
- LE CRÉNEAU DE FORME décide de l'ordre : ce qui demande le plus d'énergie s'y place, jamais à l'opposé.
- L'OBSTACLE DÉCLARÉ oriente les habitudes. Quelqu'un qui « en met trop d'un coup » reçoit deux habitudes, pas six. Quelqu'un qui « ne sait pas par où commencer » reçoit des blocs très concrets, avec un verbe.
- DES INTITULÉS CONCRETS. « Sport » ne dit rien. « 30 min de renfo » dit quoi faire.
- Les niveaux de compétence de départ restent bas : c'est un point de départ à faire monter, pas une note d'auto-satisfaction.
- Tout en FRANÇAIS, tutoiement.`;

export async function POST(req: Request) {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return NextResponse.json(
      { error: "L'assistant n'est pas configuré sur ce serveur." },
      { status: 503 },
    );
  }

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }

  const reponses = (corps as { reponses?: unknown })?.reponses;
  if (!reponsesValides(reponses)) {
    return NextResponse.json({ error: "Réponses incomplètes." }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey: cle });
    const reponse = await client.messages.create({
      model: process.env.SAS_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 2000,
      system: CONSIGNE,
      messages: [{ role: "user", content: resumerReponses(reponses) }],
    });

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    /*
     * On découpe entre la première accolade et la dernière.
     *
     * Même avec une consigne stricte, un modèle ajoute parfois une phrase
     * avant ou un bloc de code autour. Exiger un JSON parfaitement nu ferait
     * échouer le sas sur un détail de mise en forme, alors que la réponse est
     * bonne.
     */
    const debut = texte.indexOf("{");
    const fin = texte.lastIndexOf("}");
    if (debut === -1 || fin <= debut) throw new Error("réponse sans objet JSON");

    const plan = nettoyerPlan(JSON.parse(texte.slice(debut, fin + 1)));
    if (!planUtilisable(plan)) throw new Error("plan vide après nettoyage");

    return NextResponse.json({ plan });
  } catch (err) {
    console.error("[sas] construction impossible :", err);
    return NextResponse.json(
      { error: "La construction a échoué. Réessaie dans un instant." },
      { status: 502 },
    );
  }
}
