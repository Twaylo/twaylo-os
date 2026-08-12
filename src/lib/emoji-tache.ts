/**
 * Un emoji pour chaque tâche, déduit de son intitulé.
 *
 * Une liste de tâches est un mur de texte : dix lignes de la même taille, de
 * la même couleur, alignées au même endroit. On ne la LIT pas, on la survole —
 * et ce qui n'est pas lu n'est pas fait. Une pastille en tête de ligne donne à
 * chacune une silhouette différente, et l'œil retrouve « la tâche de sport »
 * sans déchiffrer les neuf autres.
 *
 * Déduit, pas demandé : obliger à choisir un emoji à chaque ajout ajouterait
 * un geste à l'endroit où il faut le moins en avoir — la capture rapide d'une
 * tâche qui vient de traverser l'esprit.
 *
 * Pur et sans dépendance : la carte des tâches, le récap Telegram et le brief
 * du matin peuvent tous s'en servir.
 */

/**
 * Les règles, dans l'ordre où elles sont essayées.
 *
 * L'ORDRE COMPTE, et c'est tout le sujet : « appeler le monteur » doit donner
 * le téléphone, pas le montage. Les gestes (appeler, envoyer, payer) passent
 * donc avant les domaines (montage, sport, cuisine) — ce qu'on fait est plus
 * parlant que ce sur quoi on le fait.
 *
 * Les motifs sont écrits sans accent et comparés sans accent : « repondre » et
 * « répondre » ne doivent pas demander deux lignes.
 */
const REGLES: { emoji: string; id: string; nom: string; mots: string[] }[] = [
  /* ---- Les gestes ---- */
  { emoji: "📞", id: "appel", nom: "Appels", mots: ["appel", "telephon", "call", "rdv tel"] },
  { emoji: "📩", id: "message", nom: "Messages", mots: ["mail", "email", "courriel", "repond", "relanc", "ecrire a", "message", "dm", "sms"] },
  { emoji: "🤝", id: "rdv", nom: "Rendez-vous", mots: ["rdv", "rendez-vous", "reunion", "meeting", "entretien", "rencontr", "visio"] },
  { emoji: "💸", id: "argent", nom: "Argent", mots: ["pay", "factur", "devis", "virement", "rembours", "achet", "command", "budget", "compta", "impot"] },
  { emoji: "✍️", id: "ecriture", nom: "Écriture", mots: ["ecrire", "redig", "script", "rediger", "note", "brouillon", "lettre", "cv"] },
  { emoji: "📤", id: "envoi", nom: "À envoyer", mots: ["envoy", "expedi", "poster", "publier", "upload", "livrer"] },
  { emoji: "🔍", id: "recherche", nom: "Recherches", mots: ["cherch", "trouv", "recherch", "compar", "reperage", "reperer", "verifi", "controler"] },
  { emoji: "🧹", id: "rangement", nom: "Rangement", mots: ["ranger", "nettoy", "menage", "trier", "vider", "archiver", "supprimer"] },
  { emoji: "🛠", id: "bricolage", nom: "Bricolage", mots: ["repar", "bricol", "install", "monter le", "fixer", "regler"] },
  /*
   * « Idée de vidéo » est une idée, pas une vidéo.
   *
   * Repéré par les tests : placée avec les domaines, la règle tombait après
   * « video » et la tâche recevait le clap de cinéma. Une intention prime
   * toujours sur son sujet.
   */
  { emoji: "💡", id: "idee", nom: "Idées", mots: ["idee", "brainstorm", "reflechi", "concept", "imaginer"] },

  /* ---- Les domaines ---- */
  { emoji: "🎬", id: "video", nom: "Vidéo", mots: ["montage", "monter", "tourn", "film", "video", "rush", "derush", "short", "vlog"] },
  { emoji: "🖼", id: "visuel", nom: "Visuels", mots: ["miniature", "thumbnail", "visuel", "design", "maquette", "logo", "affiche"] },
  /*
   * « courir », jamais « course » tout court.
   *
   * Repéré par les tests : « Courses + repas du soir » recevait l'haltère,
   * parce que « courses » contient « course ». Les provisions sont plus
   * fréquentes qu'un footing dans une liste de tâches, et « courir » couvre
   * l'autre sens sans ambiguïté.
   */
  { emoji: "🏋️", id: "sport", nom: "Sport", mots: ["sport", "muscu", "seance", "gym", "entrainement", "courir", "footing", "running", "velo", "natation", "etirement", "pompes", "abdos"] },
  { emoji: "🍽", id: "repas", nom: "Repas", mots: ["repas", "manger", "cuisin", "courses", "dejeuner", "diner", "petit-dej", "meal", "cantine"] },
  { emoji: "😴", id: "repos", nom: "Repos", mots: ["dormir", "sieste", "coucher", "sommeil", "repos", "pause"] },
  { emoji: "📚", id: "etude", nom: "Études", mots: ["revis", "cours", "apprend", "etudi", "lire", "lecture", "fiche", "exam", "partiel", "devoir", "memoire"] },
  { emoji: "💼", id: "business", nom: "Business", mots: ["client", "prospect", "deal", "sponsor", "contrat", "negoci", "vendre", "vente"] },
  { emoji: "🧑‍💻", id: "code", nom: "Code", mots: ["code", "dev", "bug", "site", "appli", "deploy", "serveur", "base de donnees"] },
  { emoji: "📊", id: "chiffres", nom: "Chiffres", mots: ["stat", "analys", "bilan", "rapport", "tableau", "chiffre", "kpi", "audit"] },
  { emoji: "🚗", id: "trajet", nom: "Trajets", mots: ["trajet", "route", "conduire", "train", "avion", "vol ", "gare", "aeroport", "deplacement"] },
  { emoji: "🏠", id: "maison", nom: "Maison", mots: ["maison", "appart", "loyer", "demenag", "lessive", "vaisselle", "poubelle"] },
  { emoji: "🩺", id: "sante", nom: "Santé", mots: ["medecin", "dentiste", "docteur", "sante", "pharmacie", "analyse de sang", "kine"] },
  { emoji: "🎁", id: "cadeau", nom: "Occasions", mots: ["cadeau", "anniversaire", "noel", "fete"] },
  { emoji: "📅", id: "organisation", nom: "Organisation", mots: ["planifi", "organis", "prepar", "calendrier", "agenda", "programm"] },
];

/** Le repli quand rien ne correspond : la couleur du niveau, pas un emoji au hasard. */
const PAR_NIVEAU: Record<string, string> = {
  principal: "⭐",
  secondaire: "🔹",
  annexe: "▫️",
};

/** Sans accent, en minuscules — pour comparer « Répondre » et « repondre ». */
function nu(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * L'emoji d'une tâche.
 *
 * Une tâche qui commence DÉJÀ par un emoji garde le sien : on ne double pas la
 * pastille de quelqu'un qui a pris la peine d'en mettre une.
 */
export function emojiPourTache(texte: string, niveau?: string): string {
  if (commenceParEmoji(texte)) return "";
  const t = nu(texte);
  for (const r of REGLES) {
    if (r.mots.some((m) => t.includes(m))) return r.emoji;
  }
  return PAR_NIVEAU[niveau ?? "secondaire"] ?? "🔹";
}

/** La famille d'une tâche : ce qui permet de mettre les scripts côte à côte. */
export type Famille = { id: string; emoji: string; nom: string };

/**
 * La famille d'une tâche, ou `null` si rien ne correspond.
 *
 * Regrouper n'est pas cosmétique. Enchaîner trois tâches de même nature coûte
 * beaucoup moins cher que d'alterner script → appel → facture → script : c'est
 * le changement de contexte qui fatigue, pas le travail. Une liste qui met les
 * scripts ensemble se fait en une passe.
 *
 * `null` plutôt qu'une famille « Divers » : un tas fourre-tout se remplit de
 * tout ce qui n'a rien à voir, et on n'y retrouve plus rien. Les tâches sans
 * famille reconnue restent simplement seules dans la liste.
 */
export function familleDeTache(texte: string): Famille | null {
  const t = nu(texte);
  for (const r of REGLES) {
    if (r.mots.some((m) => t.includes(m))) {
      return { id: r.id, emoji: r.emoji, nom: r.nom };
    }
  }
  return null;
}

/**
 * Le texte commence-t-il par un emoji ?
 *
 * `\p{Extended_Pictographic}` plutôt qu'une plage de codes écrite à la main :
 * les emoji sont dispersés dans une dizaine de blocs Unicode, et une plage
 * choisie au jugé en rate toujours la moitié.
 */
export function commenceParEmoji(texte: string): boolean {
  return /^\s*\p{Extended_Pictographic}/u.test(texte);
}
