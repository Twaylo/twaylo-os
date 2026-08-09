"use client";

import { Panel } from "@/components/Panel";
import { Eyebrow } from "@/components/ui";
import { useProgression } from "@/lib/progression-context";
import { localDateKey } from "@/lib/local-date";

/**
 * Les analytiques du jeu : la courbe d'XP, les records, les exploits.
 *
 * Le reste du bilan répond à « est-ce que je tiens mes habitudes ». Celui-ci
 * répond à « est-ce que je monte », ce qui n'est pas la même question : on
 * peut tenir ses habitudes et stagner, ou casser une série et faire son plus
 * gros mois. Les deux lectures sont utiles, elles ne se remplacent pas.
 */

function dateCourte(jour: string): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Recule de n jours, en UTC pour ne pas sauter d'heure d'été. */
function decaler(jour: string, delta: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function ProgressionPanel() {
  const {
    pret,
    palier,
    xpTotal,
    xpJour,
    serie,
    meilleureSerie,
    record,
    cumuls,
    exploits,
    jours,
  } = useProgression();

  if (!pret) {
    return (
      <Panel accent="var(--color-vio)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Lecture de ta progression…
        </div>
      </Panel>
    );
  }

  /*
   * Trente jours pleins, y compris ceux à zéro.
   *
   * N'afficher que les jours présents en base donnerait une courbe menteuse :
   * une semaine d'absence se serait tassée en un trait continu, comme si rien
   * ne s'était passé. Les trous doivent se voir — c'est même la seule chose
   * que ce graphique doit rendre évidente.
   */
  const aujourdhui = localDateKey();
  const parJour = new Map(jours.map((j) => [j.jour, j.xp]));
  const fenetre: { jour: string; xp: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const j = decaler(aujourdhui, -i);
    fenetre.push({ jour: j, xp: j === aujourdhui ? xpJour : (parJour.get(j) ?? 0) });
  }

  const maxi = Math.max(60, ...fenetre.map((f) => f.xp));
  const sept = fenetre.slice(-7).reduce((n, f) => n + f.xp, 0);
  const septAvant = fenetre.slice(-14, -7).reduce((n, f) => n + f.xp, 0);
  const tendance = septAvant > 0 ? Math.round(((sept - septAvant) / septAvant) * 100) : null;
  const moyenne = Math.round(fenetre.reduce((n, f) => n + f.xp, 0) / fenetre.length);

  const debloques = exploits.filter((e) => e.debloque);
  const aVenir = exploits.filter((e) => !e.debloque);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* ---- La bannière : niveau, XP, série, record ---- */}
      <Panel accent={palier.couleur} style={{ border: `1px solid ${palier.couleur}33` }}>
        <div
          className="pointer-events-none absolute -left-10 -top-10 h-[190px] w-[190px] rounded-full blur-[70px]"
          style={{ background: `${palier.couleur}1f` }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center gap-x-[26px] gap-y-[14px]">
          <div className="flex min-w-[230px] flex-1 items-center gap-[16px]">
            <div
              className="flex h-[66px] w-[66px] flex-none flex-col items-center justify-center rounded-[18px] leading-none"
              style={{
                color: palier.couleur,
                background: `radial-gradient(circle at 50% 35%, ${palier.couleur}30, transparent 70%)`,
                border: `2px solid ${palier.couleur}`,
                boxShadow: `0 0 22px -4px ${palier.couleur}`,
              }}
            >
              <span className="text-[8.5px] font-black tracking-[0.12em] opacity-60">NIVEAU</span>
              <span className="font-mono text-[27px] font-black">{palier.niveau}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="text-[15px] font-black tracking-[0.02em]"
                style={{ color: palier.couleur, textShadow: `0 0 14px ${palier.couleur}55` }}
              >
                {palier.grade}
              </div>
              <div
                className="mt-[7px] h-[8px] w-full overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(palier.fraction * 100)}%`,
                    background: `linear-gradient(90deg, ${palier.couleur}88, ${palier.couleur})`,
                    boxShadow: `0 0 10px -1px ${palier.couleur}`,
                  }}
                />
              </div>
              <div className="mt-[6px] font-mono text-[10.5px] font-bold text-white/35">
                {palier.dansNiveau} / {palier.pourNiveau} XP · {xpTotal.toLocaleString("fr-FR")} XP
                au total
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-[20px] gap-y-[10px]">
            <Stat label="SÉRIE" valeur={`${serie} j`} couleur="#ff7a3d" />
            <Stat label="MEILLEURE SÉRIE" valeur={`${meilleureSerie} j`} />
            <Stat
              label="RECORD SUR UN JOUR"
              valeur={record ? `${record.xp} XP` : "—"}
              sous={record ? dateCourte(record.jour) : undefined}
            />
            <Stat label="MOYENNE 30 J" valeur={`${moyenne} XP`} />
            <Stat
              label="7 DERNIERS JOURS"
              valeur={`${sept} XP`}
              sous={tendance === null ? undefined : `${tendance >= 0 ? "+" : ""}${tendance} %`}
              couleur={
                tendance === null
                  ? undefined
                  : tendance >= 0
                    ? "var(--color-ver-soft)"
                    : "var(--color-mag-soft)"
              }
            />
          </div>
        </div>
      </Panel>

      {/* ---- La courbe des trente jours ---- */}
      <Panel accent="var(--color-cya)" size="sm">
        <div className="mb-[12px] flex items-center justify-between gap-3">
          <Eyebrow color="var(--color-cya-soft)" dot="var(--color-cya)">
            XP DES 30 DERNIERS JOURS
          </Eyebrow>
          <span className="flex-none font-mono text-[10.5px] text-white/30">
            max {maxi} XP
          </span>
        </div>

        <div className="flex h-[110px] items-end gap-[3px]">
          {fenetre.map((f) => {
            const part = f.xp / maxi;
            const cejour = f.jour === aujourdhui;
            return (
              <div
                key={f.jour}
                className="group relative flex-1 rounded-t-[3px] transition-all"
                title={`${dateCourte(f.jour)} — ${f.xp} XP`}
                style={{
                  height: `${Math.max(f.xp > 0 ? 6 : 2, part * 100)}%`,
                  background:
                    f.xp === 0
                      ? "rgba(255,255,255,0.06)"
                      : cejour
                        ? "var(--color-amb)"
                        : `color-mix(in srgb, var(--color-cya) ${Math.round(35 + part * 65)}%, transparent)`,
                  boxShadow: cejour ? "0 0 12px -2px var(--color-amb)" : undefined,
                }}
              />
            );
          })}
        </div>
        <div className="mt-[6px] flex justify-between font-mono text-[9.5px] text-white/25">
          <span>{dateCourte(fenetre[0].jour)}</span>
          <span>aujourd&apos;hui</span>
        </div>
      </Panel>

      {/* ---- Les compteurs de toujours ---- */}
      <Panel accent="var(--color-ver)" size="sm">
        <Eyebrow color="var(--color-ver-soft)" dot="var(--color-ver)">
          DEPUIS LE DÉBUT
        </Eyebrow>
        <div className="mt-[10px] grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-6">
          <Compteur emoji="📅" valeur={cumuls.blocs} label="blocs cochés" />
          <Compteur emoji="☑️" valeur={cumuls.habitudes} label="habitudes" />
          <Compteur emoji="⭐" valeur={cumuls.taches} label="tâches bouclées" />
          <Compteur emoji="✍️" valeur={cumuls.journaux} label="journaux" />
          <Compteur emoji="🏆" valeur={cumuls.parfaites} label="journées parfaites" />
          <Compteur emoji="🗓" valeur={cumuls.joursRemplis} label="jours tenus" />
        </div>
      </Panel>

      {/* ---- Les exploits ---- */}
      <Panel accent="var(--color-vio)" size="sm">
        <div className="mb-[10px] flex items-center justify-between gap-3">
          <Eyebrow color="var(--color-vio-soft)" dot="var(--color-vio)">
            EXPLOITS
          </Eyebrow>
          <span className="flex-none font-mono text-[10.5px] text-white/30">
            {debloques.length} / {exploits.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2 lg:grid-cols-3">
          {[...debloques, ...aVenir].map((e) => (
            <div
              key={e.id}
              className="subpanel flex items-center gap-[10px] px-[11px] py-[9px]"
              style={
                e.debloque
                  ? { border: "1px solid rgba(176,107,255,0.35)" }
                  : { opacity: 0.55 }
              }
            >
              <span
                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] text-[17px]"
                style={{
                  background: e.debloque ? "rgba(176,107,255,0.16)" : "rgba(255,255,255,0.04)",
                  filter: e.debloque ? undefined : "grayscale(1)",
                }}
              >
                {e.emoji}
              </span>
              <div className="min-w-0 flex-1 leading-[1.3]">
                <div className="truncate text-[12.5px] font-extrabold">{e.nom}</div>
                <div className="truncate text-[10.5px] font-semibold text-white/40">
                  {e.debloque ? e.description : `${e.valeur} / ${e.seuil}`}
                </div>
                {!e.debloque && (
                  <div
                    className="mt-[4px] h-[3px] w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((e.valeur / e.seuil) * 100)}%`,
                        background: "var(--color-vio)",
                      }}
                    />
                  </div>
                )}
              </div>
              {e.debloque && (
                <span className="flex-none text-[12px] font-black text-[color:var(--color-vio-soft)]">
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  label,
  valeur,
  sous,
  couleur,
}: {
  label: string;
  valeur: string;
  sous?: string;
  couleur?: string;
}) {
  return (
    <div className="leading-[1.25]">
      <div className="text-[8.5px] font-black tracking-[0.12em] text-white/30">{label}</div>
      <div
        className="font-mono text-[14px] font-black"
        style={couleur ? { color: couleur } : undefined}
      >
        {valeur}
      </div>
      {sous && <div className="font-mono text-[9.5px] text-white/30">{sous}</div>}
    </div>
  );
}

function Compteur({
  emoji,
  valeur,
  label,
}: {
  emoji: string;
  valeur: number;
  label: string;
}) {
  return (
    <div className="subpanel px-[10px] py-[8px] text-center leading-[1.25]">
      <div className="text-[15px]">{emoji}</div>
      <div className="font-mono text-[16px] font-black">{valeur.toLocaleString("fr-FR")}</div>
      <div className="text-[9.5px] font-bold text-white/35">{label}</div>
    </div>
  );
}
