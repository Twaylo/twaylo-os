"use client";

import { useEffect, useState } from "react";

const LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

export type WeekDay = {
  /** 0 = lundi. Sert de clé pour les pastilles « journée chargée ». */
  index: number;
  label: string;
  num: number;
  isToday: boolean;
};

/**
 * La semaine courante, lundi → dimanche, dans le fuseau de l'utilisateur.
 *
 * Calculée après le montage : la date du serveur et celle du navigateur
 * peuvent différer, et un décalage casserait l'hydratation. Le même principe
 * de « jour local » servira pour la clé de daily_logs (spec Partie 10, bug 2).
 */
export function useCurrentWeek(): WeekDay[] | null {
  const [week, setWeek] = useState<WeekDay[] | null>(null);

  useEffect(() => {
    const today = new Date();
    // getDay() renvoie 0 pour dimanche ; on ramène la semaine à un début lundi.
    const offset = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - offset);

    setWeek(
      LABELS.map((label, index) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + index);
        return { index, label, num: d.getDate(), isToday: index === offset };
      }),
    );
  }, []);

  return week;
}
