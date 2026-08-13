"use client";

import { useEffect, useState } from "react";
import { mauvaiseAdresse } from "@/lib/sync";

/** L'adresse qui sert l'OS. Écrite en clair : c'est celle qu'il faut ouvrir. */
const ADRESSE_OS = "https://twaylo-os.vercel.app";

/**
 * « JE TAPE UNE TÂCHE ET ÇA NE MARCHE PAS. »
 *
 * Le déploiement héberge deux sites : l'OS sur ses adresses à lui, les
 * Tway'tools partout ailleurs. Depuis une adresse « outils » — un vieux favori,
 * un lien partagé — toutes les routes de l'OS répondent « introuvable ». Mais
 * l'écran, lui, s'affiche : le navigateur le sort de son cache d'application.
 * On voit donc sa todo, on tape une tâche, elle apparaît une seconde et
 * disparaît ; on coche, ça ne tient pas au rechargement. Rien ne le dit, et
 * c'est indéchiffrable de l'extérieur — on en conclut que l'OS est cassé.
 *
 * Cette bande le dit, et donne le seul geste utile : le lien exact, à ouvrir.
 * Elle ne s'affiche que lorsque la base a répondu « introuvable » à la lecture
 * de l'état, ce qui ne peut vouloir dire que ça.
 */
export function MauvaiseAdresse() {
  const [perdu, setPerdu] = useState(false);

  useEffect(() => {
    /*
     * Relu au fil de l'eau plutôt qu'une fois : le drapeau est posé par la
     * première lecture d'état, qui part après le montage de ce composant.
     * Trois secondes suffisent largement, et on s'arrête dès que c'est su.
     */
    const verifier = () => {
      if (mauvaiseAdresse) setPerdu(true);
    };
    verifier();
    const t = setInterval(verifier, 1500);
    const arret = setTimeout(() => clearInterval(t), 30_000);
    return () => {
      clearInterval(t);
      clearTimeout(arret);
    };
  }, []);

  if (!perdu) return null;

  return (
    <div
      className="relative z-[2] mx-auto mt-3 max-w-[1500px] px-6"
      role="alert"
      style={{
        paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
      }}
    >
      <div
        className="flex flex-wrap items-center gap-[10px] rounded-[13px] px-[13px] py-[11px]"
        style={{
          background: "rgba(255,61,139,0.13)",
          border: "1px solid rgba(255,61,139,0.4)",
        }}
      >
        <span className="text-[16px] leading-none">🚧</span>
        <span className="min-w-0 flex-1 text-[12px] font-bold leading-[1.4] text-white/85">
          Cette adresse ne sert pas ton OS : rien de ce que tu tapes ici ne
          s&apos;enregistre. Ouvre la bonne, et remplace ton favori.
        </span>
        <a
          href={ADRESSE_OS}
          className="flex flex-none items-center rounded-[9px] px-[13px] text-[12px] font-black no-underline transition-all hover:brightness-125"
          style={{
            minHeight: 44,
            color: "var(--color-fg)",
            background: "var(--color-mag)",
          }}
        >
          Ouvrir mon OS →
        </a>
      </div>
    </div>
  );
}
