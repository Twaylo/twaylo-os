"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictée vocale par la reconnaissance intégrée au navigateur.
 *
 * Pourquoi pas Whisper ici : Whisper sert les vocaux Telegram, où l'audio
 * arrive déjà enregistré. Au clavier, la reconnaissance native transcrit en
 * direct, mot par mot, sans clé d'API, sans latence réseau et sans coût.
 * Twaylo voit son texte apparaître pendant qu'il parle.
 *
 * Disponible sur Chrome, Edge et Safari. Firefox ne l'implémente pas — le
 * bouton se désactive proprement au lieu de mentir.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type Dictation = {
  /** Faux si le navigateur ne sait pas faire — le bouton doit se désactiver. */
  supported: boolean;
  listening: boolean;
  /** Texte en cours de reconnaissance, pas encore validé. */
  interim: string;
  error: string | null;
  toggle: () => void;
  stop: () => void;
};

/**
 * @param onFinal reçoit chaque segment définitif, à ajouter au champ cible.
 */
export function useDictation(onFinal: (text: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // La callback change à chaque rendu ; on la garde dans une ref pour ne pas
  // avoir à recréer l'objet de reconnaissance (qui couperait le micro).
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (recognitionRef.current) {
      stop();
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Ton navigateur ne gère pas la dictée. Essaie Chrome ou Edge.");
      return;
    }

    const rec = new Ctor();
    rec.lang = "fr-FR";
    // `continuous` laisse parler sans couper aux silences : Twaylo doit
    // pouvoir raconter sa journée d'une traite.
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let enCours = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const segment = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          onFinalRef.current(segment.trim());
        } else {
          enCours += segment;
        }
      }
      setInterim(enCours);
    };

    rec.onerror = (e) => {
      // `aborted` et `no-speech` sont normaux (arrêt manuel, silence) :
      // les afficher inquiéterait pour rien.
      if (e.error === "aborted" || e.error === "no-speech") return;
      console.error("[dictée] erreur :", e.error);
      setError(
        e.error === "not-allowed"
          ? "Micro refusé. Autorise-le dans les réglages du navigateur."
          : `Dictée interrompue (${e.error})`,
      );
      stop();
    };

    rec.onend = () => {
      // Le navigateur coupe parfois tout seul après un long silence.
      // On ne relance pas automatiquement : un micro qui se rallume sans
      // qu'on l'ait demandé est pire qu'un micro qui s'arrête.
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
      setError(null);
    } catch (err) {
      console.error("[dictée] démarrage impossible :", err);
      setError("Impossible de démarrer la dictée.");
    }
  }, [stop]);

  // Coupe le micro si le composant disparaît — sinon il continue d'écouter.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, error, toggle, stop };
}
