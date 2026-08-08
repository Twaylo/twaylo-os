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
  className = "",
  style,
}: {
  valeur: string;
  /** Appelé une seule fois, avec une heure valide (ou "" si le champ est vidé). */
  onValider: (heure: string) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [brouillon, setBrouillon] = useState(valeur);
  const edite = useRef(false);

  // La valeur peut changer ailleurs (bascule de modèle, réponse serveur) :
  // on la reprend, sauf pendant que Twaylo tape dedans.
  useEffect(() => {
    if (!edite.current) setBrouillon(valeur);
  }, [valeur]);

  function valider() {
    edite.current = false;
    if (brouillon === valeur) return;
    // Une saisie incomplète ne remplace pas une heure valide : on rend la
    // main plutôt que d'enregistrer un « 00:00 » que personne n'a voulu.
    if (brouillon === "" || HEURE.test(brouillon)) onValider(brouillon);
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
          edite.current = false;
          setBrouillon(valeur);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={ariaLabel}
      className={`[color-scheme:dark] ${className}`}
      style={style}
    />
  );
}
