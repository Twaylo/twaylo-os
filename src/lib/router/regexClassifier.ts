import type { CaptureType, Urgence } from "@/lib/types";

/**
 * L'étage regex du classifieur, isolé dans son propre fichier.
 *
 * Pourquoi séparé : ce fichier ne dépend de RIEN. Il peut donc tourner dans
 * le navigateur, instantanément, sans embarquer le SDK Anthropic dans le
 * bundle client. La barre de capture s'en sert pour afficher un verdict en
 * 0 ms pendant que le serveur affine avec Claude.
 */

export type Classification = {
  type: CaptureType;
  urgence: Urgence;
  tags: string[];
  resume: string;
  /** Quel étage a répondu — écrit dans captures.classification pour le débogage. */
  moteur: "claude" | "openai" | "regex";
};

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
export function deaccent(s: string): string {
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

