"use client";

import { useOs } from "@/lib/os-context";
import { useCurrentWeek } from "@/lib/use-week";
import { Eyebrow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

const JOURS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

export function SemaineCard() {
  const { agenda, agendaConnecte, demoMode, data } = useOs();
  const week = useCurrentWeek();

  // En démo on garde le jeu factice ; sinon ce sont les vrais événements.
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

  // Une pastille sous les jours qui portent au moins un événement.
  const joursOccupes = new Set(evenements.map((e) => e.jourIndex));

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
            style={{
              background: connected ? "var(--color-ver)" : "rgba(255,255,255,0.25)",
            }}
          />
          Google Agenda
        </div>
      </div>

      {/* Réserve la hauteur pendant le premier rendu, avant que la date locale
          soit connue — évite un saut de mise en page. */}
      <div className="grid min-h-[62px] grid-cols-7 gap-[6px]">
        {week?.map((d) => (
          <div
            key={d.index}
            className="rounded-xl px-[3px] pb-[7px] pt-[9px] text-center"
            style={{
              background: d.isToday
                ? "rgba(79,156,255,0.16)"
                : "rgba(255,255,255,0.035)",
              border: `1px solid ${d.isToday ? "rgba(79,156,255,0.5)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <div className="text-[9.5px] font-extrabold opacity-70">{d.label}</div>
            <div className="mt-[1px] font-mono text-[16px] font-black">{d.num}</div>
            <div
              className="mx-auto mt-1 h-[5px] w-[5px] rounded-full"
              style={{
                background: joursOccupes.has(d.index)
                  ? "var(--color-ble)"
                  : "transparent",
              }}
            />
          </div>
        ))}
      </div>

      {!connected ? (
        <EmptyState hint="Ajoute GOOGLE_ICAL_URL dans .env.local (Agenda › Paramètres › Adresse secrète au format iCal).">
          Agenda non connecté
        </EmptyState>
      ) : evenements.length === 0 ? (
        <EmptyState hint="Rien de prévu cette semaine.">Semaine libre</EmptyState>
      ) : (
        <ul className="mt-[11px] flex flex-col gap-[5px]">
          {evenements.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[6px]"
              style={{
                background: "rgba(255,255,255,0.035)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span
                className="flex-none text-[9px] font-black tracking-[0.08em] text-white/35"
                style={{ flexBasis: 26 }}
              >
                {JOURS[e.jourIndex] ?? ""}
              </span>
              <span
                className="flex-none font-mono text-[11px] font-extrabold"
                style={{ color: "var(--color-ble-soft)", flexBasis: 38 }}
              >
                {/* Un événement sur la journée entière n'a pas d'heure à montrer. */}
                {e.heure || "jour"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold" title={e.titre}>
                {e.titre}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
