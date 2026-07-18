import type { OsData } from "./types";

/**
 * Les vraies données de Twaylo (spec Partie 11).
 *
 * Twaylo démarre : les comptes ne sont pas encore ouverts, les vidéos sont
 * toutes au stade « idée », aucun revenu n'existe. Les cartes vides le disent
 * franchement plutôt que d'afficher des chiffres inventés — c'est le mode démo
 * qui sert aux captures d'écran.
 *
 * Tout ceci sera lu depuis Supabase à partir de l'étape 2.
 */
export const REAL_DATA: OsData = {
  operator: {
    name: "Twaylo",
    role: "YouTubeur · Explorateur",
    streakDays: 0,
    status: "En lancement",
    focus: "Lancer mes comptes (Snap · Facebook · TikTok)",
  },

  captures: [],

  tasks: [
    { text: "Créer le compte Facebook Twaylo", done: false, categorie: "Contenu" },
    { text: "Créer le compte Snap Twaylo", done: false, categorie: "Contenu" },
    { text: "Faire le décor (long + short)", done: false, categorie: "Contenu" },
    { text: "Finir les design patches (Momentum)", done: false, categorie: "Business" },
    { text: "Trouver un fournisseur", done: false, categorie: "Business" },
  ],

  // Habitudes à la façon de Miles : catégorie + objectif de séances.
  habits: [
    { name: 'Sport', categorie: 'Corps', cible: 5, fait: 0 },
    { name: 'Sommeil', categorie: 'Corps', fait: 0 },
    { name: 'Session créative', categorie: 'Création', cible: 6, fait: 0 },
    { name: 'Veille / recherche', categorie: 'Création', cible: 4, fait: 0 },
    { name: 'Communauté', categorie: 'Audience', cible: 5, fait: 0 },
    { name: 'Point finance', categorie: 'Business', fait: 0 },
  ],

  pipeline: [
    {
      status: "idee",
      name: "Idée",
      color: "var(--color-vio)",
      videos: [
        { title: "Format signature — Short #1", format: "Short" },
        { title: "Première grande enquête — les vérités du monde", format: "Long" },
        { title: "Vlog exploration — destination à définir", format: "Long" },
      ],
    },
    { status: "scenario", name: "Scénario", color: "var(--color-mag)", videos: [] },
    { status: "tournage", name: "Tournage", color: "var(--color-amb)", videos: [] },
    { status: "montage", name: "Montage", color: "var(--color-cor)", videos: [] },
    { status: "pret", name: "Prêt", color: "var(--color-ble)", videos: [] },
    { status: "publie", name: "Publié", color: "var(--color-ver)", videos: [] },
  ],

  objectives: [
    {
      period: "SEMAINE",
      label: "Lancer mes comptes",
      value: "0/3",
      pct: 0,
      color: "#e6c060",
      steps: [
        { text: "Compte Snap créé", done: false },
        { text: "Compte Facebook créé", done: false },
        { text: "Compte TikTok créé", done: false },
      ],
    },
    {
      period: "MOIS",
      label: "Publier 20 vidéos",
      value: "0/20",
      pct: 0,
      color: "#5fd39a",
      steps: [
        { text: "Décor prêt (long + short)", done: false },
        { text: "Format signature défini", done: false },
        { text: "Rythme de publication tenu", done: false },
      ],
    },
    {
      period: "TRIMESTRE",
      label: "Ma 1ʳᵉ grande vidéo d'exploration",
      value: "0%",
      pct: 0,
      color: "#61c9db",
      steps: [
        { text: "Sujet d'enquête choisi", done: false },
        { text: "Destination arrêtée", done: false },
        { text: "Tournage bouclé", done: false },
      ],
    },
    {
      period: "ANNÉE",
      label: "Devenir un des meilleurs YouTubeurs",
      value: "0%",
      pct: 0,
      color: "#ff6ba3",
      steps: [
        { text: "Comptes lancés", done: false },
        { text: "Régularité installée", done: false },
        { text: "Première vidéo à fort impact", done: false },
      ],
    },
  ],

  contacts: [
    { nom: "Damien", type: "equipe", relation: "actif" },
    { nom: "Lou", type: "equipe", relation: "actif" },
    { nom: "Cam", type: "equipe", relation: "actif" },
    { nom: "Nathan", type: "equipe", relation: "actif" },
    { nom: "Palmito", type: "collab", relation: "chaud" },
  ],

  // Aucun sponsor démarché pour l'instant.
  dealColumns: [
    { name: "Prospect", color: "#b48cf0", deals: [] },
    { name: "Négociation", color: "#e6c060", deals: [] },
    { name: "Signé", color: "#5fd39a", deals: [] },
    { name: "Livré", color: "#61c9db", deals: [] },
  ],

  dealStats: [
    { label: "Pipeline total", value: "—", color: "#5fd39a" },
    { label: "Signés ce mois", value: "—", color: "#61c9db" },
    { label: "En négociation", value: "—", color: "#e6c060" },
    { label: "Taux de closing", value: "—", color: "#ff6ba3" },
  ],

  ideas: [],
  schedule: [],
  events: [],
  creneaux: [],
  busyDays: {},

  // Rien n'est encore bloqué : Twaylo démarre seul.
  blocages: [],

  tickers: [
    { label: 'ABONNÉS', valeur: '—' },
    { label: 'VUES 30J', valeur: '—' },
    { label: 'RPM', valeur: '—' },
  ],

  revenue: {
    connected: false,
    amount: "—",
    delta: "",
    rpm: "—",
    monetizedViews: "—",
    stats: [
      { label: "Ce mois", value: "—", delta: "en attente", sensitive: true },
      { label: "RPM moyen", value: "—", delta: "en attente", sensitive: false },
      { label: "Vues monétisées", value: "—", delta: "en attente", sensitive: false },
      { label: "Prévision fin de mois", value: "—", delta: "objectif 10 000 €", sensitive: true },
    ],
    historyMax: 1,
    history: [],
    sources: [],
    topVideos: [],
  },

  journalEntries: [],
  memories: [],
};
