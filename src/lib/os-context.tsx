"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { DEMO_DATA } from "./data-demo";
import { REAL_DATA } from "./data-real";
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
import type {
  Capture,
  Contact,
  Habit,
  OsData,
  PipelineColumn,
  Repas,
  Task,
  UneChose,
} from "./types";

export const TABS = [
  "Accueil",
  "Contacts",
  "Sponsors",
  "Contenu",
  "Revenus",
  "Journal",
  "Objectifs",
  "Revue",
  "Fichiers",
] as const;

export type Tab = (typeof TABS)[number];

type OsState = {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;

  /** Bascule vers le jeu de données factices, pour filmer l'OS. */
  demoMode: boolean;
  toggleDemo: () => void;

  /** Les données affichées — REAL_DATA ou DEMO_DATA selon le mode. */
  data: OsData;

  /** Masque les montants tant qu'il est faux. */
  revealed: boolean;
  toggleRevealed: () => void;

  captureText: string;
  setCaptureText: Dispatch<SetStateAction<string>>;
  captures: Capture[];
  addCapture: () => void;
  /** Vrai pendant l'aller-retour de tri — sert à désactiver le bouton. */
  capturing: boolean;

  tasks: (Task & { id?: string })[];
  toggleTask: (i: number) => void;

  /** Où en est la synchro avec la base — affiché dans le rail. */
  sync: "inconnu" | "connecte" | "hors_ligne" | "erreur";

  habits: Habit[];
  /** Incrémente une habitude à compteur ; boucle à zéro une fois l'objectif atteint. */
  bumpHabit: (i: number) => void;

  /** L'unique chose que Twaylo a décidé de faire aujourd'hui. */
  uneChose: UneChose;
  setUneChose: Dispatch<SetStateAction<UneChose>>;

  journalText: string;
  setJournalText: Dispatch<SetStateAction<string>>;

  /** Les repas du jour. Vivent ici pour participer au cycle charge/synchronise. */
  repas: Repas[];
  setRepas: Dispatch<SetStateAction<Repas[]>>;

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
  ajouterVideo: (titre: string, format?: "short" | "long") => Promise<void>;
  supprimerVideo: (id: string) => void;
  /** Renomme une vidéo sans changer son étape. */
  renommerVideo: (id: string, titre: string) => void;

  ajouterTache: (titre: string) => Promise<void>;
  supprimerTache: (id: string) => void;

  ajouterContact: (nom: string, type?: string) => Promise<void>;
  supprimerContact: (id: string) => void;
  /** Change la chaleur d'un contact — c'est ce que fait le glisser-déposer. */
  deplacerContact: (id: string, relation: string) => void;

  deals: DealVue[] | null;
  dealStats: { label: string; value: string; color: string }[] | null;
  ajouterDeal: (nom: string, etape?: string) => Promise<void>;
  deplacerDeal: (id: string, etape: string) => void;
  supprimerDeal: (id: string) => void;
  majMontantDeal: (id: string, montant: number | null) => void;
};

/** Un deal tel que l'interface le manipule. */
export type DealVue = {
  id: string;
  nom: string;
  etape: string;
  montant: number | null;
  note: string | null;
};

const OsContext = createContext<OsState | null>(null);

/**
 * Les états cochés sont stockés par libellé, pas par index : réordonner ou
 * insérer une ligne ne doit pas décaler ce qui est fait.
 * C'est aussi la forme de daily_logs.habitudes côté Supabase.
 */
function applyDone<T extends { done: boolean }>(
  items: T[],
  label: (item: T) => string,
  doneLabels: string[],
): T[] {
  const done = new Set(doneLabels);
  return items.map((item) => ({ ...item, done: done.has(label(item)) }));
}

/** Les habitudes stockent un compteur par nom, pas un simple booléen. */
function applyCounts(items: Habit[], counts: Record<string, number>): Habit[] {
  return items.map((h) => ({ ...h, fait: counts[h.name] ?? 0 }));
}

function toCounts(items: Habit[]): Record<string, number> {
  return Object.fromEntries(items.filter((h) => h.fait > 0).map((h) => [h.name, h.fait]));
}

export function OsProvider({ children }: { children: ReactNode }) {
  /** Lu depuis des callbacks stables, qui ne doivent pas se recréer à chaque rendu. */
  const demoModeRef = useRef(false);

  const [activeTab, setActiveTab] = useState<Tab>("Accueil");
  const [demoMode, setDemoMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [captureText, setCaptureText] = useState("");
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

  const data = demoMode ? DEMO_DATA : REAL_DATA;
  demoModeRef.current = demoMode;

  // Les listes cochables sont éditables, donc copiées dans l'état local.
  const [captures, setCaptures] = useState<Capture[]>(REAL_DATA.captures);
  const [tasks, setTasks] = useState<Task[]>(REAL_DATA.tasks);
  const [habits, setHabits] = useState<Habit[]>(REAL_DATA.habits);
  const [sync, setSync] = useState<"inconnu" | "connecte" | "hors_ligne" | "erreur">(
    "inconnu",
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

  /** Relit tout le stockage local et remplit l'état. */
  const hydrateFromStorage = useCallback(() => {
    setCaptures(readJSON<Capture[]>(KEYS.captures, REAL_DATA.captures));
    setTasks(
      applyDone(REAL_DATA.tasks, (t) => t.text, readJSON<string[]>(KEYS.tasks, [])),
    );
    // Clé datée : au changement de jour local, la clé n'existe pas encore et
    // les habitudes repartent vierges. Aucun code de remise à zéro.
    setHabits(
      applyCounts(REAL_DATA.habits, readJSON<Record<string, number>>(dailyKey("habits"), {})),
    );
    setJournalText(readJSON<string>(dailyKey("journal"), ""));
    setUneChose(readJSON<UneChose>(dailyKey("unechose"), { texte: "", fait: false }));
    setRepas(readJSON<Repas[]>(dailyKey("nutrition"), []));
  }, []);

  // Lecture initiale, une seule fois.
  useEffect(() => {
    pruneOldDailyKeys("habits");
    pruneOldDailyKeys("journal");
    pruneOldDailyKeys("unechose");
    pruneOldDailyKeys("nutrition");

    if (readJSON<string>(KEYS.demo, "0") === "1") {
      // En démo on n'ouvre jamais le stockage réel.
      setDemoMode(true);
      setCaptures(DEMO_DATA.captures);
      setTasks(DEMO_DATA.tasks);
      setHabits(DEMO_DATA.habits);
    } else {
      hydrateFromStorage();
    }

    hydrated.current = true;
  }, [hydrateFromStorage]);

  useEffect(() => surChangementSync(setSync), []);

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

    let annule = false;
    void chargerEtat(jour).then((distant) => {
      if (annule || !distant?.connecte) return;

      if (distant.taches) setTasks(distant.taches);
      if (distant.habitudes) setHabits(distant.habitudes as Habit[]);
      if (distant.uneChose) setUneChose(distant.uneChose);
      if (distant.nutrition?.repas) setRepas(distant.nutrition.repas as Repas[]);
      if (distant.pipeline) setPipeline(distant.pipeline as PipelineColumn[]);
      if (distant.contacts) setContacts(distant.contacts as (Contact & { id: string })[]);
      if (distant.deals) setDeals(distant.deals as DealVue[]);
      if (distant.dealStats) setDealStats(distant.dealStats);
      if (distant.captures) {
        setCaptures(
          distant.captures.map((c) => ({ text: c.text, type: c.type as Capture["type"] })),
        );
      }
      // Le journal distant ne remplace le local que si le local est vide :
      // sinon une frappe en cours au moment de la réponse serait écrasée
      // (spec Partie 10, bug 4).
      if (distant.journal) {
        setJournalText((local) => (local.trim() ? local : distant.journal ?? ""));
      }
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
    if (!hydrated.current || demoMode) return;
    writeJSON(KEYS.captures, captures);
  }, [captures, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSON(
      KEYS.tasks,
      tasks.filter((t) => t.done).map((t) => t.text),
    );
  }, [tasks, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    const compteurs = toCounts(habits);
    writeJSON(dailyKey("habits"), compteurs);
    synchroniserJour({ jour: jourRef.current || localDateKey(), compteurs });
  }, [habits, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSONDebounced(dailyKey("journal"), journalText);
    synchroniserJour({ jour: jourRef.current || localDateKey(), journal: journalText });
  }, [journalText, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSONDebounced(dailyKey("unechose"), uneChose);
    synchroniserJour({ jour: jourRef.current || localDateKey(), uneChose });
  }, [uneChose, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSON(dailyKey("nutrition"), repas);
    synchroniserJour({ jour: jourRef.current || localDateKey(), nutrition: { repas } });
  }, [repas, demoMode]);

  const toggleDemo = useCallback(() => {
    setDemoMode((on) => {
      const next = !on;
      writeJSON(KEYS.demo, next ? "1" : "0");

      if (next) {
        setCaptures(DEMO_DATA.captures);
        setTasks(DEMO_DATA.tasks);
        setHabits(DEMO_DATA.habits);
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

  const addCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text) return;

    // Vidé tout de suite : la capture doit rendre la main en un battement de
    // cil, la classification arrive derrière.
    setCaptureText("");
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

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texte: text, source: "web" }),
      });
      if (!res.ok && res.status !== 207) throw new Error(`HTTP ${res.status}`);

      const { classification } = await res.json();
      setCaptures((prev) =>
        prev.map((c) => (c === optimiste ? { text, type: classification.type } : c)),
      );
    } catch (err) {
      // Jamais de catch vide (spec Partie 10, bug 3). La capture reste à
      // l'écran en « note » — le texte n'est jamais perdu.
      console.error("[capture] tri impossible :", err);
    } finally {
      setCapturing(false);
    }
  }, [captureText]);

  const toggleTask = useCallback((i: number) => {
    setTasks((prev) => {
      const suivant = prev.map((t, j) => (j === i ? { ...t, done: !t.done } : t));
      const cible = suivant[i] as Task & { id?: string };
      // L'écran a déjà changé ; la base suit. Un échec réseau laisse la case
      // cochée à l'écran et remonte dans l'indicateur de synchro plutôt que
      // d'annuler le geste sous les doigts de Twaylo.
      if (cible.id && !demoModeRef.current) {
        void basculerTacheDistante(cible.id, cible.done);
      }
      return suivant;
    });
  }, []);

  /**
   * Un clic avance le compteur. Une fois l'objectif atteint, le clic suivant
   * revient à zéro — corriger une erreur sans ajouter un bouton « moins ».
   */
  const bumpHabit = useCallback((i: number) => {
    setHabits((prev) =>
      prev.map((h, j) => {
        if (j !== i) return h;
        const cible = h.cible ?? 1;
        return { ...h, fait: h.fait >= cible ? 0 : h.fait + 1 };
      }),
    );
  }, []);

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
    async (titre: string, format: "short" | "long" = "long") => {
      const propre = titre.trim();
      if (!propre || demoModeRef.current) return;
      try {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ titre: propre, format }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { video } = await res.json();
        setPipeline((prev) =>
          prev
            ? prev.map((col) =>
                col.status === "idee"
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
      } catch (err) {
        console.error("[pipeline] ajout impossible :", err);
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

  const ajouterTache = useCallback(async (titre: string) => {
    const propre = titre.trim();
    if (!propre || demoModeRef.current) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titre: propre }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { tache } = await res.json();
      setTasks((prev) => [...prev, tache]);
    } catch (err) {
      console.error("[taches] ajout impossible :", err);
    }
  }, []);

  const supprimerTacheLocale = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => (t as { id?: string }).id !== id));
    if (demoModeRef.current) return;
    void fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[taches] suppression impossible :", err),
    );
  }, []);

  const ajouterContact = useCallback(async (nom: string, type = "collab") => {
    const propre = nom.trim();
    if (!propre || demoModeRef.current) return;
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: propre, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { contact } = await res.json();
      setContacts((prev) => [...(prev ?? []), contact]);
    } catch (err) {
      console.error("[contacts] ajout impossible :", err);
    }
  }, []);

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

  const ajouterDeal = useCallback(async (nom: string, etape = "prospect") => {
    const propre = nom.trim();
    if (!propre || demoModeRef.current) return;
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: propre, etape }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { deal } = await res.json();
      setDeals((prev) => [...(prev ?? []), deal]);
    } catch (err) {
      console.error("[deals] ajout impossible :", err);
    }
  }, []);

  const deplacerDeal = useCallback((id: string, etape: string) => {
    setDeals((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, etape } : d)));
    if (demoModeRef.current) return;
    void fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, etape }),
    }).catch((err) => console.error("[deals] déplacement impossible :", err));
  }, []);

  const supprimerDealLocal = useCallback((id: string) => {
    setDeals((prev) => (prev ?? []).filter((d) => d.id !== id));
    if (demoModeRef.current) return;
    void fetch(`/api/deals?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[deals] suppression impossible :", err),
    );
  }, []);

  const majMontantDeal = useCallback((id: string, montant: number | null) => {
    setDeals((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, montant } : d)));
    if (demoModeRef.current) return;
    void fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, montant }),
    }).catch((err) => console.error("[deals] montant impossible :", err));
  }, []);

  const value = useMemo<OsState>(
    () => ({
      activeTab,
      setActiveTab,
      demoMode,
      toggleDemo,
      data,
      revealed,
      toggleRevealed: () => setRevealed((v) => !v),
      captureText,
      setCaptureText,
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      sync,
      habits,
      bumpHabit,
      uneChose,
      setUneChose,
      journalText,
      setJournalText,
      repas,
      setRepas,
      pipeline,
      contacts,
      deplacerVideo,
      ajouterVideo,
      supprimerVideo,
      renommerVideo,
      ajouterTache,
      supprimerTache: supprimerTacheLocale,
      ajouterContact,
      supprimerContact: supprimerContactLocal,
      deplacerContact,
      deals,
      dealStats,
      ajouterDeal,
      deplacerDeal,
      supprimerDeal: supprimerDealLocal,
      majMontantDeal,
    }),
    [
      activeTab,
      demoMode,
      toggleDemo,
      data,
      revealed,
      captureText,
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      sync,
      habits,
      bumpHabit,
      uneChose,
      journalText,
      repas,
      pipeline,
      contacts,
      deplacerVideo,
      ajouterVideo,
      supprimerVideo,
      renommerVideo,
      ajouterTache,
      supprimerTacheLocale,
      ajouterContact,
      supprimerContactLocal,
      deplacerContact,
      deals,
      dealStats,
      ajouterDeal,
      deplacerDeal,
      supprimerDealLocal,
      majMontantDeal,
    ],
  );

  return <OsContext.Provider value={value}>{children}</OsContext.Provider>;
}

export function useOs() {
  const ctx = useContext(OsContext);
  if (!ctx) throw new Error("useOs doit être appelé dans un <OsProvider>");
  return ctx;
}
