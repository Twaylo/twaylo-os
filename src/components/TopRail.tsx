"use client";

import { useEffect, useState } from "react";
import { TABS, useOs } from "@/lib/os-context";

/**
 * L'horloge doit rester côté client : la rendre au SSR produirait une heure
 * serveur différente de l'heure navigateur et casserait l'hydratation.
 */
function useClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return { dateStr: "", timeStr: "" };
  return {
    dateStr: now.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    timeStr: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function Logo() {
  return (
    <div className="flex cursor-pointer items-center gap-[11px]">
      <div className="logo-mark relative h-[38px] w-[38px] overflow-hidden rounded-xl">
        <svg width="38" height="38" viewBox="0 0 38 38" className="block">
          <defs>
            <linearGradient id="playGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff3d8b" />
              <stop offset="0.38" stopColor="#ffc63d" />
              <stop offset="0.7" stopColor="#3ddc84" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <rect x="1" y="1" width="36" height="36" rx="11" fill="rgba(255,255,255,0.05)" />
          <path d="M14 11 L28 19 L14 27 Z" fill="url(#playGrad)" />
        </svg>
        <div
          className="logo-sweep absolute left-0 top-0 h-full w-2/5"
          style={{
            background:
              "linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)",
          }}
        />
      </div>
      <span className="logo-word inline-block text-[22px] font-black tracking-[-0.02em]">
        twaylo
      </span>
    </div>
  );
}

/** Bascule du mode démo (spec Partie 3). Visible pour que Twaylo sache où il en est. */
function DemoToggle() {
  const { demoMode, toggleDemo } = useOs();
  return (
    <button
      type="button"
      onClick={toggleDemo}
      aria-pressed={demoMode}
      title={
        demoMode
          ? "Données factices affichées — repasser sur les vraies"
          : "Afficher des données factices pour filmer l'écran"
      }
      className="flex flex-none cursor-pointer items-center gap-[6px] rounded-full px-[10px] py-[5px] text-[10.5px] font-extrabold tracking-[0.06em] transition-all hover:brightness-125"
      style={{
        color: demoMode ? "var(--color-amb)" : "rgba(255,255,255,0.4)",
        background: demoMode ? "rgba(255,198,61,0.12)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${demoMode ? "rgba(255,198,61,0.35)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <span
        className={`h-[6px] w-[6px] rounded-full ${demoMode ? "pulse-dot" : ""}`}
        style={{
          background: demoMode ? "var(--color-amb)" : "rgba(255,255,255,0.25)",
        }}
      />
      DÉMO
    </button>
  );
}

export function TopRail() {
  const { activeTab, setActiveTab, data } = useOs();
  const { dateStr, timeStr } = useClock();

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-[18px]"
      style={{
        background: "linear-gradient(180deg, rgba(7,18,29,0.92), rgba(7,18,29,0.6))",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Logo />

        <nav
          className="flex flex-wrap items-center gap-[3px] rounded-full p-1"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {TABS.map((tab) => {
            const on = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                aria-current={on ? "page" : undefined}
                className="cursor-pointer rounded-full px-[13px] py-[7px] text-[13px] font-extrabold transition-all hover:brightness-125"
                style={
                  on
                    ? {
                        // L'onglet actif porte le dégradé signature (spec Partie 3).
                        color: "#07121d",
                        background: "var(--grad)",
                      }
                    : {
                        color: "rgba(255,255,255,0.5)",
                        background: "transparent",
                      }
                }
              >
                {tab}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-[10px]">
          {/*
            Les tickers de Miles étaient BTC / NDX / XAU — les chiffres qui
            comptent pour un investisseur. Ceux de Twaylo sont ses abonnés,
            ses vues et son RPM.
          */}
          <div className="hidden items-center gap-[14px] lg:flex">
            {data.tickers.map((t) => (
              <div key={t.label} className="leading-[1.15]">
                <div className="text-[8px] font-black tracking-[0.1em] text-white/30">
                  {t.label}
                </div>
                <div className="flex items-baseline gap-[4px]">
                  <span className="font-mono text-[12px] font-extrabold">{t.valeur}</span>
                  {t.delta && (
                    <span
                      className="font-mono text-[9px] font-bold"
                      style={{ color: "var(--color-ver-soft)" }}
                    >
                      {t.delta}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DemoToggle />
          <div className="text-right leading-[1.2]">
            {/* Espace réservé pendant le premier rendu pour éviter un saut. */}
            <div className="text-[12.5px] font-extrabold capitalize">{dateStr || " "}</div>
            <div className="font-mono text-[11px] text-white/40">{timeStr || " "}</div>
          </div>
          <div
            className="h-[38px] w-[38px] flex-none rounded-full p-[2px]"
            style={{ background: "var(--grad)" }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-[#07121d] text-[15px] font-black">
              T
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
