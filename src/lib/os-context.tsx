"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_DATA } from "./data-demo";
import { REAL_DATA } from "./data-real";
import type { Capture, Habit, OsData, Task } from "./types";

export const TABS = [
  "Accueil",
  "Contacts",
  "Sponsors",
  "Contenu",
  "Revenus",
  "Journal",
  "Objectifs",
] as const;

export type Tab = (typeof TABS)[number];

const DEMO_KEY = "twaylo-demo-mode";

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

  micOn: boolean;
  toggleMic: () => void;

  captureText: string;
  setCaptureText: (v: string) => void;
  captures: Capture[];
  addCapture: () => void;
  /** Vrai pendant l'aller-retour de tri — sert à désactiver le bouton. */
  capturing: boolean;

  tasks: Task[];
  toggleTask: (i: number) => void;

  habits: Habit[];
  toggleHabit: (i: number) => void;

  journalText: string;
  setJournalText: (v: string) => void;
};

const OsContext = createContext<OsState | null>(null);

export function OsProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>("Accueil");
  const [demoMode, setDemoMode] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [journalText, setJournalText] = useState("");

  const data = demoMode ? DEMO_DATA : REAL_DATA;

  // Les listes cochables sont éditables, donc copiées dans l'état local.
  // Elles repartent du jeu de données à chaque bascule de mode.
  const [captures, setCaptures] = useState<Capture[]>(REAL_DATA.captures);
  const [tasks, setTasks] = useState<Task[]>(REAL_DATA.tasks);
  const [habits, setHabits] = useState<Habit[]>(REAL_DATA.habits);

  // Le choix du mode démo survit au rechargement (spec Partie 3, annexe A17).
  useEffect(() => {
    if (localStorage.getItem(DEMO_KEY) !== "1") return;
    setDemoMode(true);
    setCaptures(DEMO_DATA.captures);
    setTasks(DEMO_DATA.tasks);
    setHabits(DEMO_DATA.habits);
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoMode((on) => {
      const next = !on;
      const src = next ? DEMO_DATA : REAL_DATA;
      setCaptures(src.captures);
      setTasks(src.tasks);
      setHabits(src.habits);
      setJournalText("");
      localStorage.setItem(DEMO_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

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

  const toggleHabit = useCallback((i: number) => {
    setHabits((prev) => prev.map((h, j) => (j === i ? { ...h, done: !h.done } : h)));
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
      micOn,
      toggleMic: () => setMicOn((v) => !v),
      captureText,
      setCaptureText,
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      habits,
      toggleHabit,
      journalText,
      setJournalText,
    }),
    [
      activeTab,
      demoMode,
      toggleDemo,
      data,
      revealed,
      micOn,
      captureText,
      captures,
      addCapture,
      capturing,
      tasks,
      toggleTask,
      habits,
      toggleHabit,
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
