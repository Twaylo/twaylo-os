import Anthropic from "@anthropic-ai/sdk";
import {
  basculerTache,
  creerContact,
  creerObjectif,
  creerTache,
  creerVideo,
  lireTaches,
  type TacheDB,
} from "./db";
import { assemblerContexte, CONSIGNE_BRAIN } from "./brain-contexte";
import type { Niveau } from "./types";

/**
 * Le Brain qui AGIT (spec « Jarvis » de Twaylo).
 *
 * L'ancien flux Telegram classait chaque message en « note » et le rangeait
 * passivement — inutile. Ici, le message part au Brain avec des OUTILS : Claude
 * comprend l'intention et exécute (créer une tâche, la cocher, ajouter une idée
 * vidéo, un contact, un objectif), puis confirme en une phrase. Une simple
 * question reste une réponse, sans outil.
 *
 * Tout passe par les fonctions serveur déjà filtrées sur `user_id`, et aucun
 * outil ne supprime : au pire on ajoute ou on coche, jamais on n'efface.
 */

const OUTILS: Anthropic.Tool[] = [
  {
    name: "creer_tache",
    description:
      "Ajoute une tâche à la todo de Twaylo. Utilise-le dès qu'il exprime quelque chose à faire.",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Le libellé de la tâche, court et clair." },
        niveau: {
          type: "string",
          enum: ["principal", "secondaire", "annexe"],
          description:
            "principal = le focus du jour ; secondaire = ce qui soutient ; annexe = à sortir de la tête. Par défaut secondaire.",
        },
        categorie: {
          type: "string",
          description: "Optionnel : Contenu, Business, Somalie… si Twaylo le précise.",
        },
      },
      required: ["titre"],
    },
  },
  {
    name: "cocher_tache",
    description:
      "Marque une tâche EXISTANTE comme faite, retrouvée par son libellé (approximatif accepté).",
    input_schema: {
      type: "object",
      properties: { titre: { type: "string", description: "Le libellé, même partiel." } },
      required: ["titre"],
    },
  },
  {
    name: "decocher_tache",
    description: "Remet une tâche existante en « à faire », retrouvée par son libellé.",
    input_schema: {
      type: "object",
      properties: { titre: { type: "string" } },
      required: ["titre"],
    },
  },
  {
    name: "ajouter_idee_video",
    description: "Ajoute une idée de vidéo au pipeline contenu.",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string" },
        format: { type: "string", enum: ["short", "long"], description: "Par défaut long." },
      },
      required: ["titre"],
    },
  },
  {
    name: "ajouter_contact",
    description: "Ajoute un contact (collaborateur, sponsor, personne à rappeler).",
    input_schema: {
      type: "object",
      properties: { nom: { type: "string" } },
      required: ["nom"],
    },
  },
  {
    name: "ajouter_objectif",
    description: "Ajoute un objectif sur un horizon donné.",
    input_schema: {
      type: "object",
      properties: {
        objectif: { type: "string" },
        portee: {
          type: "string",
          enum: ["semaine", "mois", "trimestre", "annee"],
          description: "L'horizon de l'objectif.",
        },
      },
      required: ["objectif", "portee"],
    },
  },
];

/** Enlève accents et casse, pour comparer des libellés à l'oreille. */
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents (diacritiques combinants)
    .trim();
}

/** Retrouve la tâche qui colle le mieux au libellé dicté. */
function trouverTache(titre: string, taches: TacheDB[]): TacheDB | null {
  const q = normaliser(titre);
  if (!q) return null;
  // 1. Un libellé qui contient la requête (ou l'inverse) : le plus court gagne.
  const contient = taches
    .filter((t) => {
      const n = normaliser(t.titre);
      return n.includes(q) || q.includes(n);
    })
    .sort((a, b) => a.titre.length - b.titre.length);
  if (contient.length > 0) return contient[0];
  // 2. Sinon, le plus grand chevauchement de mots.
  const mots = new Set(q.split(/\s+/).filter((m) => m.length > 2));
  let meilleur: TacheDB | null = null;
  let meilleurScore = 0;
  for (const t of taches) {
    const nm = new Set(normaliser(t.titre).split(/\s+/));
    let score = 0;
    for (const m of mots) if (nm.has(m)) score += 1;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = t;
    }
  }
  return meilleurScore > 0 ? meilleur : null;
}

/** Exécute un outil et renvoie une phrase de résultat pour Claude. */
async function executer(nom: string, entree: Record<string, unknown>): Promise<string> {
  switch (nom) {
    case "creer_tache": {
      const titre = String(entree.titre ?? "").trim();
      if (!titre) return "Titre manquant.";
      const niveau = (entree.niveau as Niveau) ?? "secondaire";
      const categorie = entree.categorie ? String(entree.categorie) : undefined;
      await creerTache(titre, categorie, niveau);
      return `Tâche créée : « ${titre} » (${niveau}).`;
    }
    case "cocher_tache":
    case "decocher_tache": {
      const faite = nom === "cocher_tache";
      const cible = trouverTache(String(entree.titre ?? ""), await lireTaches());
      if (!cible) return `Aucune tâche ne correspond à « ${entree.titre} ».`;
      await basculerTache(cible.id, faite);
      return `${faite ? "Cochée" : "Décochée"} : « ${cible.titre} ».`;
    }
    case "ajouter_idee_video": {
      const titre = String(entree.titre ?? "").trim();
      if (!titre) return "Titre manquant.";
      const format = entree.format === "short" ? "short" : "long";
      await creerVideo(titre, format);
      return `Idée vidéo ajoutée au pipeline : « ${titre} » (${format}).`;
    }
    case "ajouter_contact": {
      const nom2 = String(entree.nom ?? "").trim();
      if (!nom2) return "Nom manquant.";
      await creerContact(nom2);
      return `Contact ajouté : « ${nom2} ».`;
    }
    case "ajouter_objectif": {
      const objectif = String(entree.objectif ?? "").trim();
      const portee = String(entree.portee ?? "");
      if (!objectif || !["semaine", "mois", "trimestre", "annee"].includes(portee)) {
        return "Objectif ou horizon invalide.";
      }
      await creerObjectif(objectif, portee, { pct: 0, valeur: "", etapes: [] });
      return `Objectif ajouté (${portee}) : « ${objectif} ».`;
    }
    default:
      return `Outil inconnu : ${nom}.`;
  }
}

const CONSIGNE_AGENT = `${CONSIGNE_BRAIN}

Tu es joint depuis Telegram, en vocal ou par écrit. Deux différences avec d'habitude :
- Tu peux AGIR sur l'OS via les outils fournis (créer une tâche, la cocher, ajouter une idée vidéo, un contact, un objectif). Utilise-les dès que Twaylo demande une action, sans redemander confirmation.
- Réponds COURT — c'est un message Telegram, pas un essai. Une à trois phrases. Après une action, confirme ce que tu as fait en une phrase. Pas de mise en forme Markdown lourde.
Si c'est juste une question, réponds sans outil.`;

/**
 * Envoie le message de Twaylo au Brain, laisse Claude agir via les outils, et
 * renvoie sa réponse finale (texte prêt à envoyer sur Telegram).
 */
export async function repondreEtAgir(message: string, jour: string): Promise<string> {
  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) throw new Error("ANTHROPIC_API_KEY manquant — le Brain ne peut pas répondre.");

  const contexte = await assemblerContexte(jour);
  const client = new Anthropic({ apiKey: cle });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
  let reponse = "";

  // Boucle d'agent : Claude appelle des outils, on les exécute, on lui rend les
  // résultats, jusqu'à ce qu'il n'ait plus d'action à mener. Le plafond de tours
  // est un garde-fou contre une boucle qui s'emballe.
  for (let tour = 0; tour < 6; tour++) {
    const rep = await client.messages.create({
      // Haiku par défaut : sur Telegram, la vitesse prime, et créer/cocher une
      // tâche ou répondre court n'exige pas Opus. Surchargeable via l'env si un
      // jour on veut plus de finesse.
      model: process.env.BRAIN_TELEGRAM_MODEL ?? "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        { type: "text", text: CONSIGNE_AGENT },
        { type: "text", text: `\n\n# État actuel de l'OS de Twaylo\n\n${contexte}` },
      ],
      tools: OUTILS,
      messages,
    });

    messages.push({ role: "assistant", content: rep.content });

    const outils = rep.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (rep.stop_reason !== "tool_use" || outils.length === 0) {
      reponse = rep.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    const resultats: Anthropic.ToolResultBlockParam[] = [];
    for (const outil of outils) {
      let contenu: string;
      try {
        contenu = await executer(outil.name, outil.input as Record<string, unknown>);
      } catch (err) {
        console.error(`[brain-agent] outil ${outil.name} en échec :`, err);
        contenu = `Échec de l'action ${outil.name}.`;
      }
      resultats.push({ type: "tool_result", tool_use_id: outil.id, content: contenu });
    }
    messages.push({ role: "user", content: resultats });
  }

  return reponse || "C'est fait.";
}
