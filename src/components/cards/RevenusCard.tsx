"use client";

import { useOs } from "@/lib/os-context";
import { Eyebrow, EmptyState, RevealButton } from "@/components/ui";
import { Panel } from "@/components/Panel";

const euros = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const nombre = (n: number) => n.toLocaleString("fr-FR");

/**
 * La carte compacte de l'accueil. La page Revenus en donne la version
 * détaillée.
 *
 * En mode réel elle lit YouTube Analytics ; en démo elle garde le jeu factice,
 * pour filmer sans exposer les vrais revenus. Le montant se cache ou se montre
 * avec le bouton Révéler — utile quand Twaylo filme son écran.
 */
export function RevenusCard() {
  const { revealed, demoMode, youtube, data } = useOs();
  const rev = data.revenue;

  if (demoMode) return <RevenusDemo revealed={revealed} rev={rev} />;

  const connecte = youtube?.connecte === true;

  return (
    <Panel accent="var(--color-ver)" className="col-span-1">
      <div className="flex items-center justify-between">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          REVENUS
        </Eyebrow>
        {connecte && youtube?.revenuEstime !== null && <RevealButton />}
      </div>

      {!connecte ? (
        <EmptyState hint="Onglet Revenus → Connecter YouTube Studio.">
          {youtube === null ? "Lecture de YouTube…" : "YouTube Studio non connecté"}
        </EmptyState>
      ) : youtube!.revenuEstime === null ? (
        <>
          <div className="mt-[10px] font-mono text-[24px] font-black tracking-[-0.02em]">
            {nombre(youtube!.vues)}
          </div>
          <div className="text-[10.5px] text-white/40">vues · 30 derniers jours</div>
          <div className="mt-[9px] text-[11px] leading-[1.4] text-white/35">
            Chaîne non monétisée — les revenus apparaîtront dès l&apos;entrée dans
            le Partner Program.
          </div>
        </>
      ) : (
        <>
          <div className="mt-[10px] flex items-end gap-[7px]">
            <div
              className="font-mono text-[27px] font-black tracking-[-0.02em] transition-[filter] duration-200"
              style={{ filter: revealed ? "none" : "blur(7px)" }}
            >
              {revealed ? euros(youtube!.revenuEstime!) : "•••• €"}
            </div>
          </div>
          <div className="text-[10.5px] text-white/40">30 derniers jours · YouTube</div>

          <div className="mt-[10px] flex gap-2">
            <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
              <div className="text-[10px] text-white/45">RPM</div>
              <div className="font-mono text-[13px] font-extrabold">
                {youtube!.rpm !== null ? `${youtube!.rpm.toFixed(2).replace(".", ",")} €` : "—"}
              </div>
            </div>
            <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
              <div className="text-[10px] text-white/45">Vues 30 j</div>
              <div className="font-mono text-[13px] font-extrabold">{nombre(youtube!.vues)}</div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Mode démo — la carte factice d'origine                              */
/* ------------------------------------------------------------------ */

function RevenusDemo({
  revealed,
  rev,
}: {
  revealed: boolean;
  rev: ReturnType<typeof useOs>["data"]["revenue"];
}) {
  return (
    <Panel accent="var(--color-ver)" className="col-span-1">
      <div className="flex items-center justify-between">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          REVENUS
        </Eyebrow>
        <RevealButton />
      </div>
      <div className="mt-[10px] flex items-end gap-[7px]">
        <div
          className="font-mono text-[27px] font-black tracking-[-0.02em] transition-[filter] duration-200"
          style={{ filter: revealed ? "none" : "blur(7px)" }}
        >
          {revealed ? rev.amount : "•••• €"}
        </div>
        <div className="pb-[5px] text-[12px] font-extrabold" style={{ color: "var(--color-ver)" }}>
          {rev.delta}
        </div>
      </div>
      <div className="text-[10.5px] text-white/40">ce mois · YouTube · AdSense</div>
      <div className="mt-[6px] flex gap-2">
        <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
          <div className="text-[10px] text-white/45">RPM</div>
          <div className="font-mono text-[13px] font-extrabold">{rev.rpm}</div>
        </div>
        <div className="stat-box flex-1 rounded-[10px] px-[9px] py-[7px]">
          <div className="text-[10px] text-white/45">Vues monét.</div>
          <div className="font-mono text-[13px] font-extrabold">{rev.monetizedViews}</div>
        </div>
      </div>
    </Panel>
  );
}
