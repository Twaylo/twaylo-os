import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { assemblerContexte, CONSIGNE_BRAIN } from "@/lib/brain-contexte";

// Le contexte est relu à chaque question : rien ne peut être calculé au build.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ce que le brain a sous les yeux, tel quel.
 *
 * Utile pour deux raisons : vérifier que le contexte s'assemble correctement
 * sans dépenser un appel au modèle, et permettre à Twaylo de voir exactement
 * ce que son brain sait de lui — un assistant dont on ne peut pas inspecter
 * la mémoire n'inspire pas confiance.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Base non configurée." }, { status: 503 });
  }
  try {
    const jour = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const contexte = await assemblerContexte(jour);
    return new Response(contexte, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("[brain] contexte illisible :", err);
    return NextResponse.json({ error: "Contexte illisible." }, { status: 500 });
  }
}

/**
 * Le brain répond en flux.
 *
 * Twaylo a demandé de la vitesse : voir la réponse s'écrire mot à mot vaut
 * mieux qu'attendre huit secondes devant un écran vide, même quand le total
 * est identique. Le flux est aussi ce qui évite d'atteindre le délai maximal
 * d'une requête sur une réponse longue.
 */
export async function POST(req: Request) {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local pour activer le brain.",
      },
      { status: 503 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Base non configurée : le brain n'a rien à lire." },
      { status: 503 },
    );
  }

  let corps: { question?: unknown; historique?: unknown };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const question = typeof corps.question === "string" ? corps.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Question vide." }, { status: 400 });
  }

  // L'historique vient du navigateur : on ne garde que ce qui a la bonne forme.
  const historique = Array.isArray(corps.historique)
    ? corps.historique
        .filter(
          (m): m is { role: "user" | "assistant"; contenu: string } =>
            typeof m === "object" &&
            m !== null &&
            ((m as { role?: unknown }).role === "user" ||
              (m as { role?: unknown }).role === "assistant") &&
            typeof (m as { contenu?: unknown }).contenu === "string",
        )
        .slice(-10)
    : [];

  /*
   * L'API Messages exige que le premier message porte le rôle « user ».
   *
   * `slice(-10)` coupe dans une suite qui alterne user/assistant : au bout de
   * cinq échanges, la fenêtre pouvait commencer par une réponse de
   * l'assistant, et l'appel partait en erreur 400 — le brain devenait muet
   * précisément quand la conversation devenait intéressante.
   */
  while (historique.length > 0 && historique[0].role !== "user") historique.shift();

  try {
    const jour = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const contexte = await assemblerContexte(jour);

    const client = new Anthropic({ apiKey: cle });

    const flux = client.messages.stream({
      // Opus par défaut, comme partout ailleurs dans le projet. Pour dépenser
      // moins, poser ANTHROPIC_MODEL=claude-haiku-4-5 dans .env.local : cinq
      // fois moins cher, largement suffisant pour « qu'est-ce que je fais
      // maintenant ». Le choix reste celui de Twaylo, pas le mien.
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      // Les réponses du brain sont courtes par consigne. Ce plafond n'est pas
      // une cible : il empêche seulement une réponse partie en vrille de
      // coûter dix fois le prix d'une réponse normale.
      max_tokens: 1536,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: CONSIGNE_BRAIN,
          /*
           * Pas de `cache_control` ici, contrairement à ce que j'avais écrit.
           *
           * La mise en cache exige un préfixe d'au moins 1024 jetons ; la
           * consigne plus le contexte de Twaylo en font aujourd'hui bien
           * moins. Le marqueur ne mettait donc rien en cache tout en laissant
           * croire le contraire — et un cache écrit coûte 25 % de plus qu'une
           * lecture normale. À reposer quand le journal aura grossi.
           */
        },
        { type: "text", text: `\n\n# État actuel de l'OS de Twaylo\n\n${contexte}` },
      ],
      messages: [
        // Un message au contenu vide (réponse précédente ratée) fait rejeter
        // tout l'appel par l'API : « text content blocks must be non-empty ».
        // On les écarte, ce qui débloque la conversation au tour suivant.
        ...historique
          .filter((m) => m.contenu.trim() !== "")
          .map((m) => ({ role: m.role, content: m.contenu })),
        { role: "user" as const, content: question },
      ],
    });

    const encodeur = new TextEncoder();
    const corpsReponse = new ReadableStream({
      async start(controller) {
        try {
          for await (const evenement of flux) {
            if (
              evenement.type === "content_block_delta" &&
              evenement.delta.type === "text_delta"
            ) {
              controller.enqueue(encodeur.encode(evenement.delta.text));
            }
          }
        } catch (err) {
          console.error("[brain] flux interrompu :", err);
          // Marqueur clair : sans lui, une erreur d'API passait pour une
          // réponse tronquée normale, et Twaylo n'avait aucun moyen de savoir
          // que le brain avait planté.
          controller.enqueue(
            encodeur.encode("\n\n⚠️ Le brain a rencontré une erreur. Réessaie."),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(corpsReponse, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Empêche un proxy de mettre la réponse en tampon, ce qui annulerait
        // tout l'intérêt du flux.
        "cache-control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("[brain] réponse impossible :", err);
    return NextResponse.json({ error: "Le brain n'a pas pu répondre." }, { status: 500 });
  }
}
