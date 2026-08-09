import Anthropic from "@anthropic-ai/sdk";
import {
  archiverTache,
  basculerTache,
  changerNiveauTache,
  creerContact,
  creerObjectif,
  creerTache,
  creerVideo,
  deplacerVideo,
  ecrireBlocages,
  ecrireJour,
  ecrireSkills,
  ETAPES,
  ETAPES_DEAL,
  lireBlocages,
  lireDeals,
  lireHabitudesDef,
  lireJour,
  lireObjectifs,
  lireSkills,
  lireTaches,
  lireVideos,
  majDeal,
  placerEnTeteOrdre,
  majObjectif,
  type DealDB,
  type ObjectifDB,
  type TacheDB,
  type VideoDB,
} from "./db";
import { lireOubliees, reprendreOubliee } from "./oublies-db";
import { NIVEAUX } from "./types";
import { lireStatsHabitudes } from "./habitudes-stats";
import {
  ecrireBlocsFaits,
  ecrireJournees,
  lireBlocsFaits,
  lireJournees,
} from "./journees-db";
import { lireStatsTaches } from "./taches-stats";
import { lireStatsNutrition } from "./nutrition-stats";
import { lireStatsYoutube } from "./youtube";
import { agendaConfigure, lireAgendaSemaine } from "./agenda";

/** Les jours de la semaine, 0 = lundi (comme jourIndex des événements). */
const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
import { assemblerContexte, CONSIGNE_BRAIN } from "./brain-contexte";
import type { Niveau } from "./types";

/** Le libellé lisible d'une étape de deal, pour les confirmations. */
const LIBELLE_ETAPE: Record<string, string> = {
  prospect: "Prospect",
  negociation: "Négociation",
  signe: "Signé",
  livre: "Livré",
  regle: "Réglé",
};

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
  {
    name: "noter_journal",
    description:
      "Écrit une note dans le journal du jour de Twaylo, à la suite de ce qui y est déjà. À utiliser DÈS qu'il dit de noter quelque chose dans son journal ou te confie une pensée à garder — n'oublie jamais de l'écrire vraiment.",
    input_schema: {
      type: "object",
      properties: { texte: { type: "string", description: "Le texte à consigner." } },
      required: ["texte"],
    },
  },
  {
    name: "consulter_historique",
    description:
      "Lit l'historique et les statistiques d'un domaine (taux, séries, tendances, jour faible). À utiliser dès que Twaylo veut discuter de ses habitudes, de sa régularité ou de ses données dans le temps.",
    input_schema: {
      type: "object",
      properties: {
        domaine: { type: "string", enum: ["habitudes", "taches", "nutrition"] },
      },
      required: ["domaine"],
    },
  },
  {
    name: "consulter_revenus",
    description:
      "Lit les revenus YouTube/AdSense et les stats de la chaîne sur 30 jours (revenu estimé, RPM, vues, abonnés gagnés, total). Le revenu est bien de l'argent (estimatedRevenue), pas des vues. Rappelle que YouTube a 2-3 jours de retard. À utiliser dès que Twaylo parle d'argent YouTube, d'AdSense, de RPM, de vues ou de croissance de la chaîne.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consulter_agenda",
    description:
      "Lit le Google Agenda de Twaylo pour la semaine en cours (jour, heure, titre). À utiliser dès qu'il demande son planning, ses rendez-vous, ou ce qu'il a cette semaine.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "deplacer_deal",
    description:
      "Fait avancer un sponsor/deal d'une étape à l'autre. « valider une OP » ou « c'est signé » = signe ; « c'est payé/réglé » = regle.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Le nom du sponsor, même partiel." },
        etape: {
          type: "string",
          enum: ["prospect", "negociation", "signe", "livre", "regle"],
          description: "prospect → négociation → signé → livré → réglé (payé).",
        },
      },
      required: ["nom", "etape"],
    },
  },
  {
    name: "fixer_montant_deal",
    description: "Fixe le montant en euros d'un sponsor/deal.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string" },
        montant: { type: "number", description: "Le montant en euros." },
      },
      required: ["nom", "montant"],
    },
  },
  {
    name: "archiver_objectif",
    description:
      "Change le statut d'un objectif : atteint, abandonne, ou en_cours (le ressortir de l'archive).",
    input_schema: {
      type: "object",
      properties: {
        objectif: { type: "string", description: "Le libellé de l'objectif, même partiel." },
        statut: { type: "string", enum: ["atteint", "abandonne", "en_cours"] },
      },
      required: ["objectif", "statut"],
    },
  },
  {
    name: "cocher_bloc_journee",
    description:
      "Coche (ou décoche) un bloc de la journée type d'aujourd'hui — « sport fait », « j'ai posté les shorts ». L'habitude liée au bloc se coche aussi, toute seule.",
    input_schema: {
      type: "object",
      properties: {
        bloc: {
          type: "string",
          description: "Le bloc, même approximatif : sport, scripts, rec, poster…",
        },
        fait: { type: "boolean", description: "false pour décocher. Par défaut true." },
      },
      required: ["bloc"],
    },
  },
  {
    name: "changer_journee_type",
    description:
      "Bascule le modèle de journée type actif — « je pars en déplacement », « retour à la maison ».",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Le nom du modèle, même partiel." },
      },
      required: ["nom"],
    },
  },

  /* ------------------------------------------------------------------ */
  /* Ce que l'écran savait faire et pas la voix                          */
  /*                                                                     */
  /* L'OS et le bot doivent couvrir exactement le même terrain : ce que  */
  /* Twaylo peut cocher du doigt, il doit pouvoir le dire — et l'inverse.*/
  /* Tout ce qui suit existait à l'écran sans équivalent vocal.          */
  /* ------------------------------------------------------------------ */

  {
    name: "cocher_habitude",
    description:
      "Coche une habitude du jour — « j'ai fait mon sport », « lecture faite ». Précise l'option quand l'habitude en a (Gym, Vélo, Écriture…).",
    input_schema: {
      type: "object",
      properties: {
        habitude: { type: "string", description: "Le nom de l'habitude, même partiel." },
        option: {
          type: "string",
          description: "La variante pratiquée, si l'habitude en propose.",
        },
        fait: { type: "boolean", description: "false pour décocher. Par défaut true." },
      },
      required: ["habitude"],
    },
  },
  {
    name: "deplacer_video",
    description:
      "Fait avancer une vidéo dans le pipeline contenu — « le short part au monteur » (montage), « je l'ai reçu » (pret), « posté » (publie).",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Le titre de la vidéo, même partiel." },
        etape: {
          type: "string",
          enum: ["idee", "scenario", "tournage", "montage", "pret", "publie"],
        },
      },
      required: ["titre", "etape"],
    },
  },
  {
    name: "changer_niveau_tache",
    description:
      "Change l'importance d'une tâche existante — « passe ça en focus principal », « c'est annexe ».",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string" },
        niveau: { type: "string", enum: ["principal", "secondaire", "annexe"] },
      },
      required: ["titre", "niveau"],
    },
  },
  {
    name: "retirer_tache",
    description:
      "Sort une tâche de la todo sans l'effacer : elle rejoint les Oubliés, d'où elle se reprend en un geste. À utiliser quand Twaylo dit « enlève », « supprime » ou « laisse tomber » une tâche.",
    input_schema: {
      type: "object",
      properties: { titre: { type: "string" } },
      required: ["titre"],
    },
  },
  {
    name: "reprendre_oublie",
    description:
      "Remet dans la todo une tâche archivée dans les Oubliés — « remets la relance du monteur ».",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string" },
        niveau: { type: "string", enum: ["principal", "secondaire", "annexe"] },
      },
      required: ["titre"],
    },
  },
  {
    name: "fixer_une_chose",
    description:
      "Pose L'UNIQUE chose du jour — « aujourd'hui je vais… ». Une seule à la fois : elle remplace la précédente.",
    input_schema: {
      type: "object",
      properties: {
        texte: { type: "string", description: "Vide pour effacer." },
        fait: { type: "boolean", description: "true pour la marquer faite." },
      },
      required: ["texte"],
    },
  },
  {
    name: "ajouter_blocage",
    description:
      "Note ce qui coince et qui bloque l'avancée — « j'attends les rushes du monteur », « le sponsor ne répond pas ».",
    input_schema: {
      type: "object",
      properties: {
        texte: { type: "string", description: "Ce qui bloque." },
        proprietaire: {
          type: "string",
          description: "Qui doit bouger : « moi », un prénom, une boîte. Par défaut « moi ».",
        },
      },
      required: ["texte"],
    },
  },
  {
    name: "lever_blocage",
    description: "Retire un blocage résolu — « c'est débloqué », « il a répondu ».",
    input_schema: {
      type: "object",
      properties: { texte: { type: "string", description: "Le blocage, même partiel." } },
      required: ["texte"],
    },
  },
  {
    name: "regler_skill",
    description:
      "Règle la maîtrise d'une compétence de l'onglet Skill, de 0 à 100 — « monte mon espagnol à 45 », « +3 en montage ».",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Le nom de la compétence, même partiel." },
        niveau: { type: "number", description: "La valeur visée, 0 à 100." },
        delta: {
          type: "number",
          description: "Variation à appliquer au niveau actuel, si Twaylo dit « +3 ».",
        },
      },
      required: ["nom"],
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

/** Retrouve l'élément (deal, objectif) dont le libellé colle le mieux. */
function trouverParNom<T>(requete: string, items: T[], libelle: (t: T) => string): T | null {
  const q = normaliser(requete);
  if (!q) return null;
  const contient = items
    .filter((t) => {
      const n = normaliser(libelle(t));
      /*
       * Un libellé vide n'est candidat à rien.
       *
       * `q.includes("")` est toujours vrai, et le tri par longueur mettait
       * ensuite ce libellé vide en premier : un bloc de journée type dont
       * Twaylo avait effacé l'intitulé — le stockage les conserve désormais —
       * répondait à TOUTES les commandes vocales, et le Brain cochait ce
       * bloc-là, plus l'habitude qui lui est liée.
       */
      if (!n) return false;
      return n.includes(q) || q.includes(n);
    })
    .sort((a, b) => libelle(a).length - libelle(b).length);
  if (contient.length > 0) return contient[0];
  const mots = new Set(q.split(/\s+/).filter((m) => m.length > 2));
  let meilleur: T | null = null;
  let meilleurScore = 0;
  for (const t of items) {
    const nm = new Set(normaliser(libelle(t)).split(/\s+/));
    let score = 0;
    for (const m of mots) if (nm.has(m)) score += 1;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = t;
    }
  }
  return meilleurScore > 0 ? meilleur : null;
}

/** L'historique d'un domaine, sans le détail jour par jour (trop lourd). */
function resumeSansJours(stats: { jours?: unknown }): string {
  const { jours, ...reste } = stats;
  void jours;
  return JSON.stringify(reste);
}

/** Exécute un outil et renvoie une phrase de résultat pour Claude. */
async function executer(
  nom: string,
  entree: Record<string, unknown>,
  jour: string,
): Promise<string> {
  switch (nom) {
    case "noter_journal": {
      const texte = String(entree.texte ?? "").trim();
      if (!texte) return "Rien à noter.";
      const { journal } = await lireJour(jour);
      // Anti-doublon : si ce texte est déjà dans le journal (ex. Twaylo l'a
      // aussi tapé dans l'OS), on ne le recolle pas à la suite.
      if (journal.includes(texte)) return `C'est déjà dans ton journal du jour.`;
      const brut = journal.trim() ? `${journal}\n${texte}` : texte;
      /*
       * Borné comme partout ailleurs : la ligne du jour est relue en entier à
       * chaque écriture, et par centaines au calcul de progression. On garde
       * la FIN — ce qui vient d'être dit compte plus que ce du matin.
       */
      await ecrireJour(jour, {
        journal: brut.length > 20_000 ? brut.slice(-20_000) : brut,
      });
      return `Noté dans le journal du jour : « ${texte} ».`;
    }
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
    case "consulter_historique": {
      const domaine = String(entree.domaine ?? "");
      if (domaine === "habitudes") return resumeSansJours(await lireStatsHabitudes());
      if (domaine === "taches") return resumeSansJours(await lireStatsTaches());
      if (domaine === "nutrition") return resumeSansJours(await lireStatsNutrition());
      return "Domaine inconnu : habitudes, taches ou nutrition.";
    }
    case "consulter_revenus": {
      try {
        const y = await lireStatsYoutube();
        return [
          `Période : ${y.periode}`,
          y.revenuEstime !== null
            ? `Revenu estimé (AdSense) : ${y.revenuEstime.toLocaleString("fr-FR")} €`
            : "Revenu : chaîne non monétisée ou portée monétaire absente",
          y.rpm !== null ? `RPM : ${y.rpm.toLocaleString("fr-FR")} €` : null,
          `Vues : ${y.vues.toLocaleString("fr-FR")}`,
          `Abonnés gagnés : ${y.abonnesGagnes >= 0 ? "+" : ""}${y.abonnesGagnes.toLocaleString("fr-FR")}`,
          y.abonnesTotal !== null ? `Abonnés au total : ${y.abonnesTotal.toLocaleString("fr-FR")}` : null,
          `Temps de visionnage : ${Math.round(y.minutesVisionnees / 60).toLocaleString("fr-FR")} h`,
        ]
          .filter(Boolean)
          .join("\n");
      } catch {
        return "YouTube n'est pas connecté (ou l'accès a expiré). Twaylo doit le rebrancher dans l'onglet Revenus.";
      }
    }
    case "consulter_agenda": {
      if (!agendaConfigure()) {
        return "Le Google Agenda n'est pas connecté (GOOGLE_ICAL_URL manquant sur Vercel).";
      }
      try {
        const evenements = await lireAgendaSemaine();
        if (evenements.length === 0) return "Aucun événement cette semaine dans l'agenda.";
        return evenements
          .map(
            (e) =>
              `${JOURS_SEMAINE[e.jourIndex] ?? "?"} ${e.heure || "(journée)"} — ${e.titre}`,
          )
          .join("\n");
      } catch {
        return "Agenda injoignable pour l'instant.";
      }
    }
    case "deplacer_deal": {
      const etape = String(entree.etape ?? "");
      if (!(ETAPES_DEAL as readonly string[]).includes(etape)) return "Étape invalide.";
      const cible = trouverParNom<DealDB>(
        String(entree.nom ?? ""),
        await lireDeals(),
        (d) => d.nom,
      );
      if (!cible) return `Aucun sponsor ne correspond à « ${entree.nom} ».`;
      await majDeal(cible.id, { etape });
      return `« ${cible.nom} » déplacé en ${LIBELLE_ETAPE[etape] ?? etape}.`;
    }
    case "fixer_montant_deal": {
      const montant = Number(entree.montant);
      if (!Number.isFinite(montant)) return "Montant invalide.";
      const cible = trouverParNom<DealDB>(
        String(entree.nom ?? ""),
        await lireDeals(),
        (d) => d.nom,
      );
      if (!cible) return `Aucun sponsor ne correspond à « ${entree.nom} ».`;
      await majDeal(cible.id, { montant });
      return `Montant de « ${cible.nom} » fixé à ${montant.toLocaleString("fr-FR")} €.`;
    }
    case "cocher_bloc_journee": {
      const cfg = await lireJournees();
      const active = cfg.liste.find((j) => j.id === cfg.active) ?? cfg.liste[0];
      if (!active || active.blocs.length === 0) return "Aucune journée type configurée.";
      const bloc = trouverParNom(String(entree.bloc ?? ""), active.blocs, (b) => b.titre);
      if (!bloc) {
        return `Aucun bloc ne correspond à « ${entree.bloc} » dans « ${active.nom} ».`;
      }
      const fait = entree.fait !== false;
      const faits = await lireBlocsFaits(jour);
      const suivants = fait
        ? [...faits.filter((f) => f !== bloc.id), bloc.id]
        : faits.filter((f) => f !== bloc.id);
      await ecrireBlocsFaits(jour, suivants);

      // L'habitude liée suit, comme à l'écran : poser/retirer, jamais de
      // bascule aveugle qui éteindrait une habitude déjà cochée à la main.
      if (bloc.habitude) {
        const { etat } = await lireJour(jour);
        const marque = bloc.habitudeOption || "fait";
        const actuelles = etat.faites[bloc.habitude] ?? [];
        const options = fait
          ? actuelles.includes(marque)
            ? actuelles
            : [...actuelles, marque]
          : actuelles.filter((o) => o !== marque);
        await ecrireJour(jour, {
          etat: { faites: { ...etat.faites, [bloc.habitude]: options } },
        });
      }

      const n = active.blocs.filter((b) => suivants.includes(b.id)).length;
      return `${fait ? "Coché" : "Décoché"} : « ${bloc.titre} » — ${n}/${active.blocs.length} de ta journée « ${active.nom} ».`;
    }
    case "changer_journee_type": {
      const cfg = await lireJournees();
      const cible = trouverParNom(String(entree.nom ?? ""), cfg.liste, (j) => j.nom);
      if (!cible) {
        return `Aucun modèle ne s'appelle « ${entree.nom} ». Modèles : ${cfg.liste
          .map((j) => j.nom)
          .join(", ")}.`;
      }
      await ecrireJournees({ ...cfg, active: cible.id });
      return `Journée type basculée sur « ${cible.nom} » (${cible.blocs.length} blocs).`;
    }
    case "archiver_objectif": {
      const statut = String(entree.statut ?? "");
      if (!["atteint", "abandonne", "en_cours"].includes(statut)) return "Statut invalide.";
      const cible = trouverParNom<ObjectifDB>(
        String(entree.objectif ?? ""),
        await lireObjectifs(),
        (o) => o.objectif,
      );
      if (!cible) return `Aucun objectif ne correspond à « ${entree.objectif} ».`;
      await majObjectif(cible.id, { statut });
      const mot =
        statut === "atteint" ? "marqué atteint" : statut === "abandonne" ? "abandonné" : "remis en cours";
      return `Objectif « ${cible.objectif} » ${mot}.`;
    }
    /* ---------------- Parité avec l'écran ---------------- */

    case "cocher_habitude": {
      const habitudes = await lireHabitudesDef();
      const cible = trouverParNom(String(entree.habitude ?? ""), habitudes, (h) => h.nom);
      if (!cible) {
        return `Aucune habitude ne correspond à « ${entree.habitude} ». Les tiennes : ${habitudes
          .map((h) => h.nom)
          .join(", ")}.`;
      }
      const fait = entree.fait !== false;
      /*
       * L'option demandée doit exister, sinon on retombe sur le marqueur
       * neutre. Une variante inventée par le modèle — « Cardio » sur une
       * habitude qui n'a que Gym et Vélo — se serait rangée en base et
       * apparaîtrait à l'écran comme une option que Twaylo n'a jamais créée.
       */
      const demandee = String(entree.option ?? "").trim();
      const option =
        demandee && cible.options.length > 0
          ? (trouverParNom(demandee, cible.options, (o) => o) ?? "fait")
          : "fait";

      const { etat } = await lireJour(jour);
      const actuelles = etat.faites[cible.id] ?? [];
      const suivantes = fait
        ? actuelles.includes(option)
          ? actuelles
          : [...actuelles, option]
        : actuelles.filter((o) => o !== option);
      await ecrireJour(jour, {
        etat: { faites: { ...etat.faites, [cible.id]: suivantes } },
      });
      const precision = option !== "fait" ? ` (${option})` : "";
      return `${fait ? "Coché" : "Décoché"} : « ${cible.nom} »${precision}.`;
    }

    case "deplacer_video": {
      const etape = String(entree.etape ?? "");
      if (!(ETAPES as readonly string[]).includes(etape)) return "Étape inconnue.";
      const cible = trouverParNom<VideoDB>(
        String(entree.titre ?? ""),
        await lireVideos(),
        (v) => v.titre,
      );
      if (!cible) return `Aucune vidéo ne correspond à « ${entree.titre} ».`;
      await deplacerVideo(cible.id, etape);
      return `« ${cible.titre} » passe en ${etape}.`;
    }

    case "changer_niveau_tache": {
      const niveau = String(entree.niveau ?? "");
      if (!Object.hasOwn(NIVEAUX, niveau)) return "Niveau invalide.";
      const cible = trouverTache(String(entree.titre ?? ""), await lireTaches());
      if (!cible) return `Aucune tâche ne correspond à « ${entree.titre} ».`;
      await changerNiveauTache(cible.id, niveau as Niveau);
      return `« ${cible.titre} » passe en ${NIVEAUX[niveau as Niveau].nom.toLowerCase()}.`;
    }

    case "retirer_tache": {
      const cible = trouverTache(String(entree.titre ?? ""), await lireTaches());
      if (!cible) return `Aucune tâche ne correspond à « ${entree.titre} ».`;
      await archiverTache(cible.id);
      return `« ${cible.titre} » sort de la todo — elle t'attend dans les Oubliés.`;
    }

    case "reprendre_oublie": {
      const oubliees = await lireOubliees();
      const cible = trouverParNom(String(entree.titre ?? ""), oubliees, (o) => o.titre);
      if (!cible) {
        return oubliees.length === 0
          ? "Tes Oubliés sont vides."
          : `Aucun oublié ne correspond à « ${entree.titre} ».`;
      }
      const niveau = Object.hasOwn(NIVEAUX, String(entree.niveau ?? ""))
        ? (entree.niveau as Niveau)
        : undefined;
      const reprise = await reprendreOubliee(cible.id, niveau);
      if (!reprise) return `« ${cible.titre} » n'était plus dans les Oubliés.`;
      await placerEnTeteOrdre(reprise.id);
      return `« ${reprise.titre} » est de retour en tête de ta todo.`;
    }

    case "fixer_une_chose": {
      const texte = String(entree.texte ?? "").trim().slice(0, 300);
      await ecrireJour(jour, {
        etat: { une_chose: { texte, fait: entree.fait === true } },
      });
      return texte
        ? `Aujourd'hui tu vas : « ${texte} ».`
        : "L'unique chose du jour est effacée.";
    }

    case "ajouter_blocage": {
      const texte = String(entree.texte ?? "").trim().slice(0, 200);
      if (!texte) return "Rien à noter.";
      const blocages = await lireBlocages();
      if (blocages.some((b) => normaliser(b.texte) === normaliser(texte))) {
        return "C'est déjà dans « Ça coince ».";
      }
      // Même forme d'identifiant qu'à l'écran (`b` + horodatage en base 36) :
      // les deux surfaces écrivent dans la même liste, elles ne doivent pas
      // produire deux conventions différentes.
      const id = `b${Date.now().toString(36)}`;
      await ecrireBlocages([
        ...blocages,
        {
          id,
          texte,
          proprietaire: String(entree.proprietaire ?? "moi").slice(0, 40),
          depuis: jour,
        },
      ]);
      return `Noté dans « Ça coince » : ${texte}.`;
    }

    case "lever_blocage": {
      const blocages = await lireBlocages();
      const cible = trouverParNom(String(entree.texte ?? ""), blocages, (b) => b.texte);
      if (!cible) return `Aucun blocage ne correspond à « ${entree.texte} ».`;
      await ecrireBlocages(blocages.filter((b) => b.id !== cible.id));
      return `Débloqué : « ${cible.texte} ».`;
    }

    case "regler_skill": {
      const skills = await lireSkills();
      const cible = trouverParNom(String(entree.nom ?? ""), skills, (s) => s.nom);
      if (!cible) {
        return skills.length === 0
          ? "Aucune compétence n'est encore définie dans l'onglet Skill."
          : `Aucune compétence ne correspond à « ${entree.nom} ».`;
      }
      const delta = Number(entree.delta);
      const vise = Number(entree.niveau);
      const brut = Number.isFinite(delta)
        ? cible.niveau + delta
        : Number.isFinite(vise)
          ? vise
          : NaN;
      if (!Number.isFinite(brut)) return "Donne-moi un niveau ou une variation.";
      const n = Math.max(0, Math.min(100, Math.round(brut)));
      // Un instantané par mois, comme l'onglet : sans lui, la courbe de
      // progression ignorerait tout ce qui est réglé à la voix.
      const mois = jour.slice(0, 7);
      await ecrireSkills(
        skills.map((s) =>
          s.id === cible.id
            ? {
                ...s,
                niveau: n,
                historique: [...s.historique.filter((h) => h.mois !== mois), { mois, niveau: n }]
                  .sort((a, b) => a.mois.localeCompare(b.mois)),
              }
            : s,
        ),
      );
      return `« ${cible.nom} » : ${cible.niveau} → ${n}.`;
    }

    default:
      return `Outil inconnu : ${nom}.`;
  }
}

const CONSIGNE_AGENT = `${CONSIGNE_BRAIN}

Tu es joint depuis Telegram, en vocal ou par écrit. Deux différences avec d'habitude :
- Tu peux AGIR sur l'OS via les outils, et tu peux y faire TOUT ce que Twaylo ferait à l'écran : créer/cocher/décocher une tâche, changer son importance, la sortir de la todo ou la reprendre des Oubliés ; cocher une habitude (avec sa variante) ; cocher un bloc de journée type et changer de modèle ; faire avancer une vidéo dans le pipeline (montage = partie chez le monteur, pret = reçue, publie = postée) ; ajouter une idée vidéo, un contact, un objectif et l'archiver ; poser l'unique chose du jour ; noter ou lever un blocage dans « Ça coince » ; régler une compétence de l'onglet Skill ; écrire dans le journal du jour ; faire avancer un sponsor d'une étape (jusqu'à « réglé » = payé) et fixer son montant. Utilise-les dès que Twaylo demande une action, sans redemander confirmation. S'il te dit de noter un truc dans le journal, ÉCRIS-LE vraiment avec noter_journal — ne te contente pas d'acquiescer.
- Une seule chose t'est refusée : effacer pour de bon. « Supprime cette tâche » la sort de la todo vers les Oubliés, d'où elle se reprend — parce qu'une transcription se trompe, et qu'un mot mal entendu ne doit rien détruire. Dis-le simplement si Twaylo insiste : l'effacement définitif se fait à l'écran, là où l'on voit ce qu'on vise.
- Tu peux CONSULTER l'historique (habitudes, tâches, nutrition), les REVENUS YouTube/AdSense (revenu estimé, RPM, vues, abonnés sur 30 jours) et le GOOGLE AGENDA de la semaine, avec les outils dédiés. Sers-t'en dès qu'il veut parler de sa régularité, de ses données dans le temps, de l'argent de sa chaîne ou de son planning, plutôt que de rester sur l'instantané.
- Réponds COURT — c'est un message Telegram, pas un essai. Une à trois phrases. Après une action, confirme ce que tu as fait en une phrase. Pas de mise en forme Markdown lourde.
Si c'est juste une question, réponds sans outil. Quand tu donnes un avis (habitudes, sponsors…), appuie-le sur les vraies données, pas sur des généralités.`;

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
      // Sonnet par défaut : Haiku bâclait les questions un peu fines, Opus était
      // trop lent. Sonnet tient les deux bouts — assez malin, assez rapide.
      // Surchargeable via l'env (BRAIN_TELEGRAM_MODEL=claude-opus-4-8 pour le
      // maximum sur les cas complexes).
      model: process.env.BRAIN_TELEGRAM_MODEL ?? "claude-sonnet-4-6",
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
        contenu = await executer(outil.name, outil.input as Record<string, unknown>, jour);
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
