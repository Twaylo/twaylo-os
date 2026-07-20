"use client";

import { useEffect, useState } from "react";
import { useOs } from "@/lib/os-context";
import { Amount, EmptyState, FormatBadge, RevealButton } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";

const CHART_HEIGHT = 115;

const nombre = (n: number) => n.toLocaleString("fr-FR");
const euros = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Le message affiché au retour de Google (paramètre `?yt=...`). */
const RETOURS: Record<string, { texte: string; ok: boolean }> = {
  ok: { texte: "YouTube connecté. Tes statistiques se chargent.", ok: true },
  refus: { texte: "Connexion annulée.", ok: false },
  echec: { texte: "La connexion a échoué. Réessaie.", ok: false },
  config: { texte: "GOOGLE_CLIENT_ID manquant dans .env.local.", ok: false },
  sanscode: { texte: "Google n'a pas renvoyé de code. Réessaie.", ok: false },
};

export function RevenusView() {
  const { revealed, demoMode, data, youtube } = useOs();
  const hidden = !revealed;

  const [retour, setRetour] = useState<{ texte: string; ok: boolean } | null>(null);

  useEffect(() => {
    // Message de retour après le passage par Google, puis on nettoie l'URL.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("yt");
    if (code && RETOURS[code]) {
      setRetour(RETOURS[code]);
      params.delete("yt");
      const reste = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (reste ? `?${reste}` : ""));
    }
  }, []);

  /* -------- Mode démo : le jeu factice, pour filmer -------- */
  if (demoMode) return <RevenusDemo hidden={hidden} data={data} />;

  const connecte = youtube?.connecte === true;
  const enCours = youtube === null;
  const maxVues = Math.max(1, ...(youtube?.parJour ?? []).map((j) => j.vues));

  return (
    <>
      <ViewHeader
        title="Revenus"
        subtitle={connecte ? youtube?.periode : "YouTube Studio non connecté"}
        action={connecte ? <RevealButton large /> : undefined}
      />

      {retour && (
        <div
          className="mb-[14px] rounded-[12px] px-[13px] py-[10px] text-[12.5px] font-bold"
          style={{
            color: retour.ok ? "var(--color-ver-soft)" : "var(--color-mag-soft)",
            background: retour.ok ? "rgba(61,220,132,0.1)" : "rgba(255,61,139,0.1)",
            border: `1px solid ${retour.ok ? "rgba(61,220,132,0.25)" : "rgba(255,61,139,0.25)"}`,
          }}
        >
          {retour.texte}
        </div>
      )}

      {/* -------- Pas connecté : inviter à connecter -------- */}
      {!connecte && (
        <Panel accent="var(--color-ver)">
          <div className="flex flex-col items-center gap-[14px] py-8 text-center">
            <div className="max-w-[420px] text-[13.5px] leading-[1.5] text-white/50">
              {enCours ? (
                "Vérification de la connexion…"
              ) : youtube?.error ? (
                youtube.error
              ) : (
                <>
                  Branche ta chaîne pour voir tes vraies vues, abonnés et revenus
                  des 30 derniers jours. Les revenus n&apos;apparaissent que si ta
                  chaîne est monétisée.
                </>
              )}
            </div>
            {!enCours && (
              <a
                href="/api/youtube/connect"
                className="cursor-pointer rounded-[12px] px-[18px] py-[11px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110"
                style={{ background: "var(--grad)" }}
              >
                Connecter YouTube Studio
              </a>
            )}
          </div>
        </Panel>
      )}

      {/* -------- Connecté : les vrais chiffres -------- */}
      {connecte && youtube && (
        <>
          <div className="mb-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
            <Tuile
              label="REVENU ESTIMÉ · 30 J"
              valeur={youtube.revenuEstime === null ? "—" : euros(youtube.revenuEstime)}
              sous={
                youtube.revenuEstime === null
                  ? "chaîne non monétisée"
                  : youtube.rpm !== null
                    ? `RPM ${youtube.rpm.toFixed(2).replace(".", ",")} €`
                    : ""
              }
              sensible
              hidden={hidden}
            />
            <Tuile label="VUES · 30 J" valeur={nombre(youtube.vues)} sous="" hidden={false} />
            <Tuile
              label="ABONNÉS GAGNÉS · 30 J"
              valeur={`${youtube.abonnesGagnes >= 0 ? "+" : ""}${nombre(youtube.abonnesGagnes)}`}
              sous={youtube.abonnesTotal !== null ? `${nombre(youtube.abonnesTotal)} au total` : ""}
              hidden={false}
            />
            <Tuile
              label="TEMPS DE VISIONNAGE · 30 J"
              valeur={`${nombre(Math.round(youtube.minutesVisionnees / 60))} h`}
              sous=""
              hidden={false}
            />
          </div>

          <Panel accent="var(--color-ver)" size="sm">
            <div
              className="mb-3 text-[10.5px] font-extrabold tracking-[0.12em]"
              style={{ color: "var(--color-ver-soft)" }}
            >
              VUES PAR JOUR · 30 DERNIERS JOURS
            </div>
            {youtube.parJour.length === 0 ? (
              <EmptyState hint="Les données quotidiennes arriveront à la prochaine synchro.">
                Pas encore de détail quotidien
              </EmptyState>
            ) : (
              <div className="flex items-end gap-[3px]" style={{ height: CHART_HEIGHT + 20 }}>
                {youtube.parJour.map((j) => (
                  <div
                    key={j.date}
                    title={`${j.date} — ${nombre(j.vues)} vues`}
                    className="flex-1 rounded-t-[3px] transition-all hover:brightness-125"
                    style={{
                      height: Math.max(Math.round((j.vues / maxVues) * CHART_HEIGHT), 2),
                      background: "linear-gradient(180deg,#3ddc84,#22d3ee)",
                    }}
                  />
                ))}
              </div>
            )}
          </Panel>

          <div className="mt-[10px] text-center text-[11px] text-white/25">
            Chiffres estimés par YouTube Analytics — ils se stabilisent après quelques jours.
          </div>
        </>
      )}
    </>
  );
}

function Tuile({
  label,
  valeur,
  sous,
  hidden,
  sensible,
}: {
  label: string;
  valeur: string;
  sous: string;
  hidden: boolean;
  sensible?: boolean;
}) {
  return (
    <Panel accent="var(--color-ver)" size="sm" className="px-[17px] py-[15px]">
      <div className="text-[11px] font-bold text-white/45">{label}</div>
      <Amount hidden={hidden && Boolean(sensible)} className="mt-[5px] block text-[22px] font-black">
        {valeur}
      </Amount>
      {sous && (
        <div className="mt-[2px] text-[11px] font-extrabold" style={{ color: "var(--color-ver-soft)" }}>
          {sous}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Mode démo — le jeu factice d'origine                                */
/* ------------------------------------------------------------------ */

function RevenusDemo({ hidden, data }: { hidden: boolean; data: ReturnType<typeof useOs>["data"] }) {
  const rev = data.revenue;
  return (
    <>
      <ViewHeader title="Revenus" action={<RevealButton large />} />
      <div className="mb-[14px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {rev.stats.map((s) => (
          <Panel key={s.label} accent="var(--color-ver)" size="sm" className="px-[17px] py-[15px]">
            <div className="text-[11px] font-bold text-white/45">{s.label}</div>
            <Amount hidden={hidden && s.sensitive} className="mt-[5px] block text-[22px] font-black">
              {s.value}
            </Amount>
            <div className="mt-[2px] text-[11px] font-extrabold" style={{ color: "var(--color-ver-soft)" }}>
              {s.delta}
            </div>
          </Panel>
        ))}
      </div>
      <Panel accent="var(--color-ver)" size="sm">
        <div className="flex h-[150px] items-end gap-[14px] px-1">
          {rev.history.map((b, i) => (
            <div key={b.month} className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]">
              <Amount hidden={hidden} className="text-[10.5px] font-extrabold text-white/60">
                {(b.value / 1000).toFixed(1)}k
              </Amount>
              <div
                className="w-[26px] rounded-t-lg rounded-b-[3px]"
                style={{
                  height: Math.round((b.value / rev.historyMax) * CHART_HEIGHT),
                  background:
                    i === rev.history.length - 1
                      ? "linear-gradient(180deg,#3ddc84,#22d3ee)"
                      : "rgba(61,220,132,0.35)",
                }}
              />
              <div className="text-[11px] font-bold text-white/45">{b.month}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
