"use client";

import { useEffect, useState } from "react";

import { useOs } from "@/lib/os-context";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { Chip, EmptyState } from "@/components/ui";
import { ORDRE_QUADRANTS, QUADRANTS, type Quadrant } from "@/lib/eisenhower";
import type { TacheOubliee } from "@/lib/oublies-db";

/**
 * LES OUBLIÉS — l'archive de ce qui traîne, rangée en matrice d'Eisenhower.
 *
 * Une tâche secondaire ou annexe qui passe quatre jours sans être cochée
 * quitte la todo toute seule et atterrit ici. Elle ne s'y empile pas : elle
 * tombe dans l'une des quatre cases — important ou non, urgent ou non — et
 * chaque case appelle un geste précis. Reprendre depuis « Faire » ramène la
 * tâche en focus principal, depuis « Planifier » en secondaire, depuis
 * « Déléguer » en annexe : la grille pilote la todo au lieu de la commenter.
 *
 * Le rangement d'office se déduit du niveau d'origine et de l'âge ; Twaylo le
 * corrige d'un geste, et son choix est mémorisé.
 */

/** Plus c'est vieux, plus ça chauffe — même échelle que les blocages. */
function couleurAge(jours: number): string {
  if (jours >= 14) return "var(--color-mag)";
  if (jours >= 7) return "var(--color-cor)";
  return "var(--color-amb)";
}

/* Jeu de démonstration, pour filmer sans exposer les vraies traînantes. */
const DEMO: TacheOubliee[] = [
  { id: "o1", titre: "Répondre au mail de la marque de VPN", categorie: "Business", urgence: "aujourdhui", jours: 6, quadrant: "faire", quadrantChoisi: false },
  { id: "o2", titre: "Trier le disque dur des rushs 2025", categorie: null, urgence: "semaine", jours: 9, quadrant: "planifier", quadrantChoisi: false },
  { id: "o3", titre: "Tester le nouveau plugin de sous-titres", categorie: "Contenu", urgence: "mois", jours: 5, quadrant: "deleguer", quadrantChoisi: true },
  { id: "o4", titre: "Ranger les vieux projets Premiere", categorie: null, urgence: "un_jour", jours: 21, quadrant: "eliminer", quadrantChoisi: false },
];

export function OubliesView() {
  const { demoMode, reprendreOublie } = useOs();
  const [oubliees, setOubliees] = useState<TacheOubliee[] | null>(null);

  useEffect(() => {
    if (demoMode) {
      setOubliees(DEMO);
      return;
    }
    let annule = false;
    void fetch("/api/oublies")
      .then((r) => r.json())
      .then((d: { oubliees?: TacheOubliee[] }) => {
        if (!annule) setOubliees(Array.isArray(d.oubliees) ? d.oubliees : []);
      })
      .catch((err) => {
        console.error("[oublies] lecture impossible :", err);
        if (!annule) setOubliees([]);
      });
    return () => {
      annule = true;
    };
  }, [demoMode]);

  /**
   * Retour dans la todo, au niveau que dicte la case. L'oublié disparaît d'ici
   * et réapparaît en tête de sa section, sans rechargement. Un échec le remet
   * dans l'archive plutôt que de le faire disparaître des deux côtés.
   */
  function reprendre(o: TacheOubliee) {
    const avant = oubliees;
    setOubliees((prev) => (prev ? prev.filter((x) => x.id !== o.id) : prev));
    void reprendreOublie(o.id, QUADRANTS[o.quadrant].niveauRetour).then((ok) => {
      if (!ok) setOubliees(avant);
    });
  }

  function classer(id: string, quadrant: Quadrant) {
    setOubliees((prev) =>
      prev
        ? prev.map((o) => (o.id === id ? { ...o, quadrant, quadrantChoisi: true } : o))
        : prev,
    );
    if (demoMode) return;
    void fetch("/api/oublies", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, quadrant }),
    }).catch((err) => console.error("[oublies] classement impossible :", err));
  }

  function jeter(id: string) {
    setOubliees((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    if (demoMode) return;
    void fetch(`/api/oublies?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      (err) => console.error("[oublies] suppression impossible :", err),
    );
  }

  if (oubliees === null) {
    return (
      <Panel accent="var(--color-cor)">
        <div className="py-8 text-center text-[13px] font-bold text-white/30">
          Ouverture de l&apos;archive…
        </div>
      </Panel>
    );
  }

  if (oubliees.length === 0) {
    return (
      <div className="flex flex-col gap-[14px]">
        <EnTete total={0} />
        <Panel accent="var(--color-ver)">
          <EmptyState hint="Quand une tâche secondaire ou annexe traînera 4 jours, elle glissera ici et prendra sa place dans la matrice.">
            Rien d&apos;oublié — ta liste est saine. 👌
          </EmptyState>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <EnTete total={oubliees.length} />

      {/* La matrice : deux lignes, deux colonnes. La ligne du haut est
          l'important ; la colonne de gauche, l'urgent. */}
      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        {ORDRE_QUADRANTS.map((q) => {
          const meta = QUADRANTS[q];
          // Les plus anciens d'abord : ce sont eux qui réclament une décision.
          const items = oubliees
            .filter((o) => o.quadrant === q)
            .sort((a, b) => b.jours - a.jours);

          return (
            <Panel key={q} accent={meta.couleur} size="sm">
              <div className="mb-[10px] flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[11px] font-black tracking-[0.12em]"
                    style={{ color: meta.couleur }}
                  >
                    {meta.nom}
                  </div>
                  <div className="text-[9px] font-bold tracking-[0.08em] text-white/30">
                    {meta.sousTitre.toUpperCase()}
                  </div>
                </div>
                <span className="flex-none text-right">
                  <span
                    className="font-mono text-[13px] font-black"
                    style={{ color: meta.couleur }}
                  >
                    {items.length}
                  </span>
                  <span className="block text-[9px] font-bold text-white/25">
                    {meta.action}
                  </span>
                </span>
              </div>

              {items.length === 0 ? (
                <div className="py-[14px] text-center text-[11px] font-bold text-white/20">
                  Cette case est vide.
                </div>
              ) : (
                <div className="flex flex-col gap-[7px]">
                  {items.map((o) => (
                    <CarteOubliee
                      key={o.id}
                      o={o}
                      onReprendre={() => reprendre(o)}
                      onClasser={(vers) => classer(o.id, vers)}
                      onJeter={() => jeter(o.id)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel accent="rgba(255,255,255,0.15)" size="sm" hover={false}>
        <div className="text-[11.5px] leading-[1.5] text-white/40">
          Comment ça marche : une tâche <b>secondaire</b> ou <b>annexe</b> qui reste 4 jours
          sans coche quitte ta todo et arrive ici, rangée d&apos;office selon son niveau et
          son âge — à toi de trancher, ton choix est mémorisé. <b>Reprendre</b> la renvoie
          dans la todo au niveau que dicte sa case ({QUADRANTS.faire.nom.toLowerCase()} →
          focus principal, {QUADRANTS.planifier.nom.toLowerCase()} → secondaire,{" "}
          {QUADRANTS.deleguer.nom.toLowerCase()} → annexe), compteur remis à zéro. Le focus
          principal du jour n&apos;est jamais archivé automatiquement, et rien ne
          s&apos;efface tout seul.
        </div>
      </Panel>
    </div>
  );
}

function EnTete({ total }: { total: number }) {
  return (
    <ViewHeader
      title="Les Oubliés"
      subtitle={
        total > 0
          ? `${total} en attente d'une décision — rangés par importance et urgence.`
          : "Ce qui a traîné 4 jours sans être coché atterrit ici, dans la matrice."
      }
    />
  );
}

function CarteOubliee({
  o,
  onReprendre,
  onClasser,
  onJeter,
}: {
  o: TacheOubliee;
  onReprendre: () => void;
  onClasser: (vers: Quadrant) => void;
  onJeter: () => void;
}) {
  const c = couleurAge(o.jours);
  const meta = QUADRANTS[o.quadrant];

  return (
    <div
      className="rounded-[11px] px-[10px] py-[8px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start gap-[9px]">
        {/* Le compteur de jours — ce qui rend l'oubli visible. */}
        <span
          className="flex h-[30px] w-[36px] flex-none items-center justify-center rounded-[8px] font-mono text-[12px] font-black"
          style={{
            color: c,
            background: `color-mix(in srgb, ${c} 12%, transparent)`,
            border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`,
          }}
          title={`En attente depuis ${o.jours} jours`}
        >
          J{o.jours}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-extrabold leading-[1.35]">{o.titre}</div>
          <div className="mt-[3px] flex flex-wrap items-center gap-[6px]">
            {o.categorie && <Chip label={o.categorie} color="rgba(255,255,255,0.5)" subtle />}
            {!o.quadrantChoisi && (
              <span className="text-[9px] font-bold tracking-[0.06em] text-white/25">
                RANGÉ D&apos;OFFICE
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
        <button
          type="button"
          onClick={onReprendre}
          title={`Remettre dans la todo — ${meta.niveauRetour}, compteur remis à zéro`}
          className="cursor-pointer rounded-[8px] px-[10px] py-[4px] text-[11px] font-extrabold transition-all hover:brightness-125"
          style={{ color: "#07121d", background: "var(--color-ver)" }}
        >
          ↩ Reprendre
        </button>

        {/* Déplacer dans une autre case : un menu tient au doigt, contrairement
            à un glisser-déposer entre quatre panneaux. */}
        <select
          value={o.quadrant}
          onChange={(e) => onClasser(e.target.value as Quadrant)}
          aria-label={`Case de « ${o.titre} »`}
          title="Changer de case"
          className="cursor-pointer rounded-[8px] px-[6px] py-[4px] text-[10.5px] font-extrabold outline-none [color-scheme:dark]"
          style={{
            color: meta.couleur,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {ORDRE_QUADRANTS.map((q) => (
            <option key={q} value={q}>
              {QUADRANTS[q].nom}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onJeter}
          title="Jeter pour de bon"
          aria-label={`Jeter ${o.titre}`}
          className="ml-auto cursor-pointer rounded-[8px] px-[8px] py-[4px] text-[11px] font-extrabold transition-all hover:brightness-125"
          style={{
            color: "var(--color-mag-soft)",
            background: "rgba(255,61,139,0.1)",
            border: "1px solid rgba(255,61,139,0.25)",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
