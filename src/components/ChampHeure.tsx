"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { HEURE } from "@/lib/journees";

/**
 * Un champ d'heure qui n'enregistre qu'une fois la saisie finie.
 *
 * Un `<input type="time">` branché directement sur l'état émet à CHAQUE
 * chiffre : taper « 20:00 » passait par « 00:00 » (le 2 seul est invalide,
 * puis 0…), et comme les blocs se retrient à l'heure à chaque écriture, React
 * déplaçait le champ en cours de frappe — le focus sautait, et l'heure finale
 * enregistrée n'était pas celle voulue.
 *
 * Ici la frappe reste locale ; l'heure ne remonte qu'à la sortie du champ ou
 * sur Entrée, et seulement si elle est complète. Échap remet la valeur
 * d'origine.
 */
export function ChampHeure({
  valeur,
  onValider,
  ariaLabel,
  obligatoire = false,
  className = "",
  style,
}: {
  valeur: string;
  /** Appelé une seule fois, avec une heure valide (ou "" si le vide est permis). */
  onValider: (heure: string) => void;
  ariaLabel: string;
  /** Vrai pour une heure qui ne peut pas être absente (le début d'un bloc). */
  obligatoire?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [brouillon, setBrouillon] = useState(valeur);
  const edite = useRef(false);
  /**
   * Échap demande l'abandon.
   *
   * Un simple `setBrouillon(valeur)` ne suffisait pas : React met la mise à
   * jour en file, tandis que le `blur()` qui suit déclenche la validation
   * sur-le-champ — avec l'ancienne valeur capturée. Taper une heure puis
   * faire Échap l'enregistrait donc quand même. Ce drapeau, lui, est lu
   * immédiatement.
   */
  const annule = useRef(false);

  // La valeur peut changer ailleurs (bascule de modèle, réponse serveur) :
  // on la reprend, sauf pendant que Twaylo tape dedans.
  useEffect(() => {
    if (!edite.current) setBrouillon(valeur);
  }, [valeur]);

  function valider() {
    edite.current = false;
    if (annule.current) {
      annule.current = false;
      setBrouillon(valeur);
      return;
    }
    if (brouillon === valeur) return;
    /*
     * Une saisie que le parent n'accepterait pas revient à l'heure d'avant,
     * plutôt que de laisser le champ dans un état que rien ne corrigera :
     * `valeur` ne changeant pas, l'effet de resynchronisation ne se
     * déclencherait jamais et le champ resterait vide pour toujours.
     */
    const recevable = HEURE.test(brouillon) || (brouillon === "" && !obligatoire);
    if (recevable) onValider(brouillon);
    else setBrouillon(valeur);
  }

  return (
    <input
      type="time"
      value={brouillon}
      onFocus={() => {
        edite.current = true;
      }}
      onChange={(e) => setBrouillon(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          annule.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={ariaLabel}
      className={`[color-scheme:dark] ${className}`}
      style={style}
    />
  );
}
