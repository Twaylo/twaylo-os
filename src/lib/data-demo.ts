import type { OsData } from "./types";

/**
 * Jeu de démonstration (spec Partie 3 : « mode démo obligatoire »).
 *
 * Reprend la maquette Claude Design, plus les chiffres de revenus « démo
 * réaliste » de la Partie 11. Sert aux captures d'écran et aux vidéos YouTube :
 * l'OS a l'air plein et vécu, sans exposer les vraies données de Twaylo.
 */
export const DEMO_DATA: OsData = {
  operator: {
    name: "Twaylo",
    role: "YouTubeur · Explorateur",
    streakDays: 42,
    status: "En terrain",
    focus: "Boucler la Vérité #12 avant vendredi",
  },

  captures: [
    { text: "Filmer le lever de soleil sur le salar", type: "idee_video" },
    { text: "Rappeler le fixeur avant vendredi", type: "tache" },
    { text: "Vocal Telegram — 0:42 transcrit", type: "idee_video" },
  ],

  tasks: [
    { text: "Finaliser le montage — Vérité #12", done: false, categorie: "Contenu" },
    { text: "Répondre au sponsor NordVPN (18h)", done: false, categorie: "Business" },
    { text: "Valider la miniature du Short", done: true, categorie: "Contenu" },
    { text: "Repérage lieux — tournage Bolivie", done: false, categorie: "Contenu" },
    { text: "Appeler l'agence de fixing (Congo)", done: false, categorie: "Business" },
  ],

  habits: [
    { name: "Sport", done: true },
    { name: "Session créative", done: true },
    { name: "Communauté", done: false },
    { name: "Veille / recherche", done: true },
    { name: "Point finance", done: false },
    { name: "Sommeil", done: true },
  ],

  pipeline: [
    {
      status: "idee",
      name: "Idée",
      color: "var(--color-vio)",
      videos: [
        { title: "Pourquoi l'eau se raréfie", format: "Long" },
        { title: "3 mensonges sur le voyage", format: "Short" },
      ],
    },
    {
      status: "scenario",
      name: "Scénario",
      color: "var(--color-mag)",
      videos: [{ title: "Les enfants du cobalt", format: "Long" }],
    },
    {
      status: "tournage",
      name: "Tournage",
      color: "var(--color-amb)",
      videos: [{ title: "24h dans une favela", format: "Long" }],
    },
    {
      status: "montage",
      name: "Montage",
      color: "var(--color-cor)",
      videos: [
        { title: "On m'a menti toute ma vie", format: "Short" },
        { title: "La vérité sur Dubaï", format: "Long" },
      ],
    },
    {
      status: "pret",
      name: "Prêt",
      color: "var(--color-ble)",
      videos: [{ title: "Le prix caché du café", format: "Short" }],
    },
    {
      status: "publie",
      name: "Publié",
      color: "var(--color-ver)",
      videos: [{ title: "Le pays le plus fermé du monde", format: "Long" }],
    },
  ],

  objectives: [
    {
      period: "SEMAINE",
      label: "3 vidéos publiées",
      value: "2/3",
      pct: 66,
      color: "#e6c060",
      steps: [
        { text: "Vidéo 1 publiée", done: true },
        { text: "Vidéo 2 publiée", done: true },
        { text: "Vidéo 3 — en montage", done: false },
      ],
    },
    {
      period: "MOIS",
      label: "100k abonnés",
      value: "87k",
      pct: 87,
      color: "#5fd39a",
      steps: [
        { text: "90k atteints", done: true },
        { text: "Collab prévue", done: true },
        { text: "Passer la barre des 100k", done: false },
      ],
    },
    {
      period: "TRIMESTRE",
      label: "Tournage Amérique du Sud",
      value: "40%",
      pct: 40,
      color: "#61c9db",
      steps: [
        { text: "Vols réservés", done: true },
        { text: "Fixeurs contactés", done: false },
        { text: "Matériel assuré", done: false },
      ],
    },
    {
      period: "ANNÉE",
      label: "1M abonnés",
      value: "62%",
      pct: 62,
      color: "#ff6ba3",
      steps: [
        { text: "620k abonnés", done: true },
        { text: "Régularité 3/sem.", done: false },
        { text: "Cap du million", done: false },
      ],
    },
  ],

  contacts: [
    { nom: "Damien", type: "equipe", relation: "actif", role: "Monteur", prochaineAction: "Retour sur le montage Vérité #12" },
    { nom: "Lou", type: "equipe", relation: "actif", role: "Miniatures", prochaineAction: "Valider 3 variantes" },
    { nom: "Cam", type: "equipe", relation: "actif", role: "Cadreur", prochaineAction: "Brief tournage Bolivie" },
    { nom: "Nathan", type: "equipe", relation: "actif", role: "Son", prochaineAction: "Test micro cravate" },
    { nom: "Palmito", type: "collab", relation: "chaud", role: "Créateur", prochaineAction: "Caler la date de collab" },
    { nom: "Elena Marchetti", type: "sponsor", relation: "tiede", role: "NordVPN", prochaineAction: "Relancer le devis" },
    { nom: "Studio Kairos", type: "fournisseur", relation: "froid", role: "Location matériel", prochaineAction: "Demander le catalogue" },
  ],

  dealColumns: [
    {
      name: "Prospect",
      color: "#b48cf0",
      deals: [
        { name: "GoPro", amount: "—", note: "1er contact envoyé" },
        { name: "Airbnb", amount: "8 k€", note: "brief reçu" },
      ],
    },
    {
      name: "Négociation",
      color: "#e6c060",
      deals: [
        { name: "Surfshark", amount: "5 k€", note: "relance à 18h" },
        { name: "Nike", amount: "15 k€", note: "devis envoyé" },
      ],
    },
    {
      name: "Signé",
      color: "#5fd39a",
      deals: [{ name: "NordVPN", amount: "6 k€", note: "tournage jeudi" }],
    },
    {
      name: "Livré",
      color: "#61c9db",
      deals: [{ name: "Incogni", amount: "4 k€", note: "payé ✓" }],
    },
  ],

  dealStats: [
    { label: "Pipeline total", value: "42 000 €", color: "#5fd39a" },
    { label: "Signés ce mois", value: "16 000 €", color: "#61c9db" },
    { label: "En négociation", value: "20 000 €", color: "#e6c060" },
    { label: "Taux de closing", value: "38 %", color: "#ff6ba3" },
  ],

  ideas: [
    { title: "La face cachée du tourisme de masse", format: "Long", src: "Telegram" },
    { title: "J'ai vécu sans argent 7 jours", format: "Long", src: "Journal" },
    { title: "Ce qu'on te cache sur l'eau en bouteille", format: "Short", src: "Idée" },
    { title: "Rencontre avec un chercheur d'or", format: "Long", src: "Terrain" },
  ],

  schedule: [
    { date: "Ven 18", title: "On m'a menti toute ma vie", format: "Short" },
    { date: "Lun 21", title: "La vérité sur Dubaï", format: "Long" },
    { date: "Jeu 24", title: "Les enfants du cobalt", format: "Long" },
  ],

  events: [
    { time: "09:00", title: "Tournage extérieur — parc", color: "var(--color-ver)" },
    { time: "14:00", title: "Call sponsor NordVPN", color: "var(--color-mag)" },
    { time: "16:30", title: "Session montage — Vérité #12", color: "var(--color-cya)" },
  ],

  /** Positions dans la semaine (0 = lundi) plutôt que des dates figées. */
  busyDays: {
    1: "var(--color-mag)",
    3: "var(--color-cya)",
    4: "var(--color-amb)",
    5: "var(--color-ble)",
  },

  revenue: {
    connected: true,
    amount: "8 420 €",
    delta: "+12%",
    rpm: "4,80 €",
    monetizedViews: "1,75 M",
    stats: [
      { label: "Ce mois", value: "8 420 €", delta: "+12 % vs M-1", sensitive: true },
      { label: "RPM moyen", value: "4,80 €", delta: "+0,30 €", sensitive: false },
      { label: "Vues monétisées", value: "1,75 M", delta: "+8 %", sensitive: false },
      { label: "Prévision fin de mois", value: "11 200 €", delta: "objectif 10 000 €", sensitive: true },
    ],
    historyMax: 9000,
    history: [
      { month: "Fév", value: 5200 },
      { month: "Mar", value: 6100 },
      { month: "Avr", value: 5800 },
      { month: "Mai", value: 7300 },
      { month: "Juin", value: 6900 },
      { month: "Juil", value: 8420 },
    ],
    sources: [
      { label: "Publicité AdSense", pct: 62, color: "var(--color-ver)" },
      { label: "Sponsors", pct: 28, color: "var(--color-mag)" },
      { label: "Membres de la chaîne", pct: 7, color: "var(--color-ble)" },
      { label: "Merch", pct: 3, color: "var(--color-amb)" },
    ],
    topVideos: [
      { title: "Le pays le plus fermé du monde", format: "Long", views: "820 k", rev: "2 140 €" },
      { title: "On m'a menti toute ma vie", format: "Short", views: "1,2 M", rev: "1 380 €" },
      { title: "24h dans une favela", format: "Long", views: "540 k", rev: "1 020 €" },
    ],
  },

  journalEntries: [
    {
      date: "17 juil",
      place: "La Paz",
      snippet:
        "Marché aux sorcières, longue discussion avec une vendeuse sur le prix du gaz.",
    },
    {
      date: "16 juil",
      place: "La Paz",
      snippet:
        "Repérage téléphérique, lumière incroyable au coucher. Idée de plan d'ouverture.",
    },
    {
      date: "15 juil",
      place: "Uyuni",
      snippet: "Nuit sur le salar, -8°C. Le silence total, jamais filmé un truc pareil.",
    },
    {
      date: "14 juil",
      place: "Uyuni",
      snippet: "Rencontre avec un mineur de sel, m'a raconté sa journée type.",
    },
  ],

  memories: [
    "Twaylo prépare une série « Vérités » sur les chaînes d'approvisionnement.",
    "Prochain terrain : Bolivie puis Congo, budget fixing à valider.",
    "Ton préféré : direct, immersif, à la première personne.",
  ],
};
