import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * Estime les macros d'un repas décrit en français (spec Miles 5.5).
 *
 * Sans clé Anthropic, on renvoie une estimation grossière plutôt qu'une
 * erreur : Twaylo peut toujours corriger les chiffres à la main, et le repas
 * est enregistré. Même principe que le classifieur — la dégradation touche
 * la précision, jamais la capture.
 */

const SCHEMA = {
  type: "object",
  properties: {
    n: { type: "string" },
    kcal: { type: "integer" },
    p: { type: "integer" },
    c: { type: "integer" },
    f: { type: "integer" },
  },
  required: ["n", "kcal", "p", "c", "f"],
  additionalProperties: false,
} as const;

const SYSTEM = `Tu estimes les macronutriments d'un repas décrit en français.

Renvoie :
- n    : le nom court du repas, reformulé proprement (ex. « Poulet riz brocolis »)
- kcal : calories totales
- p    : protéines en grammes
- c    : glucides en grammes
- f    : lipides en grammes

Base-toi sur des portions standard quand la quantité n'est pas précisée.
Reste cohérent : kcal doit approcher 4×p + 4×c + 9×f.`;

/** Repli hors ligne : une portion « moyenne » que Twaylo corrigera. */
function estimationParDefaut(texte: string) {
  const n = texte.trim().slice(0, 60);
  return { n, kcal: 500, p: 25, c: 55, f: 18, approximatif: true };
}

export async function POST(req: Request) {
  let texte: unknown;
  try {
    ({ texte } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof texte !== "string" || texte.trim().length === 0) {
    return NextResponse.json({ error: "Texte manquant." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(estimationParDefaut(texte));
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      max_tokens: 256,
      system: SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
        effort: "low",
      },
      messages: [{ role: "user", content: texte }],
    });

    if (response.stop_reason === "refusal") throw new Error("refus");

    const bloc = response.content.find((b) => b.type === "text");
    if (!bloc || bloc.type !== "text") throw new Error("réponse sans texte");

    return NextResponse.json(JSON.parse(bloc.text));
  } catch (err) {
    console.error("[nutrition] estimation IA impossible :", err);
    return NextResponse.json(estimationParDefaut(texte));
  }
}
