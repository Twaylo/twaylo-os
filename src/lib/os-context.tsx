"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/**
 * `useLayoutEffect` côté navigateur, `useEffect` côté serveur.
 *
 * Next.js pré-rend ce composant sur le serveur, où `useLayoutEffect` n'a aucun
 * sens (rien à peindre) et fait grogner React à chaque rendu. On garde donc le
 * bon outil là où il agit — avant la peinture, dans le navigateur — sans
 * polluer les journaux du serveur.
 */
const useEffetAvantPeinture =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
import { DEMO_DATA } from "./data-demo";
import { REAL_DATA } from "./data-real";
import {
  AMBIANCES,
  CUSTOM_DEFAUT,
  bornerCustom,
  ordonnerOnglets,
  type CustomConfig,
} from "./custom";
import { JOURNEES_DEFAUT, bornerJournees, type JourneesConfig } from "./journees";
import {
  KEYS,
  dailyKey,
  pruneOldDailyKeys,
  readJSON,
  writeJSON,
  writeJSONDebounced,
} from "./storage";
import { classifyWithRegex } from "./router/regexClassifier";
import {
  basculerTacheDistante,
  chargerEtat,
  surChangementSync,
  synchroniserJour,
} from "./sync";
import { localDateKey } from "./local-date";
import type { EvenementAgenda } from "./agenda-types";
import type {
  Blocage,
  BlocageStocke,
  Capture,
  Niveau,
  Contact,
  FaitesDuJour,
  Habit,
  OsData,
  PipelineColumn,
  Repas,
  Task,
  UneChose,
} from "./types";
import { niveauDepuisUrgence } from "./types";

export const TABS = [
  "Accueil",
  "Brain",
  "Bilan",
  "Journée type",
  "Contacts",
  "Sponsors",
  "Contenu",
  "Revenus",
  "Journal",
  "Objectifs",
  "Skill",
  "Revue",
  "Oubliés",
] as const;

export type Tab = (typeof TABS)[number];

type OsState = {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;

  /** Bascule vers le jeu de données factices, pour filmer l'OS. */
  demoMode: boolean;
  toggleDemo: () => void;

  /** Les réglages de personnalisation — ambiance, onglets, identité. */
  custom: CustomConfig;
  majCustom: (patch: Partial<CustomConfig>) => void;
  /** Les onglets du rail : dans l'ordre choisi, sans les masqués. */
  ongletsVisibles: Tab[];

  /**
   * Les journées types — les immuables de Twaylo. Le modèle ne se remet
   * jamais à zéro ; seules les coches du jour repartent vierges le matin.
   */
  journees: JourneesConfig | null;
  majJournees: (config: JourneesConfig) => void;
  /** Les blocs cochés aujourd'hui (identifiants). */
  blocsFaits: string[];
  basculerBlocFait: (blocId: string) => void;

  /** Les données affichées — REAL_DATA ou DEMO_DATA selon le mode. */
  data: OsData;

  /** Masque les montants tant qu'il est faux. */
  revealed: boolean;
  toggleRevealed: () => void;

  captures: Capture[];
  /**
   * Trie et range une capture. Le texte est PASSÉ en argument : il vit dans la
   * barre de capture, pas ici. Le garder dans l'état central faisait
   * réconcilier les treize cartes de l'accueil à chaque caractère tapé, pour
   * une valeur qu'aucune autre carte ne lit.
   */
  addCapture: (texte: string) => void;
  /** Vrai pendant l'aller-retour de tri — sert à désactiver le bouton. */
  capturing: boolean;

  tasks: (Task & { id?: string })[];
  toggleTask: (i: number) => void;

  /** Où en est la synchro avec la base — affiché dans le rail. */
  sync: "inconnu" | "connecte" | "hors_ligne" | "erreur";

  habits: Habit[];
  /** Ce qui a été coché aujourd'hui : id d'habitude → options faites. */
  faitesDuJour: FaitesDuJour;
  /** Coche ou décoche une variante (« Gym » sur « Sport »). */
  cocherOption: (habitId: string, option: string) => void;
  /** Pour les habitudes sans variante : coche ou décoche tout court. */
  basculerHabitude: (habitId: string) => void;
  /** Floute/dé-floute une habitude sensible (visible seulement une fois « Révélé »). */
  basculerHabitudePrivee: (habitId: string) => void;
  /** Format libre : « Nom · Catégorie · Option1, Option2 ». */
  ajouterHabitude: (saisie: string) => Promise<void>;
  supprimerHabitude: (habitId: string) => void;

  /** Les objectifs, venus de la base. Nuls tant que la lecture n'a pas répondu. */
  objectifs: ObjectifVue[] | null;
  /** Renvoie faux si l'enregistrement a échoué — la saisie reste alors à l'écran. */
  ajouterObjectif: (libelle: string, portee: string) => Promise<boolean>;
  /** Fait avancer un objectif : progression, chiffre affiché, étapes. */
  majObjectif: (id: string, patch: Partial<Omit<ObjectifVue, "id">>) => void;
  supprimerObjectif: (id: string) => void;

  /** Les stats YouTube, nulles tant que la lecture n'a pas répondu. */
  youtube: YoutubeStats | null;

  /** Les événements de la semaine, venus de Google Agenda. */
  agenda: EvenementAgenda[];
  /** Faux tant que l'URL iCal n'est pas configurée, ou si l'agenda ne répond pas. */
  agendaConnecte: boolean;

  /** Ce qui est arrêté et attend quelqu'un. */
  blocages: Blocage[];
  /** Format libre : « Ce qui bloque · Chez qui ». */
  ajouterBlocage: (saisie: string) => Promise<void>;
  /** Le blocage est levé : on l'enlève. */
  leverBlocage: (id: string) => void;

  /** L'unique chose que Twaylo a décidé de faire aujourd'hui. */


  /** Les repas du jour. Vivent ici pour participer au cycle charge/synchronise. */

  /**
   * Pipeline et contacts venus de la base. Nuls tant que le chargement n'a
   * pas répondu — les vues retombent alors sur `data`, qui porte le jeu de
   * démonstration ou les valeurs d'amorçage.
   */
  pipeline: PipelineColumn[] | null;
  contacts: (Contact & { id: string })[] | null;

  /** Fait avancer une vidéo d'une étape, ou la ramène en arrière. */
  deplacerVideo: (id: string, statut: string) => void;
  /** Ajoute une idée au pipeline. */
  ajouterVideo: (
    titre: string,
    format?: "short" | "long",
    /** L'étape où la créer — la colonne dans laquelle Twaylo a tapé. */
    statut?: string,
  ) => Promise<boolean>;
  supprimerVideo: (id: string) => void;
  /** Renomme une vidéo sans changer son étape. */
  renommerVideo: (id: string, titre: string) => void;

  /** Faux tant que la base n'a pas répondu : la liste affichée n'est qu'une attente. */
  tachesPretes: boolean;
  ajouterTache: (titre: string, niveau?: Niveau) => Promise<void>;
  /** Fait passer une tâche du focus principal aux annexes, ou l'inverse. */
  changerNiveauTache: (id: string, niveau: Niveau) => void;
  supprimerTache: (id: string) => void;
  /** Corrige le texte d'une tâche sans la recréer. */
  renommerTache: (id: string, titre: string) => void;
  /** Échange deux tâches de place, par leurs index dans `tasks`. */
  echangerTaches: (a: number, b: number) => void;
  /**
   * Fin d'un glisser-déposer : applique le nouvel ordre (liste d'identifiants)
   * et, si la tâche déplacée a changé de niveau, son nouveau niveau.
   */
  deposerTache: (
    ordreIds: string[],
    changementNiveau: { id: string; niveau: Niveau } | null,
  ) => void;
  /**
   * Clôture la todo du jour : fige l'instantané dans l'historique, puis vide la
   * liste pour repartir à neuf le lendemain.
   */
  passerJourSuivant: () => Promise<void>;
  /** Date (clé locale) où la todo a été clôturée à la main — sinon "". */
  todoCloturee: string;

  /**
   * Remet un oublié dans la todo : il réapparaît en tête, tout de suite —
   * sans ça il fallait recharger la page pour le revoir.
   */
  reprendreOublie: (id: string, niveau?: Niveau) => Promise<boolean>;

  ajouterContact: (
    nom: string,
    type?: string,
    /** La chaleur de départ — la colonne dans laquelle Twaylo a tapé. */
    relation?: string,
  ) => Promise<boolean>;
  supprimerContact: (id: string) => void;
  /** Change la chaleur d'un contact — c'est ce que fait le glisser-déposer. */
  deplacerContact: (id: string, relation: string) => void;

  deals: DealVue[] | null;
  dealStats: { label: string; value: string; color: string }[] | null;
  ajouterDeal: (nom: string, etape?: string) => Promise<void>;
  deplacerDeal: (id: string, etape: string) => void;
  supprimerDeal: (id: string) => void;
  majMontantDeal: (id: string, montant: number | null) => void;
  /** Fixe (ou efface, avec null) l'échéance d'un deal — format AAAA-MM-JJ. */
  majEcheanceDeal: (id: string, echeance: string | null) => void;
};

/** Les statistiques YouTube, telles que le navigateur les reçoit. */
export type YoutubeStats = {
  connecte: boolean;
  periode: string;
  vues: number;
  minutesVisionnees: number;
  abonnesGagnes: number;
  revenuEstime: number | null;
  rpm: number | null;
  abonnesTotal: number | null;
  parJour: { date: string; vues: number }[];
  error?: string;
};

/** Un objectif tel que l'interface le manipule. */
export type ObjectifVue = {
  id: string;
  objectif: string;
  portee: string;
  statut: string;
  pct: number;
  valeur: string;
  etapes: { texte: string; fait: boolean }[];
};

/** Un deal tel que l'interface le manipule. */
export type DealVue = {
  id: string;
  nom: string;
  etape: string;
  montant: number | null;
  note: string | null;
  /** Échéance au format AAAA-MM-JJ, nulle tant qu'elle n'est pas fixée. */
  echeance: string | null;
};

const OsContext = createContext<OsState | null>(null);

/**
 * Ce qui change à CHAQUE CARACTÈRE tapé, sorti du contexte principal.
 *
 * Un contexte React re-rend tous ses lecteurs dès que sa valeur change
 * d'identité. Le journal du soir, la chose du jour et les repas vivaient dans
 * le contexte central : taper une lettre y reconstruisait la valeur, donc
 * réconciliait les treize cartes de l'accueil. Mesuré sur processeur bridé :
 * 20,7 ms de travail par frappe, contre 2,3 ms pour un champ à état local.
 *
 * Ces trois-là ont désormais leur propre contexte. L'état reste UNIQUE et
 * synchrone — pas de tampon différé, pas de copie locale : les drapeaux
 * `modifie`, la remise à zéro du mode démo et l'affichage simultané de « la
 * chose du jour » dans deux cartes continuent de fonctionner exactement comme
 * avant. Seuls les composants qui lisent vraiment ces champs re-rendent.
 */
type OsSaisie = {
  journalText: string;
  setJournalText: Dispatch<SetStateAction<string>>;
  uneChose: UneChose;
  setUneChose: Dispatch<SetStateAction<UneChose>>;
  repas: Repas[];
  setRepas: Dispatch<SetStateAction<Repas[]>>;
};

const OsSaisieContext = createContext<OsSaisie | null>(null);

/**
 * Le résumé de ces mêmes champs, réduit à ce que le reste de l'OS en fait.
 *
 * La couche progression n'a besoin que de trois scalaires : le journal est-il
 * écrit, la chose du jour est-elle faite, combien de repas. S'abonner au
 * contexte de saisie l'aurait fait re-rendre à chaque lettre — et avec elle
 * la carte Progression, le rail, la journée type et les tâches clés, qui
 * lisent SON contexte. Un contexte séparé, dont la valeur ne change que
 * lorsque l'un des trois scalaires change, coupe la propagation net.
 */
type ResumeSaisie = {
  journalEcrit: boolean;
  uneChoseFaite: boolean;
  nombreRepas: number;
};

const OsResumeContext = createContext<ResumeSaisie | null>(null);

/**
 * Vrai pour une ligne créée à l'écran dont le serveur n'a pas encore renvoyé
 * l'identifiant réel. Aucune requête ne doit partir avec un tel identifiant :
 * la ligne n'existe pas en base, et l'appel échouerait sans rien apprendre.
 */
function estProvisoire(id: string | undefined): boolean {
  return Boolean(id?.startsWith("tmp-"));
}

/** Ce que Twaylo a fait à une tâche avant que le serveur ne la confirme. */
type GesteProvisoire = {
  done?: boolean;
  titre?: string;
  niveau?: Niveau;
  supprimee?: boolean;
  /** Le rangement complet voulu, si la tâche a été déplacée. */
  ordre?: string[];
};

export function OsProvider({ children }: { children: ReactNode }) {
  /** Lu depuis des callbacks stables, qui ne doivent pas se recréer à chaque rendu. */
  const demoModeRef = useRef(false);

  const [activeTab, setActiveTab] = useState<Tab>("Accueil");
  const [demoMode, setDemoMode] = useState(false);
  const [custom, setCustom] = useState<CustomConfig>(CUSTOM_DEFAUT);
  /** Vrai dès que Twaylo a touché un réglage : la réponse serveur ne l'écrase plus. */
  const customTouche = useRef(false);
  const customRef = useRef<CustomConfig>(CUSTOM_DEFAUT);
  customRef.current = custom;

  const [journees, setJournees] = useState<JourneesConfig | null>(null);
  const [blocsFaits, setBlocsFaits] = useState<string[]>([]);
  const journeesMinuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** La configuration qui attend son écriture, pour la sauver à la fermeture. */
  const journeesEnAttente = useRef<JourneesConfig | null>(null);
  const journeesRef = useRef<JourneesConfig | null>(null);
  journeesRef.current = journees;
  const blocsFaitsRef = useRef<string[]>([]);
  blocsFaitsRef.current = blocsFaits;
  const [revealed, setRevealed] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [uneChose, setUneChose] = useState<UneChose>({ texte: "", fait: false });
  const [repas, setRepas] = useState<Repas[]>([]);
  const [pipeline, setPipeline] = useState<PipelineColumn[] | null>(null);
  const [contacts, setContacts] = useState<(Contact & { id: string })[] | null>(null);
  const [deals, setDeals] = useState<DealVue[] | null>(null);
  const [dealStats, setDealStats] = useState<
    { label: string; value: string; color: string }[] | null
  >(null);

  /**
   * La série est calculée en base à partir des journées réellement remplies —
   * elle n'a donc pas sa place dans les données statiques.
   */
  const [serie, setSerie] = useState<number | null>(null);

  /** Le jour affiché. Change au passage de minuit et relance les calculs qui en dépendent. */
  const [jourCourant, setJourCourant] = useState("");

  const data = useMemo(() => {
    if (demoMode) return DEMO_DATA;
    if (serie === null) return REAL_DATA;
    return { ...REAL_DATA, operator: { ...REAL_DATA.operator, streakDays: serie } };
  }, [demoMode, serie]);

  demoModeRef.current = demoMode;

  // Les listes cochables sont éditables, donc copiées dans l'état local.
  const [captures, setCaptures] = useState<Capture[]>(REAL_DATA.captures);
  /*
   * On démarre sur une liste VIDE, jamais sur les tâches d'exemple.
   *
   * `REAL_DATA.tasks` servait d'état initial : au lancement, l'écran affichait
   * donc une seconde de fausses tâches avant que la base ne réponde. Elles
   * n'appartenaient à personne, et l'instantané du jour pouvait même les écrire
   * dans l'historique avant l'arrivée des vraies. Ce jeu d'exemple n'a qu'un
   * usage légitime : amorcer la base d'un tout nouveau compte, côté serveur
   * (voir `lireTaches` dans db.ts).
   */
  const [tasks, setTasks] = useState<Task[]>([]);
  /** Faux tant que la base n'a pas répondu — évite d'annoncer « aucune tâche ». */
  const [tachesPretes, setTachesPretes] = useState(false);
  // Jour où Twaylo a clôturé sa todo à la main. Tant qu'on reste ce jour-là,
  // l'instantané des tâches ne réécrit pas la liste vidée par-dessus l'archive.
  const [todoCloturee, setTodoCloturee] = useState("");
  const [habits, setHabits] = useState<Habit[]>([]);
  const [faitesDuJour, setFaitesDuJour] = useState<FaitesDuJour>({});
  const [blocagesBruts, setBlocagesBruts] = useState<BlocageStocke[]>([]);

  /**
   * Ce que Twaylo a modifié avant que la réponse du serveur n'arrive.
   *
   * `GET /api/state` est lancé au montage ; sa réponse a été calculée AVANT
   * un ajout fait pendant le chargement. L'appliquer telle quelle faisait
   * disparaître de l'écran le blocage ou l'habitude qu'on venait de créer —
   * et si on en supprimait un autre dans la foulée, la liste amputée était
   * renvoyée en base et la perte devenait définitive.
   */
  const touchePendantChargement = useRef({
    habitudes: false,
    blocages: false,
    taches: false,
  });

  /*
   * Miroirs de l'état, rafraîchis à chaque rendu.
   *
   * Un gestionnaire d'événement lit toujours la valeur courante ici, alors
   * qu'une variable capturée par la closure date du rendu où elle a été
   * créée. C'est la façon propre de résoudre le problème : glisser un
   * `fetch` dans un updater `setState` le ferait partir deux fois en mode
   * strict, puisque React y invoque les updaters deux fois pour débusquer les
   * effets de bord.
   */
  const habitsRef = useRef<Habit[]>([]);
  const blocagesRef = useRef<BlocageStocke[]>([]);
  const [objectifs, setObjectifs] = useState<ObjectifVue[] | null>(null);
  const [agenda, setAgenda] = useState<EvenementAgenda[]>([]);
  const [youtube, setYoutube] = useState<YoutubeStats | null>(null);
  const [agendaConnecte, setAgendaConnecte] = useState(false);
  const [sync, setSync] = useState<"inconnu" | "connecte" | "hors_ligne" | "erreur">(
    "inconnu",
  );

  const tasksRef = useRef<(Task & { id?: string })[]>([]);
  tasksRef.current = tasks;
  habitsRef.current = habits;
  blocagesRef.current = blocagesBruts;
  const objectifsRef = useRef<ObjectifVue[] | null>(null);
  objectifsRef.current = objectifs;
  const dealsRef = useRef<DealVue[] | null>(null);
  dealsRef.current = deals;
  // Numérote les identifiants provisoires des créations optimistes, le temps
  // que le serveur renvoie le vrai.
  const compteurTemp = useRef(0);

  /**
   * Ce que Twaylo a fait à une tâche AVANT que le serveur ne confirme sa
   * création.
   *
   * La nouvelle tâche apparaît en tête de pile : la cocher, la renommer ou la
   * jeter dans la seconde qui suit est le geste le plus naturel du monde — et
   * pendant cette seconde elle ne porte qu'un identifiant `tmp-…` que la base
   * ne connaît pas. Envoyer les requêtes tout de suite donnait des erreurs
   * serveur ; ne rien envoyer perdait le geste en silence, et la coche
   * disparaissait au moment de la substitution. On mémorise donc ce qui a été
   * fait, et on le rejoue sur le vrai identifiant dès qu'il arrive.
   */
  const gestesAvantConfirmation = useRef<Map<string, GesteProvisoire>>(new Map());

  /**
   * De l'identifiant provisoire au vrai, une fois la création confirmée.
   *
   * Un geste peut arriver PENDANT la substitution : la ligne a déjà pris son
   * identifiant définitif, mais le glisser en cours porte encore l'ancien. Le
   * geste était alors rangé dans une case que plus personne ne relit, et se
   * perdait en silence. Avec cette correspondance il part directement au
   * serveur, sur le bon identifiant.
   */
  const tmpVersReel = useRef<Map<string, string>>(new Map());

  /** L'identifiant réel s'il est connu, sinon celui qu'on a sous la main. */
  const resoudreId = useCallback((id: string) => tmpVersReel.current.get(id) ?? id, []);

  /** Envoie au serveur un geste rattrapé, sur l'identifiant définitif. */
  const appliquerGesteDistant = useCallback(
    (id: string, geste: GesteProvisoire) => {
      if (geste.supprimee) {
        void fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
          (err) => console.error("[taches] suppression différée impossible :", err),
        );
        return;
      }
      if (geste.done !== undefined) void basculerTacheDistante(id, geste.done);
      if (geste.titre || geste.niveau) {
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id,
            ...(geste.titre ? { titre: geste.titre } : {}),
            ...(geste.niveau ? { niveau: geste.niveau } : {}),
          }),
        }).catch((err) => console.error("[taches] rattrapage impossible :", err));
      }
      if (geste.ordre) {
        // Le rangement voulu pendant l'attente : les provisoires devenus réels
        // sont traduits, les autres écartés.
        const ordre = geste.ordre
          .map((x) => tmpVersReel.current.get(x) ?? x)
          .filter((x) => !estProvisoire(x));
        if (ordre.length > 0) {
          void fetch("/api/tasks", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ordre }),
          }).catch((err) => console.error("[taches] ordre différé impossible :", err));
        }
      }
    },
    [],
  );

  /** Note un geste porté sur une tâche pas encore confirmée. */
  const noterGesteProvisoire = useCallback(
    (id: string, geste: GesteProvisoire) => {
      // Confirmée entre-temps : plus rien à mettre de côté, on l'envoie.
      const reel = tmpVersReel.current.get(id);
      if (reel) {
        appliquerGesteDistant(reel, geste);
        return;
      }
      const actuels = gestesAvantConfirmation.current.get(id) ?? {};
      gestesAvantConfirmation.current.set(id, { ...actuels, ...geste });
    },
    [appliquerGesteDistant],
  );

  // Le jour local, figé au montage : sert de clé pour la base comme pour le
  // cache navigateur. Les deux doivent parler du même jour.
  const jourRef = useRef<string>("");

  /**
   * Barrière d'hydratation. Les effets de persistance ne doivent pas écrire
   * tant que la lecture initiale n'a pas eu lieu — sinon le premier rendu
   * écraserait le stockage avec les valeurs par défaut. Même logique que le
   * `dirtyRef` de la spec Partie 10, bug 4.
   */
  const hydrated = useRef(false);

  /**
   * Le même drapeau, mais en état.
   *
   * La ref ne suffisait pas : React exécute tous les effets de montage dans
   * la même passe, donc les effets de persistance déclarés plus bas
   * s'exécutaient juste après celui de lecture — avec les valeurs du premier
   * rendu (journal vide, habitudes vides) et `hydrated.current` déjà à vrai.
   * Ils écrivaient donc du vide. Un état force un nouveau rendu, ce qui les
   * décale après l'application des données lues.
   */
  const [hydrate, setHydrate] = useState(false);

  /**
   * Ce que Twaylo a réellement modifié depuis le chargement.
   *
   * Sans ça, le simple montage renvoyait le journal local en base. Or une
   * capture vocale Telegram AJOUTE du texte à `daily_logs.journal_texte` côté
   * serveur, et le navigateur l'ignore : le renvoi écrasait donc la phrase
   * dictée sur le terrain. On n'écrit plus un champ tant qu'il n'a pas été
   * touché ici.
   */
  const modifie = useRef({
    faites: false,
    journal: false,
    uneChose: false,
    repas: false,
    journee: false,
  });

  /** Relit tout le stockage local et remplit l'état. */
  const hydrateFromStorage = useCallback(() => {
    setCaptures(readJSON<Capture[]>(KEYS.captures, REAL_DATA.captures));
    // La dernière liste connue, repeinte immédiatement : ce sont de VRAIES
    // tâches, contrairement au jeu d'exemple d'avant. La base les corrige dès
    // qu'elle répond, et `tachesPretes` empêche d'en tirer un instantané.
    setTasks(readJSON<Task[]>(KEYS.tachesCache, []));
    // Clé datée : au changement de jour local, la clé n'existe pas encore et
    // les habitudes repartent vierges. Aucun code de remise à zéro.
    setHabits(readJSON<Habit[]>("twaylo-habitudes-def", []));
    setFaitesDuJour(readJSON<FaitesDuJour>(dailyKey("habits"), {}));
    setJournalText(readJSON<string>(dailyKey("journal"), ""));
    setUneChose(readJSON<UneChose>(dailyKey("unechose"), { texte: "", fait: false }));
    setRepas(readJSON<Repas[]>(dailyKey("nutrition"), []));
    setBlocsFaits(readJSON<string[]>(dailyKey("journee"), []));
    setTodoCloturee(readJSON<string>("twaylo-todo-cloturee", ""));
  }, []);

  /**
   * Repeint le tableau de bord depuis le dernier état connu de la base.
   *
   * Sans ça, chaque carte attendait sa propre réponse serveur : elles se
   * remplissaient l'une après l'autre, changeaient de hauteur, et la grille se
   * réorganisait à chaque fois — les cartes « sautaient » pendant deux ou trois
   * secondes. Ici tout arrive d'un bloc, avant la première peinture.
   *
   * Deux régimes, parce que toutes les données n'ont pas le même rapport au
   * temps. Le pipeline, les contacts, les deals ou la définition des habitudes
   * ne dépendent pas du jour : on les repeint toujours. Les habitudes cochées,
   * les repas, la chose du jour et la série décrivent UNE journée : les
   * ressortir un nouveau matin afficherait la veille comme si c'était
   * aujourd'hui, ce qui serait pire qu'une carte vide.
   */
  const appliquerCache = useCallback(() => {
    const cache = readJSON<{
      jour: string;
      etat: Awaited<ReturnType<typeof chargerEtat>>;
    } | null>(KEYS.etatCache, null);
    const d = cache?.etat;
    if (!d) return;

    // Hors du temps : valable quel que soit le jour.
    if (d.habitudes) setHabits(d.habitudes as Habit[]);
    if (Array.isArray(d.blocages)) setBlocagesBruts(d.blocages);
    if (d.pipeline) setPipeline(d.pipeline as PipelineColumn[]);
    if (d.contacts) setContacts(d.contacts as (Contact & { id: string })[]);
    if (d.deals) setDeals(d.deals as DealVue[]);
    if (d.dealStats) setDealStats(d.dealStats);

    // Propre à la journée : seulement si le cache parle bien d'aujourd'hui.
    if (cache?.jour !== localDateKey()) return;
    if (d.faites) setFaitesDuJour(d.faites as FaitesDuJour);
    if (typeof d.serie === "number") setSerie(d.serie);
    if (d.uneChose) setUneChose(d.uneChose);
    if (d.nutrition?.repas) setRepas(d.nutrition.repas as Repas[]);
  }, []);

  /**
   * Les deux cartes que le cache d'état ne couvrait pas.
   *
   * Elles ont leur propre route, donc elles échappaient à `KEYS.etatCache` :
   * la journée type affichait « Lecture de ta journée… » et les objectifs une
   * liste vide — pendant que tout le reste du tableau de bord était déjà
   * peint. Le temps d'attente n'était pas une seconde de réseau mais le
   * réveil d'une fonction serverless, plusieurs secondes au premier
   * chargement de la journée.
   *
   * Ni l'une ni l'autre n'est datée : ce sont des modèles et des objectifs,
   * pas des coches. Les coches du jour, elles, restent hors cache — les
   * ressortir un nouveau matin serait pire que de les attendre.
   */
  const appliquerCacheAnnexes = useCallback(() => {
    const journees = readJSON<JourneesConfig | null>(KEYS.journeesCache, null);
    if (journees?.liste?.length) setJournees(bornerJournees(journees));
    const objectifs = readJSON<ObjectifVue[] | null>(KEYS.objectifsCache, null);
    if (Array.isArray(objectifs)) setObjectifs(objectifs);
  }, []);

  /*
   * Lecture initiale, une seule fois — AVANT le premier affichage.
   *
   * `useLayoutEffect` et non `useEffect` : le second s'exécute une fois la page
   * peinte, si bien que l'écran s'affichait d'abord vide (tâches, habitudes,
   * nutrition, série à zéro) avant d'être repeint avec la mémoire du
   * navigateur. Ce clignotement au démarrage n'était pas un chargement : les
   * données étaient déjà là, on les lisait juste trop tard. Ici la lecture est
   * faite avant le premier rendu visible.
   *
   * Lire le stockage local est instantané : rien qui mérite d'attendre.
   */
  useEffetAvantPeinture(() => {
    pruneOldDailyKeys("habits");
    pruneOldDailyKeys("journal");
    pruneOldDailyKeys("unechose");
    pruneOldDailyKeys("nutrition");
    pruneOldDailyKeys("journee");

    // L'ambiance et les onglets se repeignent AVANT la première image, même
    // en démo : filmer l'OS doit montrer l'OS tel que Twaylo l'a réglé.
    setCustom(bornerCustom(readJSON<CustomConfig>("twaylo-custom", CUSTOM_DEFAUT)));

    if (readJSON<string>(KEYS.demo, "0") === "1") {
      // En démo on n'ouvre jamais le stockage réel.
      setDemoMode(true);
      setCaptures(DEMO_DATA.captures);
      setTasks(DEMO_DATA.tasks);
    } else {
      hydrateFromStorage();
      // Après l'hydratation locale : le cache d'état ne touche pas aux tâches,
      // que `hydrateFromStorage` vient de repeindre depuis un cache plus frais
      // (il suit les modifications faites depuis la dernière lecture).
      appliquerCache();
      appliquerCacheAnnexes();
    }

    hydrated.current = true;
    setHydrate(true);
  }, [hydrateFromStorage, appliquerCache, appliquerCacheAnnexes]);

  useEffect(() => surChangementSync(setSync), []);

  /*
   * Les réglages de personnalisation, depuis la base — pour retrouver SON
   * OS sur un autre appareil. La copie navigateur a déjà repeint l'écran ;
   * la base ne corrige que si rien n'a été touché entre-temps.
   */
  useEffect(() => {
    if (demoMode) return;
    let annule = false;
    void fetch("/api/custom")
      .then((r) => r.json())
      .then((d: { custom?: Partial<CustomConfig> }) => {
        if (annule || customTouche.current || !d?.custom) return;
        const propre = bornerCustom(d.custom);
        setCustom(propre);
        writeJSON("twaylo-custom", propre);
      })
      .catch((err) => console.error("[custom] chargement impossible :", err));
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /*
   * L'ambiance s'applique en variables CSS sur la racine : le dégradé
   * signature et les halos du fond suivent, partout, sans qu'aucun composant
   * n'ait à connaître le réglage.
   */
  useEffect(() => {
    const amb = AMBIANCES[custom.ambiance] ?? AMBIANCES.signature;
    const racine = document.documentElement.style;
    racine.setProperty("--grad", amb.grad);
    amb.halos.forEach((h, i) => racine.setProperty(`--halo-${i + 1}`, h));
  }, [custom.ambiance]);

  const ongletsVisibles = useMemo<Tab[]>(() => {
    const caches = new Set(custom.ongletsCaches);
    return ordonnerOnglets(TABS, custom.ordreOnglets).filter(
      (t) => t === "Accueil" || !caches.has(t),
    );
  }, [custom.ongletsCaches, custom.ordreOnglets]);

  // Masquer l'onglet où l'on se trouve ne doit pas laisser un écran orphelin.
  useEffect(() => {
    if (!ongletsVisibles.includes(activeTab)) setActiveTab("Accueil");
  }, [ongletsVisibles, activeTab]);

  const majCustom = useCallback((patch: Partial<CustomConfig>) => {
    customTouche.current = true;
    // Calculé ICI et non dans l'updater : la requête partirait deux fois en
    // mode strict (même règle que toggleTask).
    const suivant = bornerCustom({ ...customRef.current, ...patch });
    setCustom(suivant);
    writeJSON("twaylo-custom", suivant);
    if (demoModeRef.current) return;
    void fetch("/api/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(suivant),
    }).catch((err) => console.error("[custom] enregistrement impossible :", err));
  }, []);

  /*
   * Les journées types, partagées entre la carte d'accueil, la carte Tâches
   * clés et l'onglet dédié : un seul état, sinon cocher ici n'apparaît pas là.
   * Les coches du serveur ne s'appliquent que si rien n'a été touché — même
   * garde que le journal face au bot Telegram.
   */
  useEffect(() => {
    if (demoMode) {
      setJournees(JOURNEES_DEFAUT);
      return;
    }
    let annule = false;
    void fetch(`/api/journees?jour=${localDateKey()}`)
      .then((r) => r.json())
      .then((d: { connecte?: boolean; journees?: JourneesConfig; faits?: string[] }) => {
        if (annule) return;
        // Les modèles arrivent même sans base — ce sont ceux d'usine, et sans
        // eux l'écran resterait bloqué sur « Lecture de tes journées types… ».
        if (d.journees) {
          setJournees(d.journees);
          // Pour repeindre la carte instantanément au prochain démarrage.
          if (d.connecte !== false) writeJSON(KEYS.journeesCache, d.journees);
        }
        /*
         * Une liste vide s'applique comme les autres — mais seulement si elle
         * vient vraiment de la base.
         *
         * Écarter le cas vide gardait les coches locales périmées : décocher
         * un bloc sur le téléphone laissait le portable le ressusciter au
         * chargement suivant — et la coche zombie repartait en base. Le
         * drapeau `modifie` suffit à protéger un geste en cours. En revanche,
         * base injoignable, la réponse est un gabarit sans coches : l'appliquer
         * effacerait la journée.
         */
        if (d.connecte !== false && Array.isArray(d.faits) && !modifie.current.journee) {
          setBlocsFaits(d.faits);
        }
      })
      .catch((err) => console.error("[journees] chargement impossible :", err));
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /*
   * Les coches passent par `synchroniserJour`, comme les habitudes et le
   * journal — surtout pas par une requête à part.
   *
   * Un bloc lié à une habitude change les deux d'un seul geste. Deux requêtes
   * concurrentes, c'était deux lire-fusionner-écrire sur la même ligne du
   * jour, et l'une des deux coches se perdait. Ici les changements sont
   * regroupés en une seule écriture.
   */
  useEffect(() => {
    if (!hydrate || demoMode || !modifie.current.journee) return;
    writeJSON(dailyKey("journee"), blocsFaits);
    synchroniserJour({ jour: localDateKey(), journeeFaits: blocsFaits });
  }, [blocsFaits, demoMode, hydrate]);

  const basculerBlocFait = useCallback((blocId: string) => {
    modifie.current.journee = true;
    const fait = !blocsFaitsRef.current.includes(blocId);
    setBlocsFaits((prev) =>
      fait ? [...prev.filter((b) => b !== blocId), blocId] : prev.filter((b) => b !== blocId),
    );

    /*
     * L'habitude liée suit — faire son sport du matin ne se note qu'UNE fois.
     * En « poser/retirer », jamais en bascule aveugle : si l'habitude était
     * déjà cochée à la main, cocher le bloc ne doit pas l'éteindre.
     */
    const cfg = journeesRef.current;
    const active = cfg?.liste.find((j) => j.id === cfg.active) ?? cfg?.liste[0];
    const bloc = active?.blocs.find((b) => b.id === blocId);
    if (!bloc?.habitude) return;
    const marque = bloc.habitudeOption || "fait";
    modifie.current.faites = true;
    setFaitesDuJour((prev) => {
      const actuelles = prev[bloc.habitude] ?? [];
      const suivantes = fait
        ? actuelles.includes(marque)
          ? actuelles
          : [...actuelles, marque]
        : actuelles.filter((o) => o !== marque);
      return { ...prev, [bloc.habitude]: suivantes };
    });
  }, []);

  /**
   * Les coches d'un bloc supprimé s'en vont avec lui.
   *
   * Les coches du jour ne sont qu'une liste d'identifiants, sans lien avec
   * les modèles. Un bloc retiré laissait donc sa coche derrière lui : elle
   * comptait encore dans l'XP et dans le « 4/7 » de la carte, pour un bloc
   * que plus rien n'affiche. Le ménage se fait ici, à la racine — il couvre
   * toutes les façons de supprimer un bloc, y compris depuis le Brain.
   */
  useEffect(() => {
    if (!hydrate || demoMode || !journees) return;
    const vivants = new Set(journees.liste.flatMap((j) => j.blocs.map((b) => b.id)));
    setBlocsFaits((prev) => {
      const restants = prev.filter((id) => vivants.has(id));
      if (restants.length === prev.length) return prev;
      modifie.current.journee = true;
      return restants;
    });
    // `blocsFaits` participe : les coches peuvent arriver du serveur APRÈS les
    // modèles. Sans lui, un identifiant mort survivrait jusqu'à la prochaine
    // modification de la journée type. L'updater rend la main sans rien
    // changer quand il n'y a rien à retirer — aucune boucle possible.
  }, [journees, blocsFaits, hydrate, demoMode]);

  /** Écrit les modèles : écran tout de suite, base derrière (débouncée). */
  const majJournees = useCallback((config: JourneesConfig) => {
    setJournees(config);
    if (demoModeRef.current) return;
    if (journeesMinuteur.current) clearTimeout(journeesMinuteur.current);
    journeesEnAttente.current = config;
    journeesMinuteur.current = setTimeout(() => {
      journeesMinuteur.current = null;
      journeesEnAttente.current = null;
      void fetch("/api/journees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      }).catch((err) => console.error("[journees] enregistrement impossible :", err));
    }, 600);
  }, []);

  /*
   * Une modification tapée juste avant de fermer l'onglet ne doit pas mourir
   * dans le débounce — 600 ms suffisent à perdre un bloc réécrit. Même
   * traitement que le reste de la journée (voir `viderSync`) : `sendBeacon`
   * survit à la fermeture, contrairement à un `fetch` que le navigateur annule.
   */
  useEffect(() => {
    const vider = () => {
      const enAttente = journeesEnAttente.current;
      if (!enAttente) return;
      if (journeesMinuteur.current) clearTimeout(journeesMinuteur.current);
      journeesMinuteur.current = null;
      journeesEnAttente.current = null;
      try {
        navigator.sendBeacon(
          "/api/journees",
          new Blob([JSON.stringify(enAttente)], { type: "application/json" }),
        );
      } catch (err) {
        console.error("[journees] envoi de dernière minute impossible :", err);
      }
    };
    // `pagehide` seul ne couvre pas le téléphone : passer l'app en arrière-plan
    // ne le déclenche pas toujours, alors que `visibilitychange` oui.
    const surVisibilite = () => {
      if (document.visibilityState === "hidden") vider();
    };
    window.addEventListener("pagehide", vider);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.removeEventListener("pagehide", vider);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  /*
   * Le passage de minuit.
   *
   * Un onglet resté ouvert toute la nuit continuait d'écrire dans la journée
   * de la veille, tandis que la clé locale, recalculée à chaque appel, pointait
   * déjà sur le lendemain. Résultat : le journal et les habitudes d'hier se
   * recopiaient sur aujourd'hui, et la journée démarrait déjà « remplie » —
   * ce qui faussait aussi la série.
   *
   * On surveille donc le changement de date et on repart à zéro. Un minuteur
   * seul ne suffit pas : un onglet mis en veille sur téléphone est gelé et son
   * minuteur ne se déclenche jamais — d'où la vérification au retour de
   * visibilité.
   */
  useEffect(() => {
    if (demoMode) return;

    const verifier = () => {
      const maintenant = localDateKey();
      if (maintenant === jourRef.current) return;

      jourRef.current = maintenant;
      setJourCourant(maintenant);
      // Rien n'a encore été touché aujourd'hui : sans cette remise à zéro,
      // les drapeaux « modifié » d'hier autoriseraient une écriture immédiate.
      modifie.current = {
        faites: false,
        journal: false,
        uneChose: false,
        repas: false,
        journee: false,
      };
      setFaitesDuJour({});
      setJournalText("");
      setUneChose({ texte: "", fait: false });
      setRepas([]);
      // Les modèles de journée restent ; seules les coches repartent vierges —
      // c'est ce qui fait des blocs des habitudes, pas des tâches jetables.
      setBlocsFaits([]);
      pruneOldDailyKeys("habits");
      pruneOldDailyKeys("journal");
      pruneOldDailyKeys("unechose");
      pruneOldDailyKeys("nutrition");
      pruneOldDailyKeys("journee");
    };

    const minuteur = setInterval(verifier, 30_000);
    document.addEventListener("visibilitychange", verifier);
    return () => {
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", verifier);
    };
  }, [demoMode]);

  /*
   * L'agenda est chargé à part, et son échec est sans conséquence : la carte
   * Semaine se contente d'afficher qu'elle n'est pas connectée. Un agenda
   * injoignable ne doit pas empêcher de cocher ses habitudes.
   */
  useEffect(() => {
    if (demoMode) return;
    let annule = false;
    void fetch("/api/objectifs")
      .then((r) => r.json())
      .then((d: { objectifs?: ObjectifVue[] }) => {
        if (annule || !Array.isArray(d.objectifs)) return;
        setObjectifs(d.objectifs);
        writeJSON(KEYS.objectifsCache, d.objectifs);
      })
      .catch((err) => console.error("[objectifs] chargement impossible :", err));
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /*
   * Les stats YouTube, chargées à part comme l'agenda : leur lecture fait
   * quatre appels à Google et peut prendre quelques secondes. Rien ici ne
   * doit retarder l'affichage du reste du dashboard.
   */
  useEffect(() => {
    if (demoMode) return;
    let annule = false;
    void fetch("/api/youtube/stats")
      .then((r) => r.json())
      .then((d: YoutubeStats) => {
        if (!annule) setYoutube(d);
      })
      .catch((err) => console.error("[youtube] chargement impossible :", err));
    return () => {
      annule = true;
    };
  }, [demoMode]);

  useEffect(() => {
    if (demoMode) return;
    let annule = false;
    void fetch("/api/agenda")
      .then((r) => r.json())
      .then((d: { connecte?: boolean; evenements?: EvenementAgenda[] }) => {
        if (annule) return;
        setAgendaConnecte(Boolean(d.connecte));
        setAgenda(d.evenements ?? []);
      })
      .catch((err) => console.error("[agenda] chargement impossible :", err));
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /*
   * Chargement depuis la base, APRÈS l'hydratation locale.
   *
   * L'ordre compte : le cache local peint l'écran immédiatement, la base
   * corrige ensuite. L'inverse ferait attendre le réseau avant d'afficher
   * quoi que ce soit.
   *
   * Le mode démo ne charge jamais rien : il ne doit pas toucher aux vraies
   * données, ni en lecture ni en écriture.
   */
  useEffect(() => {
    if (demoMode) return;
    const jour = localDateKey();
    jourRef.current = jour;
    setJourCourant(jour);

    let annule = false;
    void chargerEtat(jour).then((distant) => {
      if (annule) return;
      /*
       * La tentative de lecture est finie, quel qu'en soit le résultat.
       *
       * Le drapeau est posé AVANT le test de connexion : hors ligne ou base non
       * configurée, la liste est légitimement vide et l'écran doit le dire,
       * plutôt que d'afficher « lecture en cours » pour toujours.
       */
      setTachesPretes(true);
      if (!distant?.connecte) return;

      // Tout l'état est mémorisé, pour repeindre le tableau de bord entier au
      // prochain démarrage plutôt que carte après carte.
      writeJSON(KEYS.etatCache, { jour, etat: distant });

      /*
       * Même garde que les habitudes et les blocages, et pour la même raison :
       * cette réponse a été calculée AVANT une tâche ajoutée pendant le
       * chargement. L'appliquer telle quelle faisait disparaître de l'écran ET
       * du cache ce que Twaylo venait de taper — la substitution de l'identifiant
       * provisoire ne retrouvait plus sa ligne, et la tâche restait invisible
       * jusqu'au rechargement suivant. Il la retapait, et se retrouvait avec un
       * doublon en base.
       */
      if (distant.taches && !touchePendantChargement.current.taches) {
        setTasks(distant.taches);
        // De quoi repeindre l'écran instantanément au prochain démarrage,
        // pendant que la fonction serveur sort de veille.
        writeJSON(KEYS.tachesCache, distant.taches);
      }
      if (distant.habitudes && !touchePendantChargement.current.habitudes) {
        setHabits(distant.habitudes as Habit[]);
        writeJSON("twaylo-habitudes-def", distant.habitudes);
      }
      if (distant.faites) setFaitesDuJour(distant.faites as FaitesDuJour);
      if (typeof distant.serie === "number") setSerie(distant.serie);
      if (Array.isArray(distant.blocages) && !touchePendantChargement.current.blocages) {
        setBlocagesBruts(distant.blocages);
      }
      if (distant.uneChose) setUneChose(distant.uneChose);
      if (distant.nutrition?.repas) setRepas(distant.nutrition.repas as Repas[]);
      if (distant.pipeline) setPipeline(distant.pipeline as PipelineColumn[]);
      if (distant.contacts) setContacts(distant.contacts as (Contact & { id: string })[]);
      if (distant.deals) setDeals(distant.deals as DealVue[]);
      if (distant.dealStats) setDealStats(distant.dealStats);
      if (distant.captures) {
        /*
         * Fusionner, pas remplacer.
         *
         * Une capture prise hors-ligne vit uniquement en local : le POST a
         * échoué, elle n'est donc pas dans la liste distante. La remplacer
         * purement la faisait disparaître de l'écran, puis l'effet de
         * persistance écrivait la liste amputée par-dessus le cache — perdue
         * pour de bon. On garde en tête les captures locales que le serveur
         * n'a jamais reçues.
         */
        const distantes = distant.captures.map((c) => ({
          text: c.text,
          type: c.type as Capture["type"],
        }));
        setCaptures((local) => {
          const connues = new Set(distantes.map((c) => c.text));
          const orphelines = local.filter((c) => !connues.has(c.text));
          return [...orphelines, ...distantes].slice(0, 4);
        });
      }
      // Le journal distant ne remplace le local que si le local est vide :
      // sinon une frappe en cours au moment de la réponse serait écrasée
      // (spec Partie 10, bug 4).
      if (distant.journal) {
        setJournalText((local) => (local.trim() ? local : distant.journal ?? ""));
      }
    })
      // Panne réseau franche : on lève quand même le drapeau, sinon la carte
      // resterait bloquée sur « lecture des tâches » indéfiniment.
      .catch((err) => {
        console.error("[état] lecture impossible :", err);
        if (!annule) setTachesPretes(true);
      });

    return () => {
      annule = true;
    };
  }, [demoMode]);

  /*
   * Persistance. Le garde `demoMode` est ce qui isole la démo : cocher une
   * habitude en mode démo pour une vidéo ne doit jamais toucher les vraies
   * données de Twaylo (spec annexe A17).
   */
  useEffect(() => {
    if (!hydrate || demoMode) return;
    writeJSON(KEYS.captures, captures);
  }, [captures, demoMode, hydrate]);

  /*
   * Les tâches cochées sont mémorisées par identifiant, plus par libellé.
   *
   * Le commentaire d'origine justifiait le libellé par « réordonner ne doit
   * pas décaler les coches » — juste, mais le libellé est modifiable depuis
   * qu'on peut renommer une tâche. Renommer une tâche cochée la faisait donc
   * réapparaître décochée au chargement suivant, et deux tâches de même nom
   * partageaient leur état. L'identifiant règle les deux.
   */
  useEffect(() => {
    if (!hydrate || demoMode) return;
    writeJSON(
      KEYS.tasks,
      tasks
        .filter((t) => t.done)
        .map((t) => (t as { id?: string }).id ?? t.text),
    );
    // Le cache d'affichage suit les modifications locales, sinon il resterait
    // figé à la dernière lecture et repeindrait une liste périmée au démarrage
    // suivant. On attend que la base ait répondu pour ne pas mémoriser un état
    // d'attente, et on écarte les tâches non encore confirmées.
    if (!tachesPretes) return;
    writeJSON(
      KEYS.tachesCache,
      tasks.filter((t) => !((t as { id?: string }).id ?? "").startsWith("tmp-")),
    );
  }, [tasks, demoMode, hydrate, tachesPretes]);

  /*
   * Le jour est relu à chaque écriture, jamais figé au montage.
   *
   * `jourRef` était posé une fois pour toutes, alors que `dailyKey` recalcule
   * la date à chaque appel : dans un onglet resté ouvert après minuit, la clé
   * locale et la ligne en base ne parlaient plus du même jour, et le journal
   * de la veille était recopié sur la journée du lendemain.
   */
  useEffect(() => {
    if (!hydrate || demoMode || !modifie.current.faites) return;
    writeJSON(dailyKey("habits"), faitesDuJour);
    synchroniserJour({ jour: localDateKey(), faites: faitesDuJour });
  }, [faitesDuJour, demoMode, hydrate]);

  useEffect(() => {
    if (!hydrate || demoMode || !modifie.current.journal) return;
    writeJSONDebounced(dailyKey("journal"), journalText);
    synchroniserJour({ jour: localDateKey(), journal: journalText });
  }, [journalText, demoMode, hydrate]);

  /*
   * Rattrape les ajouts au journal faits ailleurs — le bot Telegram, surtout.
   *
   * L'écran écrivait le journal en écrasant tout, le bot y ajoute à la suite :
   * une note dictée à Telegram pouvait donc être perdue au prochain
   * enregistrement de l'écran. Au retour sur l'OS (focus ou onglet redevenu
   * visible), on relit le journal du jour et on adopte ce que le serveur a EN
   * PLUS — c'est-à-dire ce que le bot a ajouté à la suite — sans écraser une
   * saisie locale en cours.
   */
  useEffect(() => {
    if (!hydrate || demoMode) return;
    const rafraichir = () => {
      if (document.visibilityState === "hidden") return;
      // Dès que Twaylo a touché à son journal, sa version fait foi : on ne
      // rattrape plus rien du serveur, sinon effacer une ligne la ferait
      // réapparaître (le serveur « prolonge » alors le local).
      if (modifie.current.journal) return;
      void fetch(`/api/journal?jour=${localDateKey()}&combien=1`)
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.aujourdhui !== "string") return;
          // Re-vérifié APRÈS la requête : si Twaylo a commencé à taper entre
          // l'envoi et la réponse, sa saisie l'emporte, on ne l'écrase pas.
          if (modifie.current.journal) return;
          // Sinon, la base fait foi — on affiche exactement ce qui y est
          // enregistré (y compris les ajouts du bot Telegram), sans se fier au
          // cache local qui peut être périmé.
          setJournalText(d.aujourdhui);
        })
        .catch(() => {});
    };
    rafraichir();
    window.addEventListener("focus", rafraichir);
    document.addEventListener("visibilitychange", rafraichir);
    return () => {
      window.removeEventListener("focus", rafraichir);
      document.removeEventListener("visibilitychange", rafraichir);
    };
  }, [hydrate, demoMode]);

  useEffect(() => {
    if (!hydrate || demoMode || !modifie.current.uneChose) return;
    writeJSONDebounced(dailyKey("unechose"), uneChose);
    synchroniserJour({ jour: localDateKey(), uneChose });
  }, [uneChose, demoMode, hydrate]);

  useEffect(() => {
    if (!hydrate || demoMode || !modifie.current.repas) return;
    writeJSON(dailyKey("nutrition"), repas);
    synchroniserJour({ jour: localDateKey(), nutrition: { repas } });
  }, [repas, demoMode, hydrate]);

  /*
   * Instantané des tâches du jour, pour le bilan dans le temps.
   *
   * Les tâches vivent dans leur propre table, remise à neuf chaque matin. Sans
   * cet instantané écrit jour par jour dans daily_logs, l'historique de
   * complétion serait effacé à chaque réinitialisation. On fige donc l'état
   * courant — combien de tâches, combien de faites, et le focus principal à
   * part — dès qu'il change. Le débounce d'une seconde évite d'écrire à chaque
   * coche.
   *
   * Pas de garde « modifié » ici, contrairement au journal : réécrire le même
   * instantané est sans conséquence, et on veut que la journée en cours soit
   * toujours reflétée, même après un simple chargement.
   */
  useEffect(() => {
    if (!hydrate || demoMode) return;
    // Tant que la base n'a pas répondu, la liste affichée n'est qu'un état
    // d'attente : l'écrire figerait un instantané vide (ou, avant, les tâches
    // d'exemple) par-dessus la vraie journée dans l'historique.
    if (!tachesPretes) return;
    // Journée clôturée à la main : l'archive du jour est déjà figée. Réécrire
    // maintenant enverrait la liste vidée par-dessus et effacerait l'historique.
    // Le lendemain (nouvelle clé de jour), la garde tombe et le suivi reprend.
    const jour = localDateKey();
    if (todoCloturee === jour) return;
    /*
     * « Faite » ne veut pas dire « faite aujourd'hui ».
     *
     * Une tâche cochée reste dans la liste tant que la todo n'est pas
     * clôturée à la main. L'instantané la recomptait donc chaque jour comme
     * un accomplissement du jour : le calendrier du bilan marquait « bouclé »
     * des journées où rien n'avait été fait, et l'XP repartait gonflée tous
     * les matins. Seul ce qui a été coché CE jour-là entre dans l'archive.
     */
    const duJour = tasks.filter((t) => !t.done || t.faiteLe === jour);
    const principales = duJour.filter((t) => (t.niveau ?? "secondaire") === "principal");
    synchroniserJour({
      jour,
      taches: {
        total: duJour.length,
        faites: duJour.filter((t) => t.done).length,
        principalTotal: principales.length,
        principalFaites: principales.filter((t) => t.done).length,
        liste: duJour.map((t) => ({
          titre: t.text,
          niveau: t.niveau ?? "secondaire",
          fait: t.done,
        })),
      },
    });
  }, [tasks, demoMode, hydrate, todoCloturee, tachesPretes]);

  /*
   * Les setters exposés passent par ici plutôt que d'être transmis bruts.
   * C'est le seul endroit où l'on sait qu'une modification vient de Twaylo et
   * non du montage — et c'est cette distinction qui empêche d'écraser en base
   * un texte ajouté côté serveur (vocal Telegram) qu'on n'a jamais lu.
   */
  const marquerJournal = useCallback<Dispatch<SetStateAction<string>>>((v) => {
    modifie.current.journal = true;
    setJournalText(v);
  }, []);

  const marquerUneChose = useCallback<Dispatch<SetStateAction<UneChose>>>((v) => {
    modifie.current.uneChose = true;
    setUneChose(v);
  }, []);

  const marquerRepas = useCallback<Dispatch<SetStateAction<Repas[]>>>((v) => {
    modifie.current.repas = true;
    setRepas(v);
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoMode((on) => {
      const next = !on;
      writeJSON(KEYS.demo, next ? "1" : "0");

      if (next) {
        setCaptures(DEMO_DATA.captures);
        setTasks(DEMO_DATA.tasks);
        setJournalText("");
        setUneChose({ texte: "", fait: false });
        setRepas([]);
      } else {
        // Retour au réel : on relit le stockage, rien n'a été perdu pendant
        // la démo.
        hydrateFromStorage();
      }
      return next;
    });
  }, [hydrateFromStorage]);

  /**
   * Trie et range une capture. Le texte est passé en argument, il ne vit plus
   * ici.
   *
   * Il était dans l'état central : chaque caractère tapé dans la barre de
   * capture recréait la valeur du contexte, et donc réconciliait tout l'arbre
   * de l'accueil — treize cartes — pour un champ que personne d'autre ne lit.
   * Il est maintenant local à la barre, et ce rappel ne dépend plus de rien.
   */
  const addCapture = useCallback(async (saisie: string) => {
    const text = saisie.trim();
    if (!text) return;

    setCapturing(true);

    /*
     * Verdict local immédiat.
     *
     * Le même classifieur regex tourne ici, dans le navigateur, en une
     * fraction de milliseconde. Twaylo voit « Tâche » apparaître au moment
     * où il lâche la touche, pas 2 secondes plus tard quand Claude a
     * répondu. Le serveur affine ensuite en arrière-plan et corrige la
     * pastille si son verdict diffère — ce qui est rare, et invisible
     * quand ça ne diffère pas.
     */
    const local = classifyWithRegex(text);
    const optimiste: Capture = { text, type: local.type };
    setCaptures((prev) => [optimiste, ...prev].slice(0, 4));

    /*
     * En démo, on s'arrête là — comme partout ailleurs.
     *
     * La barre de capture reste affichée pendant un tournage, et ce garde
     * manquait : une phrase tapée pour la caméra partait en base, consommait
     * un appel au classifieur, et chassait une vraie capture de la carte
     * (seules les quatre dernières sont gardées).
     */
    if (demoModeRef.current) {
      setCapturing(false);
      return;
    }

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texte: text, source: "web" }),
      });
      if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`);

      const { classification, routedTo, routedId } = await res.json();

      /*
       * Une capture rangée quelque part quitte la boîte de réception.
       *
       * Les pastilles disent « en attente de tri ». Y laisser une capture
       * devenue tâche ou idée vidéo, c'est prétendre que personne ne s'en est
       * occupé alors qu'elle est déjà à sa place. Restent visibles les seules
       * qui n'ont pas de table dédiée : notes et dépenses.
       */
      setCaptures((prev) =>
        routedTo
          ? prev.filter((c) => c !== optimiste)
          : prev.map((c) => (c === optimiste ? { text, type: classification.type } : c)),
      );

      /*
       * Une capture qui devient une tâche apparaît DANS la liste, tout de
       * suite.
       *
       * Le serveur crée bien la tâche et la place en tête, mais l'écran ne
       * l'apprenait qu'au rechargement suivant : Twaylo dictait « appeler le
       * fixeur », ne voyait rien arriver dans ses tâches, et la retapait à la
       * main — d'où un doublon. On l'insère ici, au même endroit que le
       * serveur l'a rangée.
       */
      if (routedTo === "tasks" && typeof routedId === "string") {
        touchePendantChargement.current.taches = true;
        setTasks((prev) =>
          prev.some((t) => (t as { id?: string }).id === routedId)
            ? prev
            : [
                {
                  id: routedId,
                  text: classification.resume || text,
                  done: false,
                  niveau: niveauDepuisUrgence(classification.urgence),
                } as Task,
                ...prev,
              ],
        );
      }
    } catch (err) {
      // Jamais de catch vide (spec Partie 10, bug 3). La capture reste à
      // l'écran en « note » — le texte n'est jamais perdu.
      console.error("[capture] tri impossible :", err);
    } finally {
      setCapturing(false);
    }
  }, []);

  const toggleTask = useCallback((i: number) => {
    /*
     * L'appel réseau est fait ICI, pas dans l'updater.
     *
     * React invoque les updaters deux fois en mode strict pour débusquer les
     * effets de bord : la requête partait donc en double à chaque clic.
     * Inoffensif ici parce que la charge est idempotente, mais c'est
     * exactement le genre de détail qui devient un vrai bug le jour où on y
     * ajoute autre chose.
     */
    const cible = tasksRef.current[i] as (Task & { id?: string }) | undefined;
    if (!cible) return;
    const done = !cible.done;

    /*
     * La date de la coche suit la coche.
     *
     * La base l'écrit de son côté (`completed_at`), mais l'écran ne la
     * relira qu'au prochain chargement : sans cette pose immédiate, la tâche
     * qu'on vient de cocher ne comptait pas dans l'XP du jour avant un
     * rechargement.
     */
    const faiteLe = done ? localDateKey() : undefined;
    setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, done, faiteLe } : t)));

    // L'écran a déjà changé ; la base suit. Un échec réseau laisse la case
    // cochée à l'écran et remonte dans l'indicateur de synchro plutôt que
    // d'annuler le geste sous les doigts de Twaylo.
    if (!cible.id || demoModeRef.current) return;
    // Tâche encore provisoire : son identifiant `tmp-…` n'existe pas en base.
    // La coche est mise de côté et rejouée dès que le serveur répond.
    if (estProvisoire(cible.id)) {
      noterGesteProvisoire(cible.id, { done });
      return;
    }
    void basculerTacheDistante(cible.id, done);
  }, [noterGesteProvisoire]);

  /** Coche ou décoche une variante. Le clic sur une option déjà cochée l'enlève. */
  const cocherOption = useCallback((habitId: string, option: string) => {
    modifie.current.faites = true;
    setFaitesDuJour((prev) => {
      const actuelles = prev[habitId] ?? [];
      const suivantes = actuelles.includes(option)
        ? actuelles.filter((o) => o !== option)
        : [...actuelles, option];
      return { ...prev, [habitId]: suivantes };
    });
  }, []);

  /** Habitude sans variante : le marqueur « fait » suffit. */
  const basculerHabitude = useCallback((habitId: string) => {
    modifie.current.faites = true;
    setFaitesDuJour((prev) => ({
      ...prev,
      [habitId]: (prev[habitId] ?? []).length > 0 ? [] : ["fait"],
    }));
  }, []);

  /**
   * Saisie libre : « Course · Corps · 5 km, 10 km ».
   * Le séparateur « · » est celui que l'interface affiche déjà partout ; on
   * accepte aussi « | » pour qui n'a pas le caractère sous la main.
   */
  const ajouterHabitude = useCallback(
    async (saisie: string) => {
      const morceaux = saisie
        .split(/[·|]/)
        .map((m) => m.trim())
        .filter(Boolean);
      if (morceaux.length === 0 || demoModeRef.current) return;

      const [nom, categorie = "Divers", options = ""] = morceaux;
      const nouvelle: Habit = {
        id: `h${Date.now().toString(36)}`,
        nom,
        categorie,
        options: options
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      };

      /*
       * Updater fonctionnel plutôt que `[...habits, nouvelle]`.
       *
       * La liste capturée au rendu est périmée dès qu'on enchaîne deux ajouts
       * sans laisser React redessiner : la seconde requête partait construite
       * sur l'ancienne liste, et la première habitude disparaissait — du
       * navigateur ET de la base.
       */
      touchePendantChargement.current.habitudes = true;
      const suivantes = [...habitsRef.current, nouvelle];
      setHabits(suivantes);
      writeJSON("twaylo-habitudes-def", suivantes);

      try {
        const res = await fetch("/api/habitudes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ habitudes: suivantes }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("[habitudes] ajout impossible :", err);
      }
    },
    [],
  );

  const supprimerHabitude = useCallback((habitId: string) => {
    // Le garde démo passe AVANT toute écriture : supprimer une habitude pour
    // une prise de vue ne doit pas amputer la vraie liste en cache.
    if (demoModeRef.current) return;

    touchePendantChargement.current.habitudes = true;
    const suivantes = habitsRef.current.filter((h) => h.id !== habitId);
    setHabits(suivantes);
    writeJSON("twaylo-habitudes-def", suivantes);
    void fetch("/api/habitudes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habitudes: suivantes }),
    }).catch((err) => console.error("[habitudes] suppression impossible :", err));
  }, []);

  /** Bascule le floutage « privé » d'une habitude (ex. nudité), et persiste. */
  const basculerHabitudePrivee = useCallback((habitId: string) => {
    if (demoModeRef.current) return;
    touchePendantChargement.current.habitudes = true;
    const suivantes = habitsRef.current.map((h) =>
      h.id === habitId ? { ...h, prive: !h.prive } : h,
    );
    setHabits(suivantes);
    writeJSON("twaylo-habitudes-def", suivantes);
    void fetch("/api/habitudes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habitudes: suivantes }),
    }).catch((err) => console.error("[habitudes] floutage impossible :", err));
  }, []);

  const changerNiveauTache = useCallback(
    (id: string, niveau: Niveau) => {
      setTasks((prev) =>
        prev.map((t) => ((t as { id?: string }).id === id ? { ...t, niveau } : t)),
      );
      if (demoModeRef.current) return;
      // Pas encore confirmée : on garde le geste pour le rejouer.
      if (estProvisoire(id)) {
        noterGesteProvisoire(id, { niveau });
        return;
      }
      void fetch("/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, niveau }),
      }).catch((err) => console.error("[tasks] changement de niveau impossible :", err));
    },
    [noterGesteProvisoire],
  );

  const renommerTache = useCallback(
    (id: string, titre: string) => {
      const propre = titre.trim();
      if (!propre) return;
      setTasks((prev) =>
        prev.map((t) => ((t as { id?: string }).id === id ? { ...t, text: propre } : t)),
      );
      if (demoModeRef.current) return;
      if (estProvisoire(id)) {
        noterGesteProvisoire(id, { titre: propre });
        return;
      }
      void fetch("/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, titre: propre }),
      }).catch((err) => console.error("[tasks] renommage impossible :", err));
    },
    [noterGesteProvisoire],
  );

/**
   * Échange deux tâches de place, et enregistre l'ordre complet.
   *
   * On reçoit deux index plutôt qu'un index et un sens : la carte affiche les
   * tâches groupées par niveau, et « monter » doit échanger avec le voisin du
   * même niveau, qui n'est pas forcément la ligne précédente de la liste.
   *
   * Des flèches plutôt qu'un glisser-déposer : la liste est courte, et le
   * glisser-déposer HTML5 ne fonctionne pas au doigt — or Twaylo consulte son
   * OS sur le terrain, au téléphone.
   */
  const echangerTaches = useCallback((a: number, b: number) => {
    // Comme pour `toggleTask` : la requête part d'ici, jamais de l'updater,
    // que React invoque deux fois en mode strict.
    const actuelles = tasksRef.current;
    if (a < 0 || b < 0 || a >= actuelles.length || b >= actuelles.length || a === b) return;

    const suivantes = [...actuelles];
    [suivantes[a], suivantes[b]] = [suivantes[b], suivantes[a]];
    setTasks(suivantes);

    if (demoModeRef.current) return;
    const ordre = suivantes
      .map((t) => (t as { id?: string }).id)
      .filter((id): id is string => Boolean(id));
    void fetch("/api/tasks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ordre }),
    }).catch((err) => console.error("[tasks] réordonnancement impossible :", err));
  }, []);

  /**
   * Fin d'un glisser-déposer : on applique en une fois le nouvel ordre et, si la
   * tâche a changé de niveau en cours de route, son nouveau niveau.
   *
   * Tout se joue dans un seul `setTasks` pour éviter deux rendus qui se
   * marchent dessus, puis on persiste l'ordre et le niveau séparément — ce sont
   * deux colonnes distinctes en base. Une tâche sans identifiant (amorçage pas
   * encore confirmé par le serveur) n'est pas dans `ordreIds` : on la remet à la
   * fin plutôt que de la perdre.
   */
  const deposerTache = useCallback(
    (ordreIdsBruts: string[], changementBrut: { id: string; niveau: Niveau } | null) => {
      /*
       * Les identifiants sont traduits d'abord.
       *
       * Un glisser commencé avant la confirmation d'une tâche porte encore son
       * identifiant provisoire ; si le serveur a répondu entre-temps, la ligne
       * s'appelle déjà autrement et le dépôt ne la retrouvait plus — elle
       * tombait dans les « restantes » et sautait en fin de liste.
       */
      const ordreIds = ordreIdsBruts.map(resoudreId);
      const changementNiveau = changementBrut
        ? { ...changementBrut, id: resoudreId(changementBrut.id) }
        : null;

      setTasks((prev) => {
        const parId = new Map(prev.map((t) => [(t as { id?: string }).id, t]));
        const ordonnees = ordreIds
          .map((id) => parId.get(id))
          .filter((t): t is Task => Boolean(t))
          .map((t) =>
            changementNiveau && (t as { id?: string }).id === changementNiveau.id
              ? { ...t, niveau: changementNiveau.niveau }
              : t,
          );
        const restantes = prev.filter((t) => {
          const id = (t as { id?: string }).id;
          return !id || !ordreIds.includes(id);
        });
        return [...ordonnees, ...restantes];
      });

      if (demoModeRef.current) return;

      /*
       * Tâche encore non confirmée : le rangement ENTIER est mis de côté avec
       * le changement de niveau, et rejoué d'un bloc sur le vrai identifiant.
       * Envoyer l'ordre maintenant, amputé de la ligne déplacée, la renverrait
       * en tête au rechargement — soit exactement là d'où Twaylo l'a tirée.
       */
      if (changementNiveau && estProvisoire(changementNiveau.id)) {
        noterGesteProvisoire(changementNiveau.id, {
          niveau: changementNiveau.niveau,
          ordre: ordreIds,
        });
        return;
      }

      // Les `tmp-…` restants sont écartés du seul envoi : l'ordre affiché les
      // garde, sinon une tâche à peine tapée sauterait en bas de sa section.
      const ordreDistant = ordreIds.filter((id) => !estProvisoire(id));
      if (ordreDistant.length > 0) {
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ordre: ordreDistant }),
        }).catch((err) => console.error("[tasks] réordonnancement impossible :", err));
      }
      if (changementNiveau) {
        void fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(changementNiveau),
        }).catch((err) => console.error("[tasks] changement de niveau impossible :", err));
      }
    },
    [noterGesteProvisoire, resoudreId],
  );

  /** Ajout optimiste, même raison que pour les tâches : l'écran n'attend pas. */
  const ajouterObjectif = useCallback(
    async (libelle: string, portee: string): Promise<boolean> => {
    const propre = libelle.trim();
    if (!propre || demoModeRef.current) return false;

    const cleTemp = `tmp-${(compteurTemp.current += 1)}`;
    setObjectifs((prev) => [
      ...(prev ?? []),
      {
        id: cleTemp,
        objectif: propre,
        portee,
        statut: "en_cours",
        pct: 0,
        valeur: "",
        etapes: [],
      },
    ]);

    try {
      const res = await fetch("/api/objectifs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectif: propre, portee, cible: { pct: 0, valeur: "", etapes: [] } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { objectif } = await res.json();
      // Sans cette garde, une réponse sans champ `objectif` poussait
      // `undefined` dans la liste et la vue plantait au rendu suivant.
      if (!objectif?.id) throw new Error("réponse sans objectif");
      setObjectifs((prev) =>
        (prev ?? []).map((o) => (o.id === cleTemp ? objectif : o)),
      );
      return true;
    } catch (err) {
      console.error("[objectifs] ajout impossible :", err);
      setObjectifs((prev) => (prev ?? []).filter((o) => o.id !== cleTemp));
      return false;
    }
    },
    [],
  );

  /**
   * Mise à jour optimiste : la barre bouge sous le doigt, la base suit.
   * L'écriture porte la cible entière plutôt qu'un champ, parce que la
   * progression, le chiffre affiché et les étapes vivent dans la même colonne.
   */
  const majObjectifLocal = useCallback(
    (id: string, patch: Partial<Omit<ObjectifVue, "id">>) => {
      /*
       * L'état d'après se calcule ICI, avant l'updater — et non dedans.
       *
       * React n'exécute pas la fonction passée à `setObjectifs` sur-le-champ :
       * il la garde pour la prochaine passe de rendu. L'ancienne version y
       * affectait `apres`, puis testait `if (!apres) return` à la ligne
       * suivante — sur une variable encore vide. L'écriture en base ne partait
       * donc pas, et la modification disparaissait au rechargement. React
       * évalue souvent l'updater en avance par optimisation, ce qui masquait le
       * défaut la plupart du temps : il ne se manifestait que lorsqu'une autre
       * mise à jour était déjà en file (clics rapprochés), en silence.
       */
      const avant = (objectifsRef.current ?? []).find((o) => o.id === id);
      if (!avant) return;
      const apres = { ...avant, ...patch };
      setObjectifs((prev) => (prev ? prev.map((o) => (o.id === id ? apres : o)) : prev));

      // Objectif pas encore confirmé : l'écran garde la modification, mais on
      // n'envoie pas un identifiant provisoire que la base rejetterait.
      if (demoModeRef.current || estProvisoire(id)) return;
      const cible = { pct: apres.pct, valeur: apres.valeur, etapes: apres.etapes };
      /*
       * On réapplique ce que le serveur dit avoir écrit.
       *
       * Il tronque à douze étapes et coupe les textes trop longs. Ignorer sa
       * réponse laissait l'écran afficher treize étapes quand la base n'en
       * gardait que douze — divergence invisible jusqu'au rechargement, où la
       * treizième avait disparu.
       */
      void fetch("/api/objectifs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, objectif: apres.objectif, cible, statut: apres.statut }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.cible) return;
          setObjectifs((prev) =>
            prev ? prev.map((o) => (o.id === id ? { ...o, ...d.cible } : o)) : prev,
          );
        })
        .catch((err) => console.error("[objectifs] mise à jour impossible :", err));
    },
    [],
  );

  const supprimerObjectifLocal = useCallback((id: string) => {
    setObjectifs((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    if (demoModeRef.current || estProvisoire(id)) return;
    void fetch(`/api/objectifs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[objectifs] suppression impossible :", err),
    );
  }, []);

  /** Enregistre la liste entière : elle est courte, et l'API la revalide. */
  const enregistrerBlocages = useCallback((suivants: BlocageStocke[]) => {
    /*
     * Le garde démo passe AVANT de toucher à l'état, pas après.
     *
     * Placé plus bas, il empêchait bien la requête — mais la ligne inventée
     * pour la caméra entrait quand même dans la liste réelle. Elle repartait
     * alors en base au premier vrai geste, une fois la démo coupée.
     */
    if (demoModeRef.current) return;
    touchePendantChargement.current.blocages = true;
    setBlocagesBruts(suivants);
    void fetch("/api/blocages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocages: suivants }),
    }).catch((err) => console.error("[blocages] enregistrement impossible :", err));
  }, []);

  /** Saisie libre : « Devis fixeur jamais revenu · Agence ». */
  const ajouterBlocage = useCallback(
    async (saisie: string) => {
      const [texte, proprietaire = "Toi"] = saisie.split(/[·|]/).map((m) => m.trim());
      if (!texte) return;
      // Construit depuis l'état courant, pas depuis celui capturé au rendu :
      // deux ajouts rapprochés se perdaient l'un l'autre.
      enregistrerBlocages([
        ...blocagesRef.current,
        {
          id: `b${Date.now().toString(36)}`,
          texte,
          proprietaire,
          depuis: localDateKey(),
        },
      ]);
    },
    [enregistrerBlocages],
  );

  const leverBlocage = useCallback(
    (id: string) => {
      enregistrerBlocages(blocagesRef.current.filter((b) => b.id !== id));
    },
    [enregistrerBlocages],
  );

  /**
   * Le nombre de jours se calcule à l'affichage, jamais en base : un compteur
   * stocké resterait figé, alors que c'est son vieillissement qui alerte.
   * La chaleur en découle — au-delà de deux semaines, ça devient urgent.
   */
  const blocages = useMemo<Blocage[]>(() => {
    if (demoMode) return DEMO_DATA.blocages;
    // `jourRef` est remis à jour au passage de minuit, ce qui recalcule aussi
    // ce mémo : sans cette dépendance, « depuis 4 jours » restait figé dans un
    // onglet laissé ouvert plusieurs jours.
    const aujourdhui = Date.parse(`${jourCourant || localDateKey()}T00:00:00Z`);
    return blocagesBruts.map((b) => {
      const jours = Math.max(
        0,
        Math.round((aujourdhui - Date.parse(`${b.depuis}T00:00:00Z`)) / 86_400_000),
      );
      return {
        id: b.id,
        texte: b.texte,
        proprietaire: b.proprietaire,
        depuisJours: jours,
        chaleur: jours >= 14 ? "chaud" : jours >= 7 ? "tiede" : "froid",
      };
    });
  }, [blocagesBruts, demoMode, jourCourant]);

  /**
   * Déplacement optimiste : la carte bouge sous le doigt, la base suit.
   * Un échec réseau laisse la vidéo à sa nouvelle place et remonte dans
   * l'indicateur de synchro — annuler le geste serait plus déroutant que de
   * le laisser et signaler.
   */
  const deplacerVideo = useCallback((id: string, statut: string) => {
    setPipeline((prev) => {
      if (!prev) return prev;
      let video: PipelineColumn["videos"][number] | undefined;
      const sansVideo = prev.map((col) => {
        const trouvee = col.videos.find((v) => (v as { id?: string }).id === id);
        if (trouvee) video = trouvee;
        return { ...col, videos: col.videos.filter((v) => (v as { id?: string }).id !== id) };
      });
      if (!video) return prev;
      return sansVideo.map((col) =>
        col.status === statut ? { ...col, videos: [...col.videos, video!] } : col,
      );
    });

    if (demoModeRef.current) return;
    void fetch("/api/videos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, statut }),
    }).catch((err) => console.error("[pipeline] déplacement impossible :", err));
  }, []);

  const ajouterVideo = useCallback(
    async (
      titre: string,
      format: "short" | "long" = "long",
      statut = "idee",
    ): Promise<boolean> => {
      const propre = titre.trim();
      if (!propre || demoModeRef.current) return false;
      try {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ titre: propre, format, statut }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Même garde que pour les contacts : une réponse 200 sans `video`
        // aurait fait lire `video.statut` sur `undefined`, et le pipeline
        // aurait emporté l'écran avec lui.
        const { video } = await res.json();
        if (!video?.id) throw new Error("réponse sans vidéo");
        setPipeline((prev) =>
          prev
            ? prev.map((col) =>
                // La colonne renvoyée par le serveur fait foi : c'est celle
                // où Twaylo a tapé, pas « Idée » par défaut.
                col.status === video.statut
                  ? {
                      ...col,
                      videos: [
                        ...col.videos,
                        {
                          id: video.id,
                          title: video.titre,
                          format: video.format === "short" ? "Short" : "Long",
                        } as PipelineColumn["videos"][number],
                      ],
                    }
                  : col,
              )
            : prev,
        );
        return true;
      } catch (err) {
        // On renvoie l'échec pour que l'appelant garde le champ rempli : sans
        // ça, l'idée était effacée de la saisie avant même d'avoir abouti, et
        // disparaissait sans un mot en cas de coupure réseau.
        console.error("[pipeline] ajout impossible :", err);
        return false;
      }
    },
    [],
  );

  const renommerVideo = useCallback((id: string, titre: string) => {
    const propre = titre.trim();
    if (!propre) return;

    setPipeline((prev) =>
      prev
        ? prev.map((col) => ({
            ...col,
            videos: col.videos.map((v) =>
              (v as { id?: string }).id === id ? { ...v, title: propre } : v,
            ),
          }))
        : prev,
    );

    if (demoModeRef.current) return;
    void fetch("/api/videos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, titre: propre }),
    }).catch((err) => console.error("[pipeline] renommage impossible :", err));
  }, []);

  /**
   * Ajout optimiste : la tâche s'affiche tout de suite, la base suit.
   *
   * Elle n'apparaissait qu'une fois la réponse du serveur revenue — soit un
   * aller-retour navigateur → fonction Vercel → Supabase, qui dépasse la
   * seconde quand la fonction sort de veille. Twaylo tapait sa tâche, appuyait
   * sur Entrée, et regardait un champ vide en se demandant si ça avait marché.
   * Toutes les autres actions (cocher, renommer, supprimer) affichent d'abord
   * et enregistrent ensuite : l'ajout fait pareil désormais.
   *
   * La tâche provisoire porte un identifiant `tmp-…`, remplacé par le vrai dès
   * que le serveur répond. En cas d'échec elle est retirée, plutôt que de
   * laisser à l'écran une tâche que la base n'a jamais eue.
   */
  const ajouterTache = useCallback(async (titre: string, niveau: Niveau = "secondaire") => {
    const propre = titre.trim();
    if (!propre || demoModeRef.current) return;

    const cleTemp = `tmp-${(compteurTemp.current += 1)}`;
    const provisoire = { id: cleTemp, text: propre, done: false, niveau } as Task;
    // La liste distante encore en vol ne doit plus remplacer la nôtre : sa
    // photo a été prise avant cet ajout, et l'appliquer effacerait la tâche
    // de l'écran.
    touchePendantChargement.current.taches = true;
    // En TÊTE de pile : ce que Twaylo vient de taper est ce qu'il a en tête,
    // et une liste de vingt lignes le renverrait hors de vue. Le serveur fait
    // le même placement dans la liste d'ordre (voir `creerTache`), donc le
    // rechargement suivant le retrouve au même endroit.
    setTasks((prev) => [provisoire, ...prev]);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titre: propre, niveau }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { tache } = await res.json();
      if (!tache) throw new Error("réponse sans tâche");

      /*
       * Rejouer ce qui a été fait pendant l'attente, sur le vrai identifiant.
       *
       * Sans ça, la tâche du serveur — cochée à faux, avec son titre
       * d'origine — remplaçait purement la ligne à l'écran : la coche posée
       * une seconde plus tôt disparaissait sous les doigts de Twaylo, et une
       * suppression laissait une ligne fantôme dans la base.
       */
      const gestes = gestesAvantConfirmation.current.get(cleTemp);
      gestesAvantConfirmation.current.delete(cleTemp);

      /*
       * La correspondance est posée AVANT d'appliquer quoi que ce soit : un
       * geste qui arrive dans la milliseconde suivante porte encore l'ancien
       * identifiant, et doit pouvoir être traduit plutôt que rangé dans une
       * case que plus personne ne relit. Bornée, pour ne pas enfler sur une
       * longue session.
       */
      tmpVersReel.current.set(cleTemp, tache.id);
      if (tmpVersReel.current.size > 60) {
        const plusAncien = tmpVersReel.current.keys().next().value;
        if (plusAncien) tmpVersReel.current.delete(plusAncien);
      }

      if (gestes?.supprimee) {
        setTasks((prev) => prev.filter((t) => (t as { id?: string }).id !== cleTemp));
        appliquerGesteDistant(tache.id, { supprimee: true });
        return;
      }

      const rattrapee: Task & { id: string } = {
        ...tache,
        ...(gestes?.done !== undefined ? { done: gestes.done } : {}),
        ...(gestes?.titre ? { text: gestes.titre } : {}),
        ...(gestes?.niveau ? { niveau: gestes.niveau } : {}),
      };
      setTasks((prev) =>
        prev.map((t) => ((t as { id?: string }).id === cleTemp ? rattrapee : t)),
      );

      if (gestes) appliquerGesteDistant(tache.id, gestes);
    } catch (err) {
      console.error("[taches] ajout impossible :", err);
      gestesAvantConfirmation.current.delete(cleTemp);
      setTasks((prev) => prev.filter((t) => (t as { id?: string }).id !== cleTemp));
    }
  }, [appliquerGesteDistant]);

  const reprendreOublie = useCallback(async (id: string, niveau?: Niveau) => {
    if (demoModeRef.current) return true;
    try {
      const res = await fetch("/api/oublies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Le niveau vient de la case dans la matrice d'Eisenhower : ce qui
        // sort de « Faire » revient en focus principal, pas en annexe.
        body: JSON.stringify({ id, niveau }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { tache } = (await res.json()) as { tache?: Task & { id: string } };
      if (!tache?.id) return true;
      // Comme un ajout : en tête, et la réponse serveur encore en vol ne doit
      // plus remplacer la liste par une photo prise avant cette reprise.
      touchePendantChargement.current.taches = true;
      setTasks((prev) =>
        prev.some((t) => (t as { id?: string }).id === tache.id) ? prev : [tache, ...prev],
      );
      return true;
    } catch (err) {
      console.error("[oublies] reprise impossible :", err);
      return false;
    }
  }, []);

  const supprimerTacheLocale = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => (t as { id?: string }).id !== id));
      if (demoModeRef.current) return;
      /*
       * Supprimer une tâche que le serveur n'a pas encore confirmée : la
       * requête partirait avec un identifiant `tmp-…` inconnu de la base, et
       * la vraie ligne, créée juste après, resterait là — invisible à l'écran,
       * bien présente en base, et de retour au prochain chargement. On note la
       * suppression, elle est exécutée dès que le vrai identifiant arrive.
       */
      if (estProvisoire(id)) {
        noterGesteProvisoire(id, { supprimee: true });
        return;
      }
      void fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
        (err) => console.error("[taches] suppression impossible :", err),
      );
    },
    [noterGesteProvisoire],
  );

  /**
   * « Passer au jour suivant » : on archive la todo du jour dans l'historique,
   * puis on efface les tâches faites en reportant au lendemain celles qui
   * restent — Twaylo n'a pas à retaper ce qu'il n'a pas eu le temps de finir.
   *
   * L'ordre compte. L'instantané complet (faites comprises) part en premier, en
   * direct et attendu, sur l'état d'AVANT le nettoyage — le passer par le
   * débounce d'une seconde enverrait la liste déjà purgée et fausserait
   * l'archive. Ensuite seulement on marque la journée close (pour que l'effet
   * d'instantané ne réécrive pas la liste réduite par-dessus l'archive) et on
   * efface les cochées, à l'écran puis en base.
   */
  const passerJourSuivant = useCallback(async () => {
    if (demoModeRef.current) return;
    const jour = localDateKey();
    const actuelles = tasksRef.current;

    // 1. Figer l'archive du jour, seulement s'il y avait quelque chose à garder.
    if (actuelles.length > 0) {
      // Même règle que l'instantané continu : le tableau du jour, c'est ce qui
      // est encore ouvert plus ce qui a été coché aujourd'hui.
      const duJour = actuelles.filter((t) => !t.done || t.faiteLe === jour);
      const principales = duJour.filter((t) => (t.niveau ?? "secondaire") === "principal");
      try {
        await fetch("/api/daily", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jour,
            taches: {
              total: duJour.length,
              faites: duJour.filter((t) => t.done).length,
              principalTotal: principales.length,
              principalFaites: principales.filter((t) => t.done).length,
              liste: duJour.map((t) => ({
                titre: t.text,
                niveau: t.niveau ?? "secondaire",
                fait: t.done,
              })),
            },
          }),
        });
      } catch (err) {
        console.error("[todo] archive du jour impossible :", err);
      }
    }

    // 2. Marquer la journée close, ici et dans le stockage local.
    setTodoCloturee(jour);
    writeJSON("twaylo-todo-cloturee", jour);

    // 3. Retirer les tâches faites — l'écran d'abord, la base ensuite. Les
    //    inachevées restent et deviennent la todo de demain.
    setTasks((prev) => prev.filter((t) => !t.done));
    try {
      await fetch("/api/tasks?faites=1", { method: "DELETE" });
    } catch (err) {
      console.error("[todo] nettoyage des tâches faites impossible :", err);
    }
  }, []);

  const ajouterContact = useCallback(
    async (nom: string, type = "collab", relation = "froid"): Promise<boolean> => {
      const propre = nom.trim();
      if (!propre || demoModeRef.current) return false;
      try {
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nom: propre, type, relation }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        /*
         * La forme de la réponse est vérifiée, pas seulement son code.
         *
         * Une réponse 200 sans `contact` — base non configurée, réponse
         * inattendue — poussait `undefined` dans la liste, et l'onglet
         * Contacts lisait aussitôt `undefined.relation` : plantage de rendu,
         * ÉCRAN ENTIÈREMENT BLANC, plus un seul onglet accessible. Les autres
         * créations (tâche, objectif, deal) vérifiaient déjà ; celle-ci non.
         */
        const { contact } = await res.json();
        if (!contact?.id) throw new Error("réponse sans contact");
        setContacts((prev) => [...(prev ?? []), contact]);
        return true;
      } catch (err) {
        // L'échec remonte : la saisie reste à l'écran plutôt que d'être
        // effacée sans un mot.
        console.error("[contacts] ajout impossible :", err);
        return false;
      }
    },
    [],
  );

  const supprimerContactLocal = useCallback((id: string) => {
    setContacts((prev) => (prev ?? []).filter((c) => c.id !== id));
    if (demoModeRef.current) return;
    void fetch(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[contacts] suppression impossible :", err),
    );
  }, []);

  const supprimerVideo = useCallback((id: string) => {
    setPipeline((prev) =>
      prev
        ? prev.map((col) => ({
            ...col,
            videos: col.videos.filter((v) => (v as { id?: string }).id !== id),
          }))
        : prev,
    );
    if (demoModeRef.current) return;
    void fetch(`/api/videos?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[pipeline] suppression impossible :", err),
    );
  }, []);

  const deplacerContact = useCallback((id: string, relation: string) => {
    setContacts((prev) =>
      (prev ?? []).map((c) =>
        c.id === id ? { ...c, relation: relation as Contact["relation"] } : c,
      ),
    );
    if (demoModeRef.current) return;
    void fetch("/api/contacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, relation }),
    }).catch((err) => console.error("[contacts] déplacement impossible :", err));
  }, []);

  /** Ajout optimiste, même raison que pour les tâches : l'écran n'attend pas. */
  const ajouterDeal = useCallback(async (nom: string, etape = "prospect") => {
    const propre = nom.trim();
    if (!propre || demoModeRef.current) return;

    const cleTemp = `tmp-${(compteurTemp.current += 1)}`;
    setDeals((prev) => [
      ...(prev ?? []),
      { id: cleTemp, nom: propre, etape, montant: null, note: null, echeance: null },
    ]);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: propre, etape }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { deal } = await res.json();
      if (!deal?.id) throw new Error("réponse sans deal");
      setDeals((prev) => (prev ?? []).map((d) => (d.id === cleTemp ? deal : d)));
    } catch (err) {
      console.error("[deals] ajout impossible :", err);
      setDeals((prev) => (prev ?? []).filter((d) => d.id !== cleTemp));
    }
  }, []);

  const deplacerDeal = useCallback((id: string, etape: string) => {
    setDeals((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, etape } : d)));
    // Deal pas encore confirmé : son identifiant provisoire n'existe pas en
    // base, la requête ne ferait qu'une erreur — et la carte reviendrait à sa
    // place quand la création répondra.
    if (demoModeRef.current || estProvisoire(id)) return;
    void fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, etape }),
    }).catch((err) => console.error("[deals] déplacement impossible :", err));
  }, []);

  const supprimerDealLocal = useCallback((id: string) => {
    setDeals((prev) => (prev ?? []).filter((d) => d.id !== id));
    if (demoModeRef.current || estProvisoire(id)) return;
    void fetch(`/api/deals?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[deals] suppression impossible :", err),
    );
  }, []);

  const majMontantDeal = useCallback((id: string, montant: number | null) => {
    setDeals((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, montant } : d)));
    if (demoModeRef.current || estProvisoire(id)) return;
    void fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, montant }),
    }).catch((err) => console.error("[deals] montant impossible :", err));
  }, []);

  /** Fixe (ou efface, avec null) la date d'échéance d'un deal. */
  const majEcheanceDeal = useCallback((id: string, echeance: string | null) => {
    // La valeur d'avant, pour pouvoir la remettre si le serveur refuse.
    const avant = (dealsRef.current ?? []).find((d) => d.id === id)?.echeance ?? null;
    setDeals((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, echeance } : d)));
    if (demoModeRef.current || estProvisoire(id)) return;
    void fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, echeance }),
    })
      .then((r) => {
        if (r.ok) return;
        /*
         * Le plus probable : la colonne `echeance` n'existe pas encore, faute
         * d'avoir appliqué la migration 0003. On remet la date d'avant plutôt
         * que de laisser l'écran afficher une valeur que la base n'a pas
         * gardée — sinon elle disparaît au rechargement suivant, sans un mot.
         */
        setDeals((prev) =>
          (prev ?? []).map((d) => (d.id === id ? { ...d, echeance: avant } : d)),
        );
        console.error(
          "[deals] échéance refusée par le serveur — la migration 0003 (colonne `echeance`) est-elle appliquée ?",
        );
      })
      .catch((err) => console.error("[deals] échéance impossible :", err));
  }, []);

  const value = useMemo<OsState>(
    () => ({
      activeTab,
      setActiveTab,
      demoMode,
      toggleDemo,
      custom,
      majCustom,
      ongletsVisibles,
      journees,
      majJournees,
      blocsFaits,
      basculerBlocFait,
      data,
      revealed,
      toggleRevealed: () => setRevealed((v) => !v),
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      sync,
      habits,
      faitesDuJour,
      cocherOption,
      basculerHabitude,
      basculerHabitudePrivee,
      ajouterHabitude,
      supprimerHabitude,
      objectifs,
      ajouterObjectif,
      majObjectif: majObjectifLocal,
      supprimerObjectif: supprimerObjectifLocal,
      youtube,
      agenda,
      agendaConnecte,
      blocages,
      ajouterBlocage,
      leverBlocage,
      pipeline,
      contacts,
      deplacerVideo,
      ajouterVideo,
      supprimerVideo,
      renommerVideo,
      tachesPretes,
      ajouterTache,
      supprimerTache: supprimerTacheLocale,
      renommerTache,
      echangerTaches,
      deposerTache,
      passerJourSuivant,
      todoCloturee,
      changerNiveauTache,
      reprendreOublie,
      ajouterContact,
      supprimerContact: supprimerContactLocal,
      deplacerContact,
      deals,
      dealStats,
      ajouterDeal,
      deplacerDeal,
      supprimerDeal: supprimerDealLocal,
      majMontantDeal,
      majEcheanceDeal,
    }),
    [
      activeTab,
      demoMode,
      toggleDemo,
      custom,
      majCustom,
      ongletsVisibles,
      journees,
      majJournees,
      blocsFaits,
      basculerBlocFait,
      data,
      revealed,
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      sync,
      habits,
      faitesDuJour,
      cocherOption,
      basculerHabitude,
      basculerHabitudePrivee,
      ajouterHabitude,
      supprimerHabitude,
      objectifs,
      ajouterObjectif,
      majObjectifLocal,
      supprimerObjectifLocal,
      youtube,
      agenda,
      agendaConnecte,
      blocages,
      ajouterBlocage,
      leverBlocage,
      pipeline,
      contacts,
      deplacerVideo,
      ajouterVideo,
      supprimerVideo,
      renommerVideo,
      tachesPretes,
      ajouterTache,
      supprimerTacheLocale,
      renommerTache,
      echangerTaches,
      deposerTache,
      passerJourSuivant,
      todoCloturee,
      changerNiveauTache,
      reprendreOublie,
      ajouterContact,
      supprimerContactLocal,
      deplacerContact,
      deals,
      dealStats,
      ajouterDeal,
      deplacerDeal,
      supprimerDealLocal,
      majMontantDeal,
      majEcheanceDeal,
    ],
  );

  const saisie = useMemo<OsSaisie>(
    () => ({
      journalText,
      setJournalText: marquerJournal,
      uneChose,
      setUneChose: marquerUneChose,
      repas,
      setRepas: marquerRepas,
    }),
    [journalText, marquerJournal, uneChose, marquerUneChose, repas, marquerRepas],
  );

  /*
   * Trois scalaires, et rien d'autre : c'est ce qui rend la coupure efficace.
   * Taper une lettre change `journalText` mais pas `journalEcrit`, donc cette
   * valeur garde son identité et personne ne re-rend en aval.
   */
  const journalEcrit = journalText.trim().length > 0;
  const uneChoseFaite = uneChose.fait;
  const nombreRepas = repas.length;
  const resume = useMemo<ResumeSaisie>(
    () => ({ journalEcrit, uneChoseFaite, nombreRepas }),
    [journalEcrit, uneChoseFaite, nombreRepas],
  );

  return (
    <OsContext.Provider value={value}>
      <OsResumeContext.Provider value={resume}>
        <OsSaisieContext.Provider value={saisie}>{children}</OsSaisieContext.Provider>
      </OsResumeContext.Provider>
    </OsContext.Provider>
  );
}

export function useOs() {
  const ctx = useContext(OsContext);
  if (!ctx) throw new Error("useOs doit être appelé dans un <OsProvider>");
  return ctx;
}

/** Les champs qui changent à la frappe. À n'appeler que si on les affiche. */
export function useSaisie(): OsSaisie {
  const ctx = useContext(OsSaisieContext);
  if (!ctx) throw new Error("useSaisie doit être appelé dans un <OsProvider>");
  return ctx;
}

/** Le résumé de la saisie — trois scalaires, sans le coût de la frappe. */
export function useResumeSaisie(): ResumeSaisie {
  const ctx = useContext(OsResumeContext);
  if (!ctx) throw new Error("useResumeSaisie doit être appelé dans un <OsProvider>");
  return ctx;
}
