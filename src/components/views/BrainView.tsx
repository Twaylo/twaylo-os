"use client";

import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/ui";
import { Panel } from "@/components/Panel";

/**
 * TWAYLO BRAIN — parler directement à son OS.
 *
 * Le brain lit l'état réel à chaque question : tâches, habitudes, agenda,
 * blocages, pipeline, sponsors, contacts, journal des derniers jours. Il ne
 * répond donc jamais sur des généralités, mais sur ce qui est effectivement
 * dans la base à cette seconde.
 *
 * La réponse s'écrit en flux plutôt que d'arriver d'un bloc : voir le texte
 * apparaître vaut mieux qu'attendre devant un écran vide, même à durée totale
 * identique.
 */

type Message = { role: "user" | "assistant"; contenu: string };

const SUGGESTIONS = [
  "Qu'est-ce que je fais maintenant ?",
  "Qu'est-ce qui traîne depuis trop longtemps ?",
  "Résume-moi ma semaine",
  "Où en est mon pipeline vidéo ?",
];

export function BrainView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Suivre le bas de la conversation pendant que la réponse s'écrit.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function demander(question: string) {
    const propre = question.trim();
    if (!propre || enCours) return;

    setErreur(null);
    setSaisie("");
    // L'historique envoyé est celui d'AVANT cette question : le serveur
    // ajoute la question lui-même.
    const historique = messages;
    setMessages([...historique, { role: "user", contenu: propre }, { role: "assistant", contenu: "" }]);
    setEnCours(true);

    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: propre, historique }),
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }

      const lecteur = res.body.getReader();
      const decodeur = new TextDecoder();
      let accumule = "";

      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        accumule += decodeur.decode(value, { stream: true });
        // On réécrit le dernier message à chaque morceau reçu.
        setMessages((prev) => {
          const suivants = [...prev];
          suivants[suivants.length - 1] = { role: "assistant", contenu: accumule };
          return suivants;
        });
      }
    } catch (err) {
      console.error("[brain] :", err);
      setErreur(err instanceof Error ? err.message : "Le brain n'a pas répondu.");
      // On retire la bulle vide plutôt que de laisser une réponse fantôme.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-[14px]">
      <Panel accent="var(--grad)" className="col-span-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow color="var(--color-cya-soft)" dot="var(--color-cya)">
              TWAYLO BRAIN
            </Eyebrow>
            <div className="mt-1 text-[9.5px] font-bold tracking-[0.06em] text-white/30">
              IL LIT TON OS EN DIRECT — TÂCHES, AGENDA, JOURNAL, SPONSORS
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setErreur(null);
              }}
              className="flex-none cursor-pointer rounded-[8px] px-[9px] py-[5px] text-[10.5px] font-extrabold text-white/45 transition-all hover:brightness-150"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              EFFACER
            </button>
          )}
        </div>

        {/* Hauteur fixe : la conversation défile à l'intérieur, la page ne
            s'allonge pas indéfiniment sous les réponses. */}
        <div className="mt-[13px] flex max-h-[52vh] min-h-[220px] flex-col gap-[9px] overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-[11px] py-6">
              <div className="text-[13px] font-bold text-white/35">
                Demande-lui n&apos;importe quoi sur ta journée.
              </div>
              <div className="flex flex-wrap justify-center gap-[6px]">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void demander(s)}
                    className="cursor-pointer rounded-full px-[11px] py-[6px] text-[11.5px] font-bold text-white/60 transition-all hover:brightness-150"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.09)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[86%] rounded-[13px] px-[13px] py-[9px] text-[13px] font-semibold leading-[1.55] ${
                  m.role === "user" ? "self-end" : "self-start"
                }`}
                style={
                  m.role === "user"
                    ? { background: "rgba(255,61,139,0.14)", border: "1px solid rgba(255,61,139,0.28)" }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                {/* `whitespace-pre-wrap` : le brain répond en listes et en
                    paragraphes, les sauts de ligne comptent. */}
                <span className="whitespace-pre-wrap">{m.contenu}</span>
                {m.role === "assistant" && m.contenu === "" && (
                  <span className="pulse-dot inline-block h-[7px] w-[7px] rounded-full bg-[var(--color-cya)]" />
                )}
              </div>
            ))
          )}
          <div ref={finRef} />
        </div>

        {erreur && (
          <div
            className="mt-[9px] rounded-[10px] px-[11px] py-[8px] text-[11.5px] font-bold"
            style={{
              color: "var(--color-mag-soft)",
              background: "rgba(255,61,139,0.1)",
              border: "1px solid rgba(255,61,139,0.25)",
            }}
          >
            {erreur}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void demander(saisie);
          }}
          className="mt-[11px] flex items-center gap-[8px]"
        >
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Parle à ton brain…"
            aria-label="Question au brain"
            disabled={enCours}
            className="min-w-0 flex-1 rounded-[12px] px-[14px] py-[11px] text-[13.5px] font-semibold text-white outline-none transition-colors focus:border-white/25 disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
          <button
            type="submit"
            disabled={enCours || saisie.trim().length === 0}
            className="flex-none cursor-pointer rounded-[12px] px-[16px] py-[11px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            style={{ background: "var(--grad)" }}
          >
            {enCours ? "…" : "Demander"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
