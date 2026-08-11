/**
 * Les textes du site, en français et en anglais.
 *
 * Tout est ici et nulle part ailleurs : une chaîne écrite en dur dans la
 * carte serait invisible au changement de langue, et le défaut ne se verrait
 * qu'une fois en ligne, chez un spectateur anglophone.
 *
 * Ce qui n'est PAS traduit, et ne doit pas l'être : les récits d'incidents,
 * les libellés de navire et d'agresseur, les références ASAM. Ce sont les
 * pièces d'origine de la NGA. Les traduire, ce serait réécrire la source.
 */

/**
 * Le pont entre ce qu'on tape en français et ce que la NGA a écrit en anglais.
 *
 * Les récits sont traduits par tranches ; l'immense majorité reste donc en
 * anglais. Sans ce pont, chercher « Somalie » ne trouvait que les 15 récits
 * déjà traduits, sur 400 qui parlent de la Somalie — et le champ de recherche
 * proposait précisément « Somalie, otage, tanker… » en exemple. « otage »
 * rendait 21 résultats sur 529, « pétrolier » 23 sur 2 277.
 *
 * On ne traduit pas la requête : on l'ÉLARGIT. Le mot tapé est cherché tel
 * quel — un francophone qui tape « pirates » doit trouver les deux — et ses
 * équivalents anglais sont cherchés en plus.
 *
 * Les clés sont écrites sans accent : la requête est elle-même dépouillée de
 * ses accents avant la comparaison, pour que « pétrolier » et « petrolier »
 * mènent au même endroit.
 */
export const EQUIVALENTS = {
  // Lieux
  somalie: ["somalia", "somali"],
  nigeria: ["nigeria"],
  indonesie: ["indonesia"],
  malaisie: ["malaysia"],
  singapour: ["singapore"],
  philippines: ["philippines"],
  thailande: ["thailand"],
  birmanie: ["myanmar", "burma"],
  vietnam: ["vietnam"],
  chine: ["china", "chinese"],
  inde: ["india", "indian"],
  japon: ["japan"],
  coree: ["korea", "korean"],
  taiwan: ["taiwan"],
  bresil: ["brazil"],
  colombie: ["colombia"],
  venezuela: ["venezuela"],
  mexique: ["mexico"],
  perou: ["peru"],
  equateur: ["ecuador"],
  haiti: ["haiti"],
  jamaique: ["jamaica"],
  cameroun: ["cameroon"],
  benin: ["benin"],
  togo: ["togo"],
  ghana: ["ghana"],
  guinee: ["guinea"],
  angola: ["angola"],
  gabon: ["gabon"],
  congo: ["congo"],
  tanzanie: ["tanzania"],
  kenya: ["kenya"],
  yemen: ["yemen"],
  oman: ["oman"],
  irak: ["iraq"],
  iran: ["iran"],
  koweit: ["kuwait"],
  russie: ["russia", "russian"],
  bangladesh: ["bangladesh"],
  "sri lanka": ["sri lanka"],
  "golfe d'aden": ["gulf of aden"],
  "mer rouge": ["red sea"],
  "golfe de guinee": ["gulf of guinea"],
  "detroit de malacca": ["strait of malacca", "malacca"],
  "delta du niger": ["niger delta"],

  // Navires
  petrolier: ["tanker"],
  chimiquier: ["chemical tanker"],
  gazier: ["lpg", "lng", "gas carrier"],
  vraquier: ["bulk carrier", "bulk"],
  "porte-conteneurs": ["container"],
  conteneur: ["container"],
  chalutier: ["trawler"],
  peche: ["fishing"],
  pecheur: ["fisherman", "fishermen"],
  remorqueur: ["tug"],
  barge: ["barge"],
  voilier: ["yacht", "sailing"],
  yacht: ["yacht"],
  cargo: ["cargo"],
  transbordeur: ["ferry"],
  ferry: ["ferry"],
  navire: ["vessel", "ship"],
  bateau: ["boat", "vessel"],
  vedette: ["speedboat", "skiff"],
  canot: ["dinghy", "skiff"],

  // L'incident
  otage: ["hostage"],
  enlevement: ["kidnap", "abduct"],
  enleve: ["kidnap", "abduct"],
  rancon: ["ransom"],
  detournement: ["hijack"],
  detourne: ["hijack"],
  abordage: ["boarded", "boarding"],
  aborde: ["boarded"],
  vol: ["stole", "stolen", "robb", "theft"],
  vole: ["stole", "stolen", "robb"],
  pille: ["ransack", "looted"],
  attaque: ["attack"],
  arme: ["armed", "weapon"],
  couteau: ["knife", "knives"],
  machette: ["machete"],
  fusil: ["rifle", "gun"],
  pistolet: ["pistol", "handgun"],
  mitrailleuse: ["machine gun"],
  grenade: ["grenade"],
  roquette: ["rocket", "rpg"],
  explosif: ["explosive"],
  tue: ["killed", "killing"],
  mort: ["dead", "killed", "death"],
  blesse: ["injured", "wounded"],
  equipage: ["crew"],
  capitaine: ["master", "captain"],
  mecanicien: ["engineer"],
  marin: ["sailor", "seaman", "crewman"],
  pirate: ["pirate"],
  pirates: ["pirates"],
  mouillage: ["anchorage", "anchored"],
  quai: ["berth", "berthed"],
  port: ["port", "harbour", "harbor"],
  echelle: ["ladder"],
  coffre: ["safe"],
  argent: ["cash", "money"],
  militaire: ["military", "navy", "naval"],
  garde: ["guard", "security"],
};

export const TEXTES = {
  fr: {
    langue: "fr-FR",

    saut: "Aller aux commandes",
    titre: "Piraterie",
    phrase: "Chaque marque est une attaque réelle contre un navire.",
    chiffres: "{total} incidents recensés de {debut} à {fin}.",
    carteAria: "Carte mondiale des attaques contre les navires",
    commandesAria: "Filtres, chronologie et recherche",
    chargement: "Chargement des incidents…",
    fermer: "Fermer",
    replier: "Replier",
    deplier: "Déplier",

    compteur: "incidents affichés",
    compteurUn: "incident affiché",
    aucun: "Aucun incident ne correspond à ces filtres.",
    pic: "Pic en {annee} ({nombre})",
    aucunMort: "aucune attaque mortelle",
    morts: "{nombre} attaques mortelles",
    mortsUn: "1 attaque mortelle",

    lire: "Dérouler la chronologie",
    arreter: "Arrêter la chronologie",
    anneeDebut: "Première année affichée",
    anneeFin: "Dernière année affichée",

    graviteAria: "Gravité",
    colorer: "Colorer",
    colorerActif: "Couleur par gravité activée",
    colorerInactif: "Colorer les navires selon la gravité",

    rechercheLabel: "Rechercher dans les récits",
    recherchePlaceholder: "Somalie, otage, tanker…",
    rechercheAttente: "Chargement des récits…",
    rechercheIndispo: "Recherche indisponible",

    filtres: "Filtres",
    partager: "Partager",
    effacer: "Tout effacer",
    zone: "Zone maritime",
    typeIncident: "Type d'incident",
    typeNavire: "Type de navire",

    lienCopie: "Lien copié, filtres compris.",
    lienACopier: "Copiez l'adresse de la page : elle contient vos filtres.",

    position: "Position",
    zoneFiche: "Zone",
    sousRegion: "Sous-région",
    navire: "Navire visé",
    agresseur: "Agresseur",
    dateInconnue: "Date inconnue",
    nonRenseigne: "non renseigné",
    recitTitre: "Récit d'origine",
    recitNote: "Texte d'origine de la NGA, en anglais — pas encore traduit.",
    recitTraduit: "Traduit de l'anglais. Le texte d'origine reste consultable.",
    voirOriginal: "Voir le texte d'origine",
    voirTraduction: "Voir la traduction",
    sansRecit: "Aucun récit dans la source.",
    recitAttente: "Chargement du récit…",
    referenceFiche: "Référence ASAM {reference} — National Geospatial-Intelligence Agency",
    referenceAbsente: "Référence ASAM non renseignée",
    lireTout: "Lire le récit complet",
    sansReference: "sans référence",

    source: "Source : NGA — base ASAM",
    video: "▶ Voir le documentaire",

    aproposTitre: "D'où viennent ces données",
    apropos1:
      "Toutes les attaques affichées proviennent de la base ASAM (Anti-Shipping Activity Messages) de la National Geospatial-Intelligence Agency américaine. Rien n'a été ajouté, complété ni corrigé : un champ absent de la source reste vide ici.",
    aproposCapture:
      "La NGA ne diffuse plus cette base publiquement. Les données affichées sont sa réponse officielle telle qu'archivée le {date} : elles s'arrêtent donc à cette date.",
    aproposDirect: "Données récupérées le {date} depuis l'API de la NGA.",
    apropos2:
      "Les catégories des filtres regroupent les libellés d'origine, que la base ne normalise pas — PIRATES et Pirates y comptent séparément. Chaque fiche affiche toujours le libellé exact enregistré par la NGA.",
    apropos3:
      "La gravité est un classement, pas une donnée de la NGA. La base ne hiérarchise pas ses incidents : elle range côte à côte un équipage tué et une barque qui s'approche puis repart. Les quatre niveaux sont déduits de mots présents dans le récit officiel, appliqués du plus grave au moins grave. Un incident sans récit n'est pas classé. Le récit intégral figure sur chaque fiche : le classement s'y vérifie sur pièce.",

    gravites: {
      3: ["Attaque mortelle", "Morts"],
      2: ["Violence ou enlèvement", "Violence"],
      1: ["Abordage et vol", "Vol"],
      0: ["Tentative ou approche", "Tentative"],
      "-1": ["Sans récit dans la source", "Sans récit"],
    },

    types: {
      pirates: "Pirates",
      suspect: "Approche suspecte",
      vol: "Vol et brigandage",
      detournement: "Détournement",
      enlevement: "Enlèvement",
      abordage: "Abordage",
      armes: "Assaillants armés",
      intrusion: "Intrusion",
      embarcation: "Embarcation suspecte",
      militaire: "Activité militaire",
      inconnu: "Non précisé",
    },

    navires: {
      petrolier: "Pétrolier et chimiquier",
      vraquier: "Vraquier",
      conteneurs: "Porte-conteneurs",
      peche: "Navire de pêche",
      voilier: "Voilier et yacht",
      remorqueur: "Remorqueur et barge",
      offshore: "Offshore et ravitailleur",
      passagers: "Navire à passagers",
      cargo: "Cargo",
      marchand: "Navire marchand",
      inconnu: "Non précisé",
    },

    zones: {
      I: "Europe du Nord",
      II: "Atlantique Est et Afrique de l'Ouest",
      III: "Méditerranée et mer Noire",
      IV: "Atlantique Ouest et Caraïbes",
      V: "Atlantique Sud-Ouest",
      VI: "Atlantique Sud",
      VII: "Afrique australe",
      VIII: "Océan Indien",
      IX: "Mer Rouge et golfe Persique",
      X: "Australie",
      XI: "Asie du Sud-Est et Pacifique Ouest",
      XII: "Pacifique Nord-Est",
      XIII: "Extrême-Orient russe",
      XIV: "Pacifique Sud central",
      XV: "Pacifique Sud-Est",
      XVI: "Pacifique Est",
    },
  },

  en: {
    langue: "en-GB",

    saut: "Skip to controls",
    titre: "Piracy",
    phrase: "Every mark is a real attack on a ship.",
    chiffres: "{total} incidents recorded from {debut} to {fin}.",
    carteAria: "World map of attacks on ships",
    commandesAria: "Filters, timeline and search",
    chargement: "Loading incidents…",
    fermer: "Close",
    replier: "Collapse",
    deplier: "Expand",

    compteur: "incidents shown",
    compteurUn: "incident shown",
    aucun: "No incident matches these filters.",
    pic: "Peak in {annee} ({nombre})",
    aucunMort: "no fatal attack",
    morts: "{nombre} fatal attacks",
    mortsUn: "1 fatal attack",

    lire: "Play the timeline",
    arreter: "Stop the timeline",
    anneeDebut: "First year shown",
    anneeFin: "Last year shown",

    graviteAria: "Severity",
    colorer: "Colour",
    colorerActif: "Colouring by severity is on",
    colorerInactif: "Colour ships by severity",

    rechercheLabel: "Search the accounts",
    recherchePlaceholder: "Somalia, hostage, tanker…",
    rechercheAttente: "Loading accounts…",
    rechercheIndispo: "Search unavailable",

    filtres: "Filters",
    partager: "Share",
    effacer: "Clear all",
    zone: "Sea area",
    typeIncident: "Incident type",
    typeNavire: "Vessel type",

    lienCopie: "Link copied, filters included.",
    lienACopier: "Copy the page address: it carries your filters.",

    position: "Position",
    zoneFiche: "Area",
    sousRegion: "Sub-region",
    navire: "Vessel attacked",
    agresseur: "Attackers",
    dateInconnue: "Date unknown",
    nonRenseigne: "not recorded",
    recitTitre: "Original account",
    recitNote: "Original NGA text, in English — the source record.",
    recitTraduit: "Translated from English. The source text remains available.",
    voirOriginal: "Show the source text",
    voirTraduction: "Show the translation",
    sansRecit: "No account in the source.",
    recitAttente: "Loading account…",
    referenceFiche: "ASAM reference {reference} — National Geospatial-Intelligence Agency",
    referenceAbsente: "ASAM reference not recorded",
    lireTout: "Read the full account",
    sansReference: "no reference",

    source: "Source: NGA — ASAM database",
    video: "▶ Watch the documentary",

    aproposTitre: "Where this data comes from",
    apropos1:
      "Every attack shown comes from the ASAM database (Anti-Shipping Activity Messages) of the US National Geospatial-Intelligence Agency. Nothing has been added, completed or corrected: a field missing from the source stays empty here.",
    aproposCapture:
      "The NGA no longer publishes this database. The data shown is its official response as archived on {date}: it therefore stops at that date.",
    aproposDirect: "Data retrieved on {date} from the NGA API.",
    apropos2:
      "Filter categories group the original labels, which the database does not normalise — PIRATES and Pirates count separately there. Every record still shows the exact label recorded by the NGA.",
    apropos3:
      "Severity is a classification, not NGA data. The database does not rank its incidents: it files a murdered crew next to a skiff that approaches and leaves. The four levels are inferred from words present in the official account, applied from most to least severe. An incident without an account is left unclassified. The full account appears on every record: the classification can be checked against it.",

    gravites: {
      3: ["Fatal attack", "Fatal"],
      2: ["Violence or kidnapping", "Violence"],
      1: ["Boarding and theft", "Theft"],
      0: ["Attempt or approach", "Attempt"],
      "-1": ["No account in the source", "No account"],
    },

    types: {
      pirates: "Pirates",
      suspect: "Suspicious approach",
      vol: "Robbery and theft",
      detournement: "Hijacking",
      enlevement: "Kidnapping",
      abordage: "Boarding",
      armes: "Armed assailants",
      intrusion: "Intrusion",
      embarcation: "Suspicious craft",
      militaire: "Military activity",
      inconnu: "Not stated",
    },

    navires: {
      petrolier: "Tanker and chemical tanker",
      vraquier: "Bulk carrier",
      conteneurs: "Container ship",
      peche: "Fishing vessel",
      voilier: "Yacht and sailing vessel",
      remorqueur: "Tug and barge",
      offshore: "Offshore and supply",
      passagers: "Passenger ship",
      cargo: "Cargo ship",
      marchand: "Merchant vessel",
      inconnu: "Not stated",
    },

    zones: {
      I: "Northern Europe",
      II: "Eastern Atlantic and West Africa",
      III: "Mediterranean and Black Sea",
      IV: "Western Atlantic and Caribbean",
      V: "South-West Atlantic",
      VI: "South Atlantic",
      VII: "Southern Africa",
      VIII: "Indian Ocean",
      IX: "Red Sea and Persian Gulf",
      X: "Australia",
      XI: "South-East Asia and Western Pacific",
      XII: "North-East Pacific",
      XIII: "Russian Far East",
      XIV: "South Central Pacific",
      XV: "South-East Pacific",
      XVI: "Eastern Pacific",
    },
  },
};
