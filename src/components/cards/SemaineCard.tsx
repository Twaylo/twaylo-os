"use client";

import { useState } from "react";
import { useOs } from "@/lib/os-context";
import { useCurrentWeek } from "@/lib/use-week";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

const JOURS_LONGS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * La semaine, mais l'attention sur un seul jour.
 *
 * Twaylo voulait voir « seulement le jour », pas toute la semaine d'un bloc :
 * la bande des sept jours reste — pour repérer d'un coup d'œil quels jours
 * sont chargés — mais la liste en dessous ne montre que le jour sélectionné.
 * Par défaut aujourd'hui ; un clic sur un autre jour bascule dessus.
 */
export function SemaineCard() {
  const { agenda, agendaConnecte, demoMode, data } = useOs();
  const week = useCurrentWeek();

  const evenements = demoMode
    ? data.events.map((e, i) => ({
        id: `demo-${i}`,
        titre: e.title,
        heure: e.time,
        jourIndex: i,
        journeeEntiere: false,
      }))
    : agenda;
  const connected = demoMode || agendaConnecte;

  const joursOccupes = new Set(evenements.map((e) => e.jourIndex));
  const indexAujourdhui = week?.find((d) => d.isToday)?.index ?? 0;

  // `null` tant que Twaylo n'a rien choisi : on affiche alors aujourd'hui.
  const [choisi, setChoisi] = useState<number | null>(null);
  const jourActif = choisi ?? indexAujourdhui;

  const duJour = evenements.filter((e) => e.jourIndex === jourActif);
  const estAujourdhui = jourActif === indexAujourdhui;

  return (
    <Panel accent="var(--color-ble)" className="col-span-full md:col-span-2 xl:col-span-1">
      <div className="mb-[11px] flex items-center justify-between gap-3">
        <Eyebrow color="var(--color-ble-soft)" dot="var(--color-ble)">
          SEMAINE
        </Eyebrow>
        <div
          className="flex flex-none items-center gap-[6px] rounded-full px-[10px] py-1 text-[10.5px] font-bold"
          style={{
            color: connected ? "var(--color-ble-soft)" : "rgba(255,255,255,0.35)",
            background: connected ? "rgba(79,156,255,0.1)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${connected ? "rgba(79,156,255,0.25)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{ background: connected ? "var(--color-ver)" : "rgba(255,255,255,0.25)" }}
          />
          Google Agenda
        </div>
      </div>

      {/* Réserve la hauteur pendant le premier rendu, avant que la date locale
          soit connue — évite un saut de mise en page. */}
      <div className="grid min-h-[62px] grid-cols-7 gap-[6px]">
        {week?.map((d) => {
          const actif = d.index === jourActif;
          return (
            <button
              key={d.index}
              type="button"
              onClick={() => setChoisi(d.index)}
              aria-pressed={actif}
              title={`Voir le ${JOURS_LONGS[d.index].toLowerCase()}`}
              className="cursor-pointer rounded-xl px-[3px] pb-[7px] pt-[9px] text-center transition-all hover:brightness-125"
              style={{
                // Le jour sélectionné est rempli ; le jour d'aujourd'hui, s'il
                // n'est pas celui qu'on regarde, garde juste un liseré.
                background: actif ? "rgba(79,156,255,0.22)" : "rgba(255,255,255,0.035)",
                border: `1px solid ${
                  actif
                    ? "var(--color-ble)"
                    : d.isToday
                      ? "rgba(79,156,255,0.4)"
                      : "rgba(255,255,255,0.06)"
                }`,
              }}
            >
              <div className="text-[9.5px] font-extrabold opacity-70">{d.label}</div>
              <div className="mt-[1px] font-mono text-[16px] font-black">{d.num}</div>
              <div
                className="mx-auto mt-1 h-[5px] w-[5px] rounded-full"
                style={{
                  background: joursOccupes.has(d.index) ? "var(--color-ble)" : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Le jour affiché, en clair. */}
      <div className="mt-[11px] mb-[6px] flex items-baseline justify-between">
        <span className="text-[10px] font-black tracking-[0.1em] text-white/40">
          {estAujourdhui ? "AUJOURD'HUI" : JOURS_LONGS[jourActif].toUpperCase()}
        </span>
        {duJour.length > 0 && (
          <span className="text-[10px] font-bold text-white/30">
            {duJour.length} événement{duJour.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!connected ? (
        <EmptyState hint="Ajoute GOOGLE_ICAL_URL dans .env.local (Agenda › Paramètres › Adresse secrète au format iCal).">
          Agenda non connecté
        </EmptyState>
      ) : duJour.length === 0 ? (
        <div
          className="rounded-[10px] px-[11px] py-[10px] text-[12px] font-bold text-white/35"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {estAujourdhui ? "Rien de prévu aujourd'hui." : "Rien de prévu ce jour."}
        </div>
      ) : (
        <ul className="flex flex-col gap-[5px]">
          {duJour.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[7px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span
                className="flex-none font-mono text-[11px] font-extrabold"
                style={{ color: "var(--color-ble-soft)", flexBasis: 42 }}
              >
                {e.heure || "jour"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" title={e.titre}>
                {e.titre}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
