"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow, EmptyState, RevealButton } from "@/components/ui";
import { Panel } from "@/components/Panel";

/** La carte compacte de l'accueil. La page Revenus en donne la version détaillée. */
export function RevenusCard() {
  const { revealed, data } = useOs();
  const rev = data.revenue;

  return (
    <Panel accent="var(--color-ver)" className="col-span-1">
      <div className="flex items-center justify-between">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          REVENUS
        </Eyebrow>
        {rev.connected && <RevealButton />}
      </div>

      {!rev.connected ? (
        <EmptyState hint="Connexion à l'étape 5 du build.">
          YouTube Analytics non connecté
        </EmptyState>
      ) : (
        <>
          <div className="mt-[10px] flex items-end gap-[7px]">
            <div
              className="font-mono text-[27px] font-black tracking-[-0.02em] transition-[filter] duration-200"
              style={{ filter: revealed ? "none" : "blur(7px)" }}
            >
              {revealed ? rev.amount : "•••• €"}
            </div>
            <div
              className="pb-[5px] text-[12px] font-extrabold"
              style={{ color: "var(--color-ver)" }}
            >
              {rev.delta}
            </div>
          </div>
          <div className="text-[10.5px] text-white/40">ce mois · YouTube · AdSense</div>

          <svg
            viewBox="0 0 300 60"
            preserveAspectRatio="none"
            className="mt-2 block h-[46px] w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(61,220,132,0.35)" />
                <stop offset="1" stopColor="rgba(61,220,132,0)" />
              </linearGradient>
            </defs>
            <path
              d="M0,46 C30,40 48,44 78,35 C108,26 128,32 158,23 C188,14 208,19 238,13 C262,9 280,11 300,6 L300,60 L0,60 Z"
              fill="url(#revFill)"
            />
            <path
              d="M0,46 C30,40 48,44 78,35 C108,26 128,32 158,23 C188,14 208,19 238,13 C262,9 280,11 300,6"
              fill="none"
              stroke="#3ddc84"
              strokeWidth="2.2"
            />
          </svg>

          <div className="mt-[6px] flex gap-2">
            <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
              <div className="text-[10px] text-white/45">RPM</div>
              <div className="font-mono text-[13px] font-extrabold">{rev.rpm}</div>
            </div>
            <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
              <div className="text-[10px] text-white/45">Vues monét.</div>
              <div className="font-mono text-[13px] font-extrabold">
                {rev.monetizedViews}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
