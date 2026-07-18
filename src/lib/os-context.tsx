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
import { KEYS, dailyKey, pruneOldDailyKeys, readJSON, writeJSON } from "./storage";
import type { Capture, Habit, OsData, Task, UneChose } from "./types";

export const TABS = [
  "Accueil",
  "Contacts",
  "Sponsors",
  "Contenu",
  "Revenus",
  "Journal",
  "Objectifs",
  "Revue",
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

  tasks: Task[];
  toggleTask: (i: number) => void;

  habits: Habit[];
  /** Incrémente une habitude à compteur ; boucle à zéro une fois l'objectif atteint. */
  bumpHabit: (i: number) => void;

  /** L'unique chose que Twaylo a décidé de faire aujourd'hui. */
  uneChose: UneChose;
  setUneChose: Dispatch<SetStateAction<UneChose>>;

  journalText: string;
  setJournalText: Dispatch<SetStateAction<string>>;
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
  const [activeTab, setActiveTab] = useState<Tab>("Accueil");
  const [demoMode, setDemoMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [uneChose, setUneChose] = useState<UneChose>({ texte: "", fait: false });

  const data = demoMode ? DEMO_DATA : REAL_DATA;

  // Les listes cochables sont éditables, donc copiées dans l'état local.
  const [captures, setCaptures] = useState<Capture[]>(REAL_DATA.captures);
  const [tasks, setTasks] = useState<Task[]>(REAL_DATA.tasks);
  const [habits, setHabits] = useState<Habit[]>(REAL_DATA.habits);

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
    writeJSON(dailyKey("habits"), toCounts(habits));
  }, [habits, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSON(dailyKey("journal"), journalText);
  }, [journalText, demoMode]);

  useEffect(() => {
    if (!hydrated.current || demoMode) return;
    writeJSON(dailyKey("unechose"), uneChose);
  }, [uneChose, demoMode]);

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

    // Type provisoire le temps de l'aller-retour ; remplacé à la réponse.
    const optimiste: Capture = { text, type: "note" };
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
    setTasks((prev) => prev.map((t, j) => (j === i ? { ...t, done: !t.done } : t)));
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
      habits,
      bumpHabit,
      uneChose,
      setUneChose,
      journalText,
      setJournalText,
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
      habits,
      bumpHabit,
      uneChose,
      journalText,
    ],
  );

  return <OsContext.Provider value={value}>{children}</OsContext.Provider>;
}

export function useOs() {
  const ctx = useContext(OsContext);
  if (!ctx) throw new Error("useOs doit être appelé dans un <OsProvider>");
  return ctx;
}
