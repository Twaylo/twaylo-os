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
 * tâche qui vient de traverser l'esprit. Mais déduit n'est pas imposé : un
 * emoji posé à la main en tête d'intitulé l'emporte toujours (voir
 * `avecEmoji`), et c'est LUI qui décide alors du regroupement.
 *
 * Pur et sans dépendance : la carte des tâches, le récap Telegram et le brief
 * du matin peuvent tous s'en servir.
 */

/**
 * Une règle de reconnaissance.
 *
 * `mots` : des DÉBUTS de mot. « repond » attrape « répondre », « répondu »,
 * « répondez » — mais pas « correspondre », parce que la comparaison exige une
 * frontière de mot avant le motif.
 *
 * `exacts` : des mots ENTIERS, pour les motifs courts qui se cachent dans
 * d'autres. « vol » ne doit pas attraper « volume », « cours » ne doit pas
 * attraper « courses », « dev » ne doit pas attraper « devis ».
 */
type Regle = { emoji: string; id: string; nom: string; mots?: string[]; exacts?: string[] };

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
const REGLES: Regle[] = [
  /* ------------------------------------------------------------------ */
  /* Les gestes — ce qu'on FAIT                                          */
  /* ------------------------------------------------------------------ */
  {
    emoji: "📞",
    id: "appel",
    nom: "Appels",
    mots: ["appel", "rappeler", "telephon", "joindre"],
    exacts: ["call", "calls"],
  },
  {
    emoji: "📩",
    id: "message",
    nom: "Messages",
    mots: ["mail", "email", "courriel", "repond", "relanc", "ecrire a", "messag", "whatsapp", "insta dm"],
    exacts: ["dm", "dms", "sms", "mp"],
  },
  {
    emoji: "🤝",
    id: "rdv",
    nom: "Rendez-vous",
    mots: ["rdv", "rendez-vous", "reunion", "meeting", "entretien", "rencontr", "visio", "call avec"],
  },
  {
    emoji: "💸",
    id: "argent",
    nom: "Argent",
    mots: ["pay", "factur", "devis", "virement", "rembours", "achet", "budget", "compta", "impot", "tarif", "prix", "abonnement", "resilier"],
  },
  {
    emoji: "✍️",
    id: "ecriture",
    nom: "Écriture",
    mots: ["ecrire", "redig", "script", "brouillon", "lettre", "texte", "legende", "caption", "pitch", "synopsis"],
    exacts: ["note", "notes", "cv"],
  },
  /*
   * Vérifier avant d'envoyer, dans cet ordre.
   *
   * « Vérifier le SEO avant la mise en ligne » partait dans les envois : la
   * règle de l'envoi tombait la première, sur un bout de phrase qui n'était
   * qu'une précision de calendrier. Le verbe de la tâche est « vérifier ».
   */
  {
    emoji: "🔍",
    id: "recherche",
    nom: "Recherches",
    mots: ["cherch", "trouv", "recherch", "compar", "reperage", "reperer", "verifi", "controler", "sourcer", "documenter", "fact-check"],
  },
  {
    emoji: "📤",
    id: "envoi",
    nom: "À envoyer",
    // Pas de « poster » ici : dans une todo d'aujourd'hui, poster veut dire
    // poster sur un réseau, pas déposer une lettre à la boîte.
    mots: ["envoy", "expedi", "publier", "upload", "livrer", "mise en ligne", "mettre en ligne", "programmer la"],
  },
  {
    emoji: "🧹",
    id: "rangement",
    nom: "Rangement",
    mots: ["ranger", "nettoy", "menage", "trier", "vider", "archiver", "supprimer", "desencombrer"],
  },
  /*
   * Pas de « monter le » ici, et c'est un choix.
   *
   * Le motif visait le meuble en kit ; dans la liste de Twaylo, « monter »
   * veut dire montage vidéo neuf fois sur dix — « monter le Short », « monter
   * la séquence ». La règle attrapait donc le montage et lui collait une clé à
   * molette. Le bricolage garde ses verbes à lui, qui ne prêtent à rien.
   */
  {
    emoji: "🛠️",
    id: "bricolage",
    nom: "Bricolage",
    mots: ["repar", "bricol", "install", "visser", "percer", "changer la pile", "changer l'ampoule"],
    exacts: ["fixer"],
  },
  /*
   * « Idée de vidéo » est une idée, pas une vidéo.
   *
   * Repéré par les tests : placée avec les domaines, la règle tombait après
   * « video » et la tâche recevait le clap de cinéma. Une intention prime
   * toujours sur son sujet.
   */
  {
    emoji: "💡",
    id: "idee",
    nom: "Idées",
    mots: ["idee", "brainstorm", "reflechi", "concept", "imaginer", "trouver un angle"],
  },
  {
    emoji: "🧪",
    id: "test",
    nom: "Essais",
    mots: ["tester", "essai", "prototype", "experiment", "tenter"],
    exacts: ["test", "tests"],
  },

  /* ------------------------------------------------------------------ */
  /* La chaîne — le métier de Twaylo, donc le plus détaillé              */
  /* ------------------------------------------------------------------ */
  /*
   * Les visuels AVANT la vidéo, et l'ordre a été trouvé par les tests.
   *
   * « Valider la miniature du Short » recevait le clap : « short » appartient
   * à la vidéo et arrivait le premier. Or la tâche ne parle pas de la vidéo,
   * elle parle de son image — et les miniatures se traitent ensemble, dans le
   * même logiciel, en une passe. La pièce précise l'emporte sur le sujet
   * général.
   */
  {
    emoji: "🖼️",
    id: "visuel",
    nom: "Visuels",
    mots: ["miniature", "thumbnail", "thumb", "vignette", "visuel", "design", "maquette", "logo", "affiche", "banniere", "retouche", "photo"],
    exacts: ["cover", "covers"],
  },
  {
    emoji: "🎬",
    id: "video",
    nom: "Vidéo",
    mots: ["montage", "monter", "tourn", "film", "video", "rush", "derush", "vlog", "sequence", "captation", "b-roll", "broll", "etalonn", "sous-titr"],
    exacts: ["cut", "cuts", "short", "shorts"],
  },
  {
    emoji: "🎙️",
    id: "voix",
    nom: "Voix & son",
    mots: ["voix off", "voice", "podcast", "enregistr", "micro", "audio", "mixage", "musique", "jingle"],
    exacts: ["vo", "son"],
  },
  {
    emoji: "📺",
    id: "chaine",
    nom: "Chaîne",
    mots: ["youtube", "chaine", "playlist", "description de", "miniatures a", "referencement"],
    exacts: ["seo", "titre", "titres", "tags", "hook", "hooks"],
  },
  {
    emoji: "💬",
    id: "communaute",
    nom: "Communauté",
    mots: ["commentaire", "communaute", "community", "abonne", "audience", "sondage"],
    exacts: ["coms", "com"],
  },
  /*
   * Les réseaux, à part de la vidéo et des envois.
   *
   * « Poster sur Snap et Facebook » tombait dans « à envoyer », avec les colis
   * et les factures. Or c'est une corvée à part, qui revient tous les jours et
   * se fait d'une traite : les regrouper, c'est les expédier en une passe au
   * lieu de trois. Les noms des plateformes sont écrits en toutes lettres —
   * personne n'écrit « réseaux sociaux » dans sa todo, on écrit « snap ».
   */
  {
    emoji: "📱",
    id: "reseaux",
    nom: "Réseaux",
    mots: ["snap", "instagram", "insta", "tiktok", "facebook", "twitter", "linkedin", "threads", "pinterest", "story", "stories", "reel", "carrousel", "publication"],
    exacts: ["post", "poster", "posts", "fb", "ig", "x"],
  },

  /* ------------------------------------------------------------------ */
  /* Les autres domaines                                                 */
  /* ------------------------------------------------------------------ */
  {
    emoji: "💼",
    id: "business",
    nom: "Business",
    mots: ["client", "prospect", "sponsor", "contrat", "negoci", "vendre", "vente", "partenariat", "brand", "offre", "momentum"],
    exacts: ["deal", "deals"],
  },
  {
    emoji: "📝",
    id: "admin",
    nom: "Administratif",
    mots: ["administratif", "paperasse", "dossier", "assurance", "banque", "signature", "signer", "urssaf", "declaration", "mutuelle", "attestation"],
  },
  /*
   * « courir », jamais « course » tout court.
   *
   * Repéré par les tests : « Courses + repas du soir » recevait l'haltère,
   * parce que « courses » contient « course ». Les provisions sont plus
   * fréquentes qu'un footing dans une liste de tâches, et « courir » couvre
   * l'autre sens sans ambiguïté.
   */
  {
    emoji: "🏋️",
    id: "sport",
    nom: "Sport",
    mots: ["sport", "muscu", "seance", "entrainement", "courir", "footing", "running", "velo", "natation", "etirement", "pompes", "escalade", "boxe"],
    exacts: ["gym", "abdos", "run"],
  },
  {
    emoji: "🍽️",
    id: "repas",
    nom: "Repas",
    mots: ["repas", "manger", "cuisin", "courses", "dejeuner", "diner", "petit-dej", "cantine", "restaurant", "recette"],
    exacts: ["meal", "resto"],
  },
  {
    emoji: "😴",
    id: "repos",
    nom: "Repos",
    mots: ["dormir", "sieste", "coucher", "sommeil", "repos", "pause", "deconnect", "souffler"],
  },
  {
    emoji: "📚",
    id: "etude",
    nom: "Études",
    mots: ["revis", "apprend", "etudi", "lecture", "formation", "tuto", "exam", "partiel", "memoire"],
    exacts: ["cours", "lire", "fiche", "fiches", "devoir", "devoirs"],
  },
  {
    emoji: "🧑‍💻",
    id: "code",
    nom: "Code",
    mots: ["coder", "programmer une", "deploy", "serveur", "base de donnees", "refacto", "commit"],
    exacts: ["code", "dev", "bug", "bugs", "site", "appli", "app", "api"],
  },
  {
    emoji: "🤖",
    id: "ia",
    nom: "IA",
    mots: ["prompt", "claude", "chatgpt", "midjourney", "automatis"],
    exacts: ["ia", "gpt", "llm"],
  },
  {
    emoji: "📊",
    id: "chiffres",
    nom: "Chiffres",
    mots: ["analys", "bilan", "rapport", "tableau", "chiffre", "statis", "audit", "revenus", "vues"],
    exacts: ["stat", "stats", "kpi", "rpm", "ctr"],
  },
  {
    emoji: "🎯",
    id: "objectif",
    nom: "Objectifs",
    mots: ["objectif", "ambition", "cap ", "jalon"],
    exacts: ["goal", "goals", "okr"],
  },
  {
    emoji: "✈️",
    id: "voyage",
    nom: "Voyage",
    mots: ["visa", "passeport", "billet", "hotel", "reservation", "reserver", "vaccin", "valise", "fixeur", "fixing", "ambassade"],
    exacts: ["vol", "vols"],
  },
  {
    emoji: "🚗",
    id: "trajet",
    nom: "Trajets",
    mots: ["trajet", "route", "conduire", "train", "gare", "aeroport", "deplacement", "essence", "peage"],
  },
  {
    emoji: "📦",
    id: "materiel",
    nom: "Matériel",
    mots: ["colis", "command", "materiel", "batterie", "carte sd", "drone", "gopro", "trepied", "objectif photo", "disque dur", "cable"],
  },
  {
    emoji: "🏠",
    id: "maison",
    nom: "Maison",
    mots: ["maison", "appart", "loyer", "demenag", "lessive", "vaisselle", "poubelle", "plante"],
  },
  {
    emoji: "🩺",
    id: "sante",
    nom: "Santé",
    mots: ["medecin", "dentiste", "docteur", "sante", "pharmacie", "analyse de sang", "kine", "ophtalmo", "osteo"],
  },
  {
    emoji: "🎁",
    id: "cadeau",
    nom: "Occasions",
    mots: ["cadeau", "anniversaire", "noel", "mariage"],
    exacts: ["fete"],
  },
  {
    emoji: "📅",
    id: "organisation",
    nom: "Organisation",
    mots: ["planifi", "organis", "prepar", "calendrier", "agenda", "programm", "caler"],
  },
];

/**
 * Les motifs, compilés une fois pour toutes — un par motif, pas un par règle.
 *
 * Chacun est ancré par `\b`. C'est ce qui distingue « répondre » de
 * « correspondre », et « train » de « entraînement » : la comparaison par
 * simple inclusion attrapait les deux, et ce genre d'erreur ne se voit pas —
 * on obtient un emoji plausible, juste pas le bon, sur une ligne parmi vingt.
 *
 * Un par motif, parce qu'on ne veut plus seulement savoir SI une règle
 * correspond, mais À QUEL POINT : quel mot a été reconnu, où, et combien.
 */
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MOTIFS: { regle: Regle; motif: string; test: RegExp }[] = REGLES.flatMap((regle) => [
  ...(regle.mots ?? []).map((m) => ({
    regle,
    motif: m,
    test: new RegExp(`\\b${echapper(m)}`, "u"),
  })),
  ...(regle.exacts ?? []).map((m) => ({
    regle,
    motif: m,
    test: new RegExp(`\\b${echapper(m)}\\b`, "u"),
  })),
]);

/** Le rang d'une règle dans le catalogue — départage les scores égaux. */
const RANG = new Map(REGLES.map((r, i) => [r.id, i]));

/**
 * LE CHOIX SE PÈSE, il ne se prend plus au premier venu.
 *
 * Avant : la première règle du catalogue qui reconnaissait un mot gagnait. Tout
 * reposait donc sur l'ordre de la liste, et l'ordre ne peut pas avoir raison
 * partout à la fois — « valider la miniature du Short » voulait les visuels
 * avant la vidéo, « monter le Short » voulait l'inverse. Chaque cas réglé en
 * déplaçait un autre.
 *
 * Maintenant on regarde TOUS les mots reconnus et on pèse :
 *
 *  · LA PRÉCISION du mot. « changer la pile » en dit plus long que « pile », et
 *    « entrainement » plus que « train ». On compte donc sa longueur : un motif
 *    long ne se déclenche que sur une vraie intention.
 *
 *  · LA PLACE dans l'intitulé. Ce qu'on écrit en premier est ce que la tâche
 *    est : « Envoyer la facture » est un envoi, « Facture à envoyer » est une
 *    histoire de sous. Le premier mot pèse donc dix points de plus — c'est ce
 *    qui fait tenir la règle « le geste prime sur le sujet » sans dépendre de
 *    l'ordre du catalogue.
 *
 *  · LA CONCORDANCE. Deux mots de la même famille dans la même phrase
 *    (« monter le short »), c'est deux fois la même piste : trois points par
 *    indice supplémentaire.
 *
 * À égalité parfaite, le catalogue tranche — les gestes y sont écrits avant
 * les domaines.
 */
function peser(texteNu: string): Regle | null {
  const finPremierMot = (() => {
    const i = texteNu.search(/[\s:,;–—-]/);
    return i === -1 ? texteNu.length : i;
  })();

  const scores = new Map<string, { regle: Regle; score: number; indices: number }>();

  for (const { regle, test } of MOTIFS) {
    const m = test.exec(texteNu);
    if (!m) continue;
    // 10 de base : reconnaître quelque chose vaut déjà mieux que rien.
    let score = 10 + m[0].length;
    if (m.index < finPremierMot) score += 10;

    const vu = scores.get(regle.id);
    if (!vu) {
      scores.set(regle.id, { regle, score, indices: 1 });
    } else {
      vu.indices += 1;
      vu.score = Math.max(vu.score, score);
    }
  }

  let gagnant: { regle: Regle; total: number } | null = null;
  for (const { regle, score, indices } of scores.values()) {
    const total = score + (indices - 1) * 3;
    if (
      !gagnant ||
      total > gagnant.total ||
      (total === gagnant.total &&
        (RANG.get(regle.id) ?? 999) < (RANG.get(gagnant.regle.id) ?? 999))
    ) {
      gagnant = { regle, total };
    }
  }
  return gagnant?.regle ?? null;
}

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

/** La règle qui décrit le mieux ce texte, ou rien. */
function regleDe(texte: string): Regle | null {
  return peser(nu(texte));
}

/**
 * L'emoji d'une tâche.
 *
 * Une tâche qui commence DÉJÀ par un emoji garde le sien : on ne double pas la
 * pastille de quelqu'un qui a pris la peine d'en mettre une — et c'est aussi
 * ainsi qu'un choix fait à la main se conserve, sans colonne supplémentaire en
 * base.
 */
export function emojiPourTache(texte: string, niveau?: string): string {
  if (commenceParEmoji(texte)) return "";
  return regleDe(texte)?.emoji ?? PAR_NIVEAU[niveau ?? "secondaire"] ?? "🔹";
}

/**
 * L'emoji qu'on VERRAIT sur cette tâche, choisi à la main ou déduit.
 *
 * `emojiPourTache` répond « rien » quand l'intitulé porte déjà sa pastille,
 * parce qu'elle sert à en préfixer une. Ici on veut la pastille elle-même :
 * c'est ce qu'affiche l'aperçu du champ de saisie et ce qui coche la bonne case
 * dans le choix d'emoji.
 */
export function emojiVisible(texte: string, niveau?: string): string {
  return emojiDeTete(texte) ?? emojiPourTache(texte, niveau);
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
 * L'EMOJI CHOISI À LA MAIN DÉCIDE. Poser 📞 sur une tâche, c'est dire « celle-ci
 * va avec les appels » : elle rejoint donc le groupe des appels, même si son
 * intitulé parle d'autre chose. Sans ce lien, choisir un emoji n'aurait été
 * qu'un coup de peinture.
 *
 * `null` plutôt qu'une famille « Divers » : un tas fourre-tout se remplit de
 * tout ce qui n'a rien à voir, et on n'y retrouve plus rien. Les tâches sans
 * famille reconnue restent simplement seules dans la liste.
 */
export function familleDeTache(texte: string): Famille | null {
  const pose = emojiDeTete(texte);
  if (pose) {
    const r = REGLES.find((x) => x.emoji === pose);
    return r ? { id: r.id, emoji: r.emoji, nom: r.nom } : null;
  }
  const r = regleDe(texte);
  return r ? { id: r.id, emoji: r.emoji, nom: r.nom } : null;
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

/**
 * L'emoji posé en tête d'intitulé, tel quel — sélecteurs de variante et
 * jointures comprises.
 *
 * Un emoji n'est presque jamais un seul caractère : ✍️ en compte deux (le signe
 * et le sélecteur qui demande la version colorée), 🧑‍💻 en compte cinq, reliés
 * par des jointures invisibles. Une découpe naïve rendrait « ✍ » sans son
 * sélecteur, qui ne correspondrait alors à aucune règle — le choix fait à la
 * main serait perdu au premier rechargement.
 */
export function emojiDeTete(texte: string): string | null {
  const m = texte.match(
    /^\s*(\p{Extended_Pictographic}(?:️|︎)?(?:‍\p{Extended_Pictographic}(?:️|︎)?)*)/u,
  );
  return m ? m[1] : null;
}

/** L'intitulé débarrassé de l'emoji qu'on lui aurait posé en tête. */
export function sansEmoji(texte: string): string {
  const pose = emojiDeTete(texte);
  if (!pose) return texte.trim();
  return texte.replace(/^\s*/, "").slice(pose.length).trim();
}

/**
 * L'intitulé avec l'emoji choisi — ou rendu à la déduction automatique.
 *
 * LE CHOIX VIT DANS LE TITRE, et c'est délibéré. Une colonne « emoji » en base
 * demanderait une migration qu'on ne peut pas faire, mais surtout elle ne
 * suivrait pas la tâche : le récap du soir sur Telegram, le brief du matin et
 * l'archive des Oubliés lisent tous un titre, pas une colonne. Écrit dans le
 * titre, l'emoji est là partout, sans une ligne de code de plus.
 */
export function avecEmoji(texte: string, emoji: string | null): string {
  const propre = sansEmoji(texte);
  return emoji ? `${emoji} ${propre}` : propre;
}

/**
 * L'ordre d'affichage de la palette — celui du métier, pas celui des règles.
 *
 * `REGLES` est classé par PRIORITÉ de reconnaissance : les gestes d'abord,
 * parce qu'« appeler le monteur » doit donner le téléphone. Cet ordre est
 * réglé au cordeau et ne doit pas bouger — mais il n'a aucune raison d'être
 * celui du choix à la main. Là, ce qui compte est la fréquence : Twaylo
 * fabrique des vidéos, la première rangée doit donc porter le clap et la
 * miniature, pas la clé à molette.
 *
 * Les familles absentes de cette liste suivent, dans l'ordre du catalogue :
 * en ajouter une plus haut ne l'oublie jamais, elle atterrit simplement à la
 * fin.
 */
const ORDRE_PALETTE = [
  "video",
  "visuel",
  "ecriture",
  "voix",
  "chaine",
  "communaute",
  "reseaux",
  "appel",
  "message",
  "rdv",
  "argent",
  "business",
  "recherche",
  "idee",
  "envoi",
  "organisation",
  "voyage",
];

/**
 * Les emojis proposés au choix.
 *
 * C'est la liste des familles, pas une planche d'emojis : proposer les mille
 * emojis du clavier ferait une tâche pastèque et une tâche licorne, qui ne se
 * regrouperaient avec rien. Ici, choisir une pastille, c'est choisir un groupe.
 */
export const PALETTE: Famille[] = [...REGLES]
  .sort((a, b) => {
    const ia = ORDRE_PALETTE.indexOf(a.id);
    const ib = ORDRE_PALETTE.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  })
  .map((r) => ({ id: r.id, emoji: r.emoji, nom: r.nom }));
