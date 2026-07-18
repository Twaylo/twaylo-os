import Anthropic from "@anthropic-ai/sdk";
import type { CaptureType, Urgence } from "@/lib/types";

/**
 * Le classifieur de capture (spec Partie 5).
 *
 * Trois étages, du plus intelligent au plus bête :
 *   1. Claude — comprend le contexte et l'implicite
 *   2. OpenAI — si Anthropic est en panne ou sans clé
 *   3. Regex — toujours disponible, aucune clé requise
 *
 * L'étage 3 n'est pas un cache-misère : c'est ce qui garantit qu'une idée
 * captée à 3h du matin en 4G bolivienne n'est jamais perdue parce qu'une API
 * était injoignable. Le pire cas dégrade la qualité du tri, jamais la capture.
 */

export type Classification = {
  type: CaptureType;
  urgence: Urgence;
  tags: string[];
  resume: string;
  /** Quel étage a répondu — écrit dans captures.classification pour le débogage. */
  moteur: "claude" | "openai" | "regex";
};

const TYPES: CaptureType[] = [
  "tache",
  "idee_video",
  "contact",
  "objectif",
  "depense",
  "note",
  "journal",
];

const URGENCES: Urgence[] = ["aujourdhui", "semaine", "mois", "un_jour"];

const SYSTEM_PROMPT = `Tu tries les captures vocales et textuelles de Twaylo, un YouTubeur-explorateur francophone qui documente les vérités du monde.

Classe chaque capture :

type
- tache        : une action à faire (appeler, envoyer, finir, créer, réserver)
- idee_video   : une idée de contenu, un sujet, un plan à filmer, un angle
- contact      : une personne à rencontrer, relancer, ou dont il faut se souvenir
- objectif     : un but chiffré ou daté (abonnés, vues, revenus, jalons)
- depense      : un achat, un coût, une facture, un budget
- journal      : un vécu, un ressenti, une observation de terrain au passé
- note         : tout le reste

urgence
- aujourdhui : explicitement pour aujourd'hui/ce soir, ou marqué urgent
- semaine    : cette semaine, demain, un jour de la semaine nommé
- mois        : ce mois-ci, une échéance à quelques semaines
- un_jour    : sans échéance

tags   : 0 à 4 mots-clés en minuscules, sans accent, sans le nom du type
resume : reformulation en une phrase courte, à l'infinitif pour une tâche

Le vocal est transcrit automatiquement : ignore les hésitations et les fautes.
En cas de doute sur le type, réponds "note". En cas de doute sur l'urgence, "un_jour".`;

const SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: TYPES },
    urgence: { type: "string", enum: URGENCES },
    tags: { type: "array", items: { type: "string" } },
    resume: { type: "string" },
  },
  required: ["type", "urgence", "tags", "resume"],
  additionalProperties: false,
} as const;

/* ------------------------------------------------------------------ */
/* Étage 3 — regex. Aucune dépendance, aucune clé, aucune latence.     */
/* ------------------------------------------------------------------ */

/**
 * Testé dans l'ordre : le premier motif qui accroche gagne.
 *
 * Principe de l'ordre : **le verbe d'intention l'emporte sur le nom de sujet**.
 * « Rappeler le fixeur » est une tâche même si « fixeur » évoque un contact ;
 * « Valider la miniature » est une tâche même si « miniature » évoque une vidéo.
 * D'où `tache` avant `idee_video` et `contact`.
 */
const TYPE_RULES: { type: CaptureType; pattern: RegExp }[] = [
  {
    // En premier : un montant est une dépense avant d'être quoi que ce soit.
    // Pas de \b après le symbole — « € » n'est pas un caractère de mot, donc
    // « 400 € pour… » ne produit aucune frontière et la règle ne matcherait
    // jamais.
    type: "depense",
    pattern:
      /\d+\s*(€|k€|eur\b|euros?\b)|\b(dépense|depense|facture|budget|coût|cout|coûte|coute|tarif|devis|payé|paye|payer|acheté|achete|abonnement|remboursement)\b/i,
  },
  {
    // Les cibles chiffrées d'audience. Les montants en € sont déjà partis
    // en `depense` au-dessus, donc on ne les liste pas ici.
    type: "objectif",
    pattern:
      /\b(objectif|atteindre|cap\s+(des|du)|palier|jalon)\b|\b\d+\s*(k|m|000)?\s*(abonnés|abonnes|vues|views)\b/i,
  },
  {
    type: "tache",
    pattern:
      /\b(appeler|rappeler|relancer|envoyer|répondre|repondre|réserver|reserver|valider|vérifier|verifier|finir|finaliser|terminer|créer|creer|préparer|preparer|commander|installer|configurer|publier|programmer|boucler|trouver|penser\s+à|ne\s+pas\s+oublier|il\s+faut)\b/i,
  },
  {
    type: "idee_video",
    pattern:
      /\b(idée|idee)\s+(de\s+)?(vidéo|video|short|sujet)|\b(vidéo|video|short|vlog|miniature|thumbnail|tournage|tourner|filmer|montage|séquence|sequence|épisode|episode|teaser|hook|plan\s+d'ouverture)\b/i,
  },
  {
    // Avant `contact` : un récit au passé est un vécu, même s'il mentionne
    // quelqu'un.
    type: "journal",
    pattern:
      /\b(aujourd'hui|ce\s+matin|hier|ce\s+soir)\b.*\bj'(ai|étais|etais)\b|\bj'ai\s+(rencontré|rencontre|vu|ressenti|appris|filmé|filme|passé|passe|dormi|mangé|mange|discuté|discute)\b|\bc'était\b/i,
  },
  {
    type: "contact",
    pattern:
      /\b(contacter|recontacter|rencontrer|présenter|presenter|collab|collaboration|sponsor|partenaire|fixeur|fixeuse|agence|monteur|monteuse|cadreur|interlocuteur)\b|@\w+/i,
  },
];

const URGENCE_RULES: { urgence: Urgence; pattern: RegExp }[] = [
  {
    urgence: "aujourdhui",
    pattern:
      /\b(aujourd'hui|ce\s+soir|ce\s+matin|cet\s+après-midi|cet\s+apres-midi|maintenant|tout\s+de\s+suite|urgent|asap|avant\s+ce\s+soir)\b|\bà\s+\d{1,2}\s*h/i,
  },
  {
    urgence: "semaine",
    pattern:
      /\b(demain|après-demain|apres-demain|(cette|la|de)\s+semaine|d'ici\s+(vendredi|la\s+fin\s+de\s+semaine)|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|week-end|weekend)\b/i,
  },
  {
    urgence: "mois",
    pattern:
      /\b(ce\s+mois|le\s+mois\s+prochain|d'ici\s+(un\s+mois|la\s+fin\s+du\s+mois)|dans\s+(deux|trois|\d)\s+semaines)\b/i,
  },
];

/** Mots vides français — filtrés avant de retenir des tags. */
const STOPWORDS = new Set([
  "avec","pour","dans","chez","sans","sous","cette","cette","celui","celle",
  "leur","leurs","notre","votre","mais","donc","alors","aussi","très","tres",
  "plus","moins","tout","tous","toute","toutes","être","etre","avoir","faire",
  "fait","faut","peux","peut","dois","doit","vais","veux","veut","suis","sont",
  "était","etait","avait","quand","comme","parce","depuis","avant","après",
  "apres","entre","encore","déjà","deja","bien","bon","bonne","juste","vraiment",
]);

/** Retire les accents pour comparer et pour produire des tags stables. */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function regexTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-zà-ÿ0-9']+/i)) {
    const word = raw.replace(/^'+|'+$/g, "");
    if (word.length < 5 || STOPWORDS.has(word)) continue;
    const tag = deaccent(word);
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === 3) break;
  }
  return tags;
}

/** Le résumé de secours : première phrase, coupée proprement sur un mot. */
function regexResume(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0].trim() || text.trim();
  if (firstSentence.length <= 90) return firstSentence;
  const cut = firstSentence.slice(0, 90);
  return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}…`;
}

export function classifyWithRegex(text: string): Classification {
  const type = TYPE_RULES.find((r) => r.pattern.test(text))?.type ?? "note";
  const urgence =
    URGENCE_RULES.find((r) => r.pattern.test(text))?.urgence ?? "un_jour";

  return { type, urgence, tags: regexTags(text), resume: regexResume(text), moteur: "regex" };
}

/* ------------------------------------------------------------------ */
/* Validation — le LLM peut inventer, on ne lui fait pas confiance.    */
/* ------------------------------------------------------------------ */

function coerce(raw: unknown, moteur: "claude" | "openai", text: string): Classification {
  const o = (raw ?? {}) as Record<string, unknown>;
  const fallback = classifyWithRegex(text);

  const type = TYPES.includes(o.type as CaptureType)
    ? (o.type as CaptureType)
    : fallback.type;
  const urgence = URGENCES.includes(o.urgence as Urgence)
    ? (o.urgence as Urgence)
    : fallback.urgence;

  const tags = Array.isArray(o.tags)
    ? o.tags
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => deaccent(t.trim().toLowerCase()))
        .slice(0, 4)
    : [];

  const resume =
    typeof o.resume === "string" && o.resume.trim().length > 0
      ? o.resume.trim()
      : fallback.resume;

  return { type, urgence, tags, resume, moteur };
}

/* ------------------------------------------------------------------ */
/* Étage 1 — Claude                                                     */
/* ------------------------------------------------------------------ */

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

async function classifyWithClaude(text: string): Promise<Classification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    // Réponse contrainte au schéma : pas de JSON à rattraper à la main.
    // `effort: low` et pas de `thinking` — le tri est simple et la cible du
    // pipeline est < 5 s bout en bout (spec Partie 5).
    output_config: {
      format: { type: "json_schema", schema: SCHEMA },
      effort: "low",
    },
    messages: [{ role: "user", content: text }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude a refusé de classer cette capture");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Réponse Claude sans bloc texte");
  }

  return coerce(JSON.parse(block.text), "claude", text);
}

/* ------------------------------------------------------------------ */
/* Étage 2 — OpenAI                                                     */
/* ------------------------------------------------------------------ */

const OPENAI_MODEL = process.env.OPENAI_CLASSIFIER_MODEL ?? "gpt-4o-mini";

async function classifyWithOpenAI(text: string): Promise<Classification> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "classification", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  return coerce(JSON.parse(body.choices[0].message.content), "openai", text);
}

/* ------------------------------------------------------------------ */
/* La cascade                                                           */
/* ------------------------------------------------------------------ */

export async function classifyCapture(text: string): Promise<Classification> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Capture vide");

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await classifyWithClaude(trimmed);
    } catch (err) {
      // Jamais de catch silencieux (spec Partie 10, bug 3).
      console.error("[classify] Claude a échoué, bascule sur OpenAI :", err);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await classifyWithOpenAI(trimmed);
    } catch (err) {
      console.error("[classify] OpenAI a échoué, bascule sur regex :", err);
    }
  }

  return classifyWithRegex(trimmed);
}
