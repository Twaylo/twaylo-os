"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Conversation vocale avec le brain.
 *
 * Tout tient dans le navigateur : `SpeechRecognition` pour l'écoute,
 * `speechSynthesis` pour la voix. Aucune installation, aucune clé
 * supplémentaire, aucun aller-retour audio vers un serveur — c'est ce qui
 * rend l'échange immédiat. Twaylo a demandé que ça bouge : le trajet le plus
 * rapide est celui qu'on ne fait pas.
 *
 * Deux problèmes que cette boucle doit résoudre, et qu'une dictée simple
 * n'a pas :
 *
 * 1. L'écho. Micro ouvert pendant que le haut-parleur parle, la
 *    reconnaissance transcrit la voix de synthèse et le brain se répond à
 *    lui-même. L'écoute est donc coupée pendant qu'il parle.
 * 2. La latence. Attendre la réponse entière avant de la lire ajoute
 *    plusieurs secondes de silence. On lit phrase par phrase, dès qu'une
 *    phrase est complète dans le flux.
 *
 * Chrome, Edge et Safari. Firefox n'implémente pas la reconnaissance : le
 * bouton se désactive au lieu de mentir.
 */

export type EtatVoix = "arret" | "ecoute" | "reflechit" | "parle";

type ReconnaissanceLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EvenementReconnaissance) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type EvenementReconnaissance = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function constructeurReconnaissance(): (new () => ReconnaissanceLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => ReconnaissanceLike;
    webkitSpeechRecognition?: new () => ReconnaissanceLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Le silence après lequel on considère que la phrase est finie. */
const PAUSE_MS = 900;

export type Voix = {
  supporte: boolean;
  etat: EtatVoix;
  /** Ce qui est en train d'être entendu, avant validation. */
  entendu: string;
  erreur: string | null;
  basculer: () => void;
  arreter: () => void;
  /** À appeler morceau par morceau pendant que la réponse arrive. */
  lire: (morceau: string) => void;
  /** La réponse est complète : vide le reste du tampon. */
  finirLecture: () => void;
};

export function useVoix(onQuestion: (texte: string) => void): Voix {
  const [supporte, setSupporte] = useState(false);
  const [etat, setEtat] = useState<EtatVoix>("arret");
  const [entendu, setEntendu] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const recRef = useRef<ReconnaissanceLike | null>(null);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tamponRef = useRef("");
  const resteRef = useRef("");
  /** Vrai tant que la conversation est active — survit aux coupures du navigateur. */
  const actifRef = useRef(false);

  const onQuestionRef = useRef(onQuestion);
  onQuestionRef.current = onQuestion;

  useEffect(() => {
    setSupporte(constructeurReconnaissance() !== null && "speechSynthesis" in window);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Écoute                                                              */
  /* ------------------------------------------------------------------ */

  const couperEcoute = useCallback(() => {
    if (minuteurRef.current) {
      clearTimeout(minuteurRef.current);
      minuteurRef.current = null;
    }
    recRef.current?.abort();
    recRef.current = null;
    setEntendu("");
  }, []);

  const ouvrirEcoute = useCallback(() => {
    if (recRef.current) return;
    const Ctor = constructeurReconnaissance();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let enCours = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const segment = e.results[i][0].transcript;
        if (e.results[i].isFinal) tamponRef.current += ` ${segment}`;
        else enCours += segment;
      }
      setEntendu(enCours);

      // Chaque mot repousse l'échéance : on n'envoie qu'après un vrai silence,
      // sinon une hésitation au milieu d'une phrase couperait la question en
      // deux et le brain répondrait à une moitié.
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
      minuteurRef.current = setTimeout(() => {
        const question = tamponRef.current.trim();
        tamponRef.current = "";
        setEntendu("");
        if (!question) return;
        couperEcoute();
        setEtat("reflechit");
        onQuestionRef.current(question);
      }, PAUSE_MS);
    };

    rec.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      console.error("[voix] erreur :", e.error);
      setErreur(
        e.error === "not-allowed"
          ? "Micro refusé. Autorise-le dans les réglages du navigateur."
          : `Écoute interrompue (${e.error})`,
      );
      actifRef.current = false;
      couperEcoute();
      setEtat("arret");
    };

    rec.onend = () => {
      recRef.current = null;
      // Le navigateur coupe de lui-même après un long silence. Ici, contrairement
      // à la dictée, on relance : dans une conversation, un micro qui s'éteint
      // tout seul casse l'échange.
      if (actifRef.current) {
        setTimeout(() => {
          if (actifRef.current && !recRef.current) ouvrirEcoute();
        }, 200);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setEtat("ecoute");
      setErreur(null);
    } catch (err) {
      console.error("[voix] démarrage impossible :", err);
      setErreur("Impossible d'ouvrir le micro.");
    }
  }, [couperEcoute]);

  /* ------------------------------------------------------------------ */
  /* Parole                                                              */
  /* ------------------------------------------------------------------ */

  /** Met une phrase dans la file de lecture. */
  const enoncer = useCallback(
    (phrase: string) => {
      const propre = phrase.trim();
      if (!propre) return;

      const enonce = new SpeechSynthesisUtterance(propre);
      enonce.lang = "fr-FR";
      // Un peu plus rapide que la normale : la voix par défaut traîne, et
      // Twaylo consulte entre deux prises.
      enonce.rate = 1.12;

      enonce.onstart = () => setEtat("parle");
      enonce.onend = () => {
        // Dernière phrase de la file : on rend la parole.
        if (!window.speechSynthesis.pending && !window.speechSynthesis.speaking) {
          if (actifRef.current) ouvrirEcoute();
          else setEtat("arret");
        }
      };

      window.speechSynthesis.speak(enonce);
    },
    [ouvrirEcoute],
  );

  const lire = useCallback(
    (morceau: string) => {
      resteRef.current += morceau;

      // On découpe sur la ponctuation forte : lire dès la première phrase
      // complète évite d'attendre la fin de la réponse pour ouvrir la bouche.
      for (;;) {
        const coupe = resteRef.current.search(/[.!?…]\s|\n/);
        if (coupe === -1) break;
        const phrase = resteRef.current.slice(0, coupe + 1);
        resteRef.current = resteRef.current.slice(coupe + 1);
        enoncer(phrase);
      }
    },
    [enoncer],
  );

  const finirLecture = useCallback(() => {
    const reste = resteRef.current;
    resteRef.current = "";
    if (reste.trim()) {
      enoncer(reste);
    } else if (!window.speechSynthesis.speaking && actifRef.current) {
      // Réponse vide ou déjà entièrement lue : on rouvre le micro.
      ouvrirEcoute();
    }
  }, [enoncer, ouvrirEcoute]);

  /* ------------------------------------------------------------------ */

  const arreter = useCallback(() => {
    actifRef.current = false;
    couperEcoute();
    window.speechSynthesis.cancel();
    tamponRef.current = "";
    resteRef.current = "";
    setEtat("arret");
  }, [couperEcoute]);

  const basculer = useCallback(() => {
    if (actifRef.current) {
      arreter();
      return;
    }
    if (!constructeurReconnaissance()) {
      setErreur("Ton navigateur ne gère pas le vocal. Essaie Chrome, Edge ou Safari.");
      return;
    }
    actifRef.current = true;
    ouvrirEcoute();
  }, [arreter, ouvrirEcoute]);

  // Quitter l'onglet Brain doit couper le micro ET la voix : les deux
  // survivraient au démontage du composant.
  useEffect(
    () => () => {
      actifRef.current = false;
      recRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis.cancel();
    },
    [],
  );

  return { supporte, etat, entendu, erreur, basculer, arreter, lire, finirLecture };
}
