"use client";

import { Panel } from "@/components/Panel";
import { Eyebrow } from "@/components/ui";
import { useOs } from "@/lib/os-context";
import { useProgression } from "@/lib/progression-context";
import { BAREME, BONUS, bonusMerites } from "@/lib/xp";

/**
 * La carte de progression — le compteur qui donne envie de cocher.
 *
 * Trois choses, dans cet ordre : où j'en suis (niveau et barre), ce que
 * j'ai gagné aujourd'hui, et ce qu'il reste à prendre avant ce soir. La
 * troisième est la plus importante : un compteur qui dit seulement le passé
 * ne fait rien faire. « Il te manque 2 blocs pour +40 » fait lever.
 */
export function ProgressionCard() {
  const { demoMode } = useOs();
  const { pret, palier, xpJour, detailJour, jour, serie, prochainPalierSerie } =
    useProgression();

  if (demoMode) {
    return (
      <Panel accent="var(--color-amb)" size="sm">
        <Eyebrow color="var(--color-amb-soft)" dot="var(--color-amb)">
          PROGRESSION
        </Eyebrow>
        <div className="py-6 text-center text-[12px] font-bold text-white/30">
          Masquée en mode démo.
        </div>
      </Panel>
    );
  }

  const acquis = new Set(jour.bonus);
  const merites = new Set(bonusMerites(jour));
  const ecartAcquis = xpJour - detailJour.reduce((n, l) => n + l.xp, 0);

  /* Ce qu'il reste à prendre aujourd'hui — uniquement des choses atteignables. */
  const restants: { texte: string; xp: number; couleur: string }[] = [];
  const blocsRestants = Math.max(0, jour.blocsTotal - jour.blocsFaits);
  const habRestantes = Math.max(0, jour.habitudesTotal - jour.habitudesFaites);
  const focusRestants = Math.max(0, jour.principalesTotal - jour.principalesFaites);

  if (blocsRestants > 0) {
    restants.push({
      texte: `${blocsRestants} bloc${blocsRestants > 1 ? "s" : ""} de journée type`,
      xp: blocsRestants * BAREME.bloc + (acquis.has("journee") ? 0 : bonusXp("journee")),
      couleur: "var(--color-cya)",
    });
  }
  if (habRestantes > 0) {
    restants.push({
      texte: `${habRestantes} habitude${habRestantes > 1 ? "s" : ""}`,
      xp: habRestantes * BAREME.habitude + (acquis.has("habitudes") ? 0 : bonusXp("habitudes")),
      couleur: "var(--color-ver)",
    });
  }
  if (focusRestants > 0) {
    restants.push({
      texte: `${focusRestants} focus principal${focusRestants > 1 ? "s" : ""}`,
      xp:
        focusRestants * BAREME.tachePrincipale + (acquis.has("focus") ? 0 : bonusXp("focus")),
      couleur: "var(--color-mag)",
    });
  }
  if (!jour.journalEcrit) {
    restants.push({ texte: "Le journal du soir", xp: BAREME.journal, couleur: "var(--color-vio)" });
  }

  const parfaitePossible =
    !acquis.has("parfaite") &&
    jour.blocsTotal > 0 &&
    jour.habitudesTotal > 0 &&
    jour.principalesTotal > 0;

  return (
    <Panel
      accent={palier.couleur}
      size="sm"
      style={{ border: `1px solid ${palier.couleur}33` }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-[150px] w-[150px] rounded-full blur-[60px]"
        style={{ background: `${palier.couleur}20` }}
        aria-hidden
      />

      <div className="relative mb-[10px] flex items-center justify-between gap-2">
        <Eyebrow color={palier.couleur} dot={palier.couleur}>
          PROGRESSION
        </Eyebrow>
        {serie > 0 && (
          <span
            className="flex-none rounded-full px-[8px] py-[3px] font-mono text-[10.5px] font-black"
            style={{ color: "#ff7a3d", background: "rgba(255,122,61,0.12)" }}
            title={
              prochainPalierSerie
                ? `Prochain palier : ${prochainPalierSerie} jours`
                : "Série en cours"
            }
          >
            🔥 {serie} j
          </span>
        )}
      </div>

      <div className="relative flex items-center gap-[13px]">
        <div
          className="flex h-[52px] w-[52px] flex-none flex-col items-center justify-center rounded-[15px] leading-none"
          style={{
            color: palier.couleur,
            background: `radial-gradient(circle at 50% 35%, ${palier.couleur}30, transparent 70%)`,
            border: `2px solid ${palier.couleur}`,
            boxShadow: `0 0 18px -4px ${palier.couleur}`,
          }}
        >
          <span className="text-[8px] font-black tracking-[0.1em] opacity-60">NIV</span>
          <span className="font-mono text-[21px] font-black">{pret ? palier.niveau : "—"}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="truncate text-[13px] font-black tracking-[0.02em]"
              style={{ color: palier.couleur }}
            >
              {palier.grade}
            </span>
            <span className="flex-none font-mono text-[10.5px] font-bold text-white/35">
              {pret ? `${palier.dansNiveau} / ${palier.pourNiveau}` : "…"}
            </span>
          </div>

          <div
            className="mt-[6px] h-[8px] w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${xpJour > 0 ? "barre-xp-vive" : ""}`}
              style={{
                width: `${Math.round((pret ? palier.fraction : 0) * 100)}%`,
                background: `linear-gradient(90deg, ${palier.couleur}88, ${palier.couleur})`,
                boxShadow: `0 0 10px -1px ${palier.couleur}`,
              }}
            />
          </div>

          <div className="mt-[6px] text-[10.5px] font-bold text-white/35">
            {pret
              ? `Encore ${palier.pourNiveau - palier.dansNiveau} XP avant le niveau ${palier.niveau + 1}`
              : "Lecture de ta progression…"}
          </div>
        </div>
      </div>

      {/* L'XP du jour, avec son détail — un chiffre expliqué motive, un chiffre nu non. */}
      <div className="subpanel relative mt-[11px] px-[11px] py-[9px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-black tracking-[0.1em] text-white/35">
            AUJOURD&apos;HUI
          </span>
          <span
            className="font-mono text-[17px] font-black"
            style={{ color: xpJour > 0 ? "var(--color-ver)" : "rgba(255,255,255,0.25)" }}
          >
            +{xpJour} XP
          </span>
        </div>

        {detailJour.length > 0 ? (
          <div className="mt-[7px] flex flex-wrap gap-[5px]">
            {/*
              Le total peut dépasser la somme des étiquettes : archiver la todo
              retire les tâches faites de la liste vivante, mais pas les points
              qu'elles ont rapportés. On nomme l'écart au lieu de laisser deux
              chiffres se contredire.
            */}
            {ecartAcquis > 0 && (
              <span
                className="rounded-full px-[7px] py-[2px] text-[10px] font-bold text-white/55"
                style={{ background: "rgba(255,255,255,0.05)" }}
                title="Points gagnés plus tôt dans la journée, sur des tâches désormais archivées"
              >
                ⏳ acquis plus tôt <span className="font-mono text-white/35">+{ecartAcquis}</span>
              </span>
            )}
            {detailJour.map((l) => (
              <span
                key={l.label}
                className="rounded-full px-[7px] py-[2px] text-[10px] font-bold text-white/55"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                {l.emoji} {l.label} <span className="font-mono text-white/35">+{l.xp}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-[6px] text-[11px] font-semibold text-white/30">
            Rien encore. La première coche débloque tout le reste.
          </div>
        )}
      </div>

      {/* Ce qu'il reste à prendre — la partie qui fait agir. */}
      {restants.length > 0 && (
        <div className="relative mt-[10px]">
          <div className="mb-[6px] text-[10px] font-black tracking-[0.1em] text-white/30">
            À PRENDRE AVANT CE SOIR
          </div>
          <div className="flex flex-col gap-[5px]">
            {restants.map((r) => (
              <div key={r.texte} className="flex items-center gap-[7px]">
                <span
                  className="h-[5px] w-[5px] flex-none rounded-full"
                  style={{ background: r.couleur }}
                />
                <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-white/60">
                  {r.texte}
                </span>
                <span className="flex-none font-mono text-[11px] font-black text-white/40">
                  +{r.xp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Les bonus du jour : gagné, à portée, ou hors d'atteinte aujourd'hui. */}
      <div className="relative mt-[11px] flex flex-wrap gap-[5px]">
        {BONUS.filter((b) => b.id !== "parfaite" || parfaitePossible || acquis.has("parfaite")).map(
          (b) => {
            const gagne = acquis.has(b.id) || merites.has(b.id);
            return (
              <span
                key={b.id}
                title={`${b.label} — +${b.xp} XP`}
                className="rounded-full px-[8px] py-[3px] text-[10px] font-black"
                style={
                  gagne
                    ? { color: "#07121d", background: "var(--color-ver)" }
                    : {
                        color: "rgba(255,255,255,0.35)",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px dashed rgba(255,255,255,0.12)",
                      }
                }
              >
                {b.emoji} {b.label} {gagne ? "✓" : `+${b.xp}`}
              </span>
            );
          },
        )}
      </div>
    </Panel>
  );
}

function bonusXp(id: string): number {
  return BONUS.find((b) => b.id === id)?.xp ?? 0;
}
