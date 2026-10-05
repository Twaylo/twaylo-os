"use client";

import { useMemo, useState } from "react";
import {
  COLONNES_KANBAN,
  OBJECTIFS_P90,
  RESPONSABLES,
  colonneDe,
  joursRestants,
  nomObjectif,
  ordreParPriorite,
  type ColonneKanban,
  type Responsable,
} from "@/lib/p90";
import { emojiVisible } from "@/lib/emoji-tache";
import { useCockpit, type TacheVue } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import { Bouton, Carte, Etiq, Meta, Puce, Vide, formaterJour } from "@/components/p90/ui";

/**
 * LE KANBAN — la MÊME donnée que la todo, vue autrement.
 *
 * Une tâche = une carte, zéro doublon. Les colonnes ne sont pas une liste à
 * part : « À faire », « En cours » et « Fait » sont le `statut` de la ligne, et
 * « Bloqué » un drapeau sur la même ligne. Cocher ici coche là-bas, dans la
 * même seconde, parce que c'est la même tâche.
 *
 * Pourquoi un Kanban en plus de la todo : la todo répond à « que dois-je faire
 * maintenant », le Kanban à « où en est le projet ». Même donnée, deux
 * questions — et la seconde se pose à cinq personnes, pas à soi.
 */

export function KanbanView() {
  const { aujourdhui, taches, pret, deplacerColonne, basculerFaite, reordonner } = useCockpit();

  const [filtreObjectif, setFiltreObjectif] = useState<string | null>(null);
  const [filtreQui, setFiltreQui] = useState<Responsable | null>(null);

  /** Les cartes retenues par les filtres. */
  const retenues = useMemo(
    () =>
      taches.filter((t) => {
        if (filtreObjectif && t.meta.objectif !== filtreObjectif) return false;
        if (filtreQui && !t.meta.responsables.includes(filtreQui)) return false;
        return true;
      }),
    [taches, filtreObjectif, filtreQui],
  );

  /*
   * À l'intérieur d'une colonne, les cartes sont rangées PAR PRIORITÉ.
   *
   * Un Kanban qui suit l'ordre d'insertion met la carte la plus urgente en
   * douzième position : la colonne « À faire » devient un tas, et le regarder
   * n'apprend rien. Ici le haut de chaque colonne est ce qui doit partir
   * d'abord — même règle que les trois priorités de la todo, un seul calcul
   * pour les deux écrans.
   */
  const ordonnees = useMemo(() => ordreParPriorite(retenues, aujourdhui), [retenues, aujourdhui]);

  const colonneParId = useMemo(() => {
    const m = new Map<string, ColonneKanban>();
    for (const t of ordonnees) m.set(t.id, colonneDe(t.statut, t.meta.bloque));
    return m;
  }, [ordonnees]);

  const ordreAffiche = useMemo(() => ordonnees.map((t) => t.id), [ordonnees]);

  const { dragId, ordreVisuel, zoneCourante, commencerDrag, setRowRef, setZoneRef, grilleRef, glissementArmeRef } =
    useGlisser<ColonneKanban>({
      ordre: ordreAffiche,
      zoneDe: (id) => colonneParId.get(id) ?? "afaire",
      onDepot: (_ids, changement) => {
        /*
         * Seul le CHANGEMENT DE COLONNE est enregistré.
         *
         * L'ordre à l'intérieur d'une colonne est calculé — déplacer une carte
         * vers le haut de « À faire » ne veut rien dire ici, puisque la
         * priorité décide. L'écrire quand même aurait silencieusement réécrit
         * l'ordre de la todo, où il a un sens, lui.
         */
        if (changement) void deplacerColonne(changement.id, changement.zone);
      },
      zoneParDefaut: "afaire",
    });

  const parId = useMemo(() => new Map(ordonnees.map((t) => [t.id, t])), [ordonnees]);
  const affichees: TacheVue[] = dragId
    ? ordreVisuel.map((id) => parId.get(id)).filter((t): t is TacheVue => Boolean(t))
    : ordonnees;

  const parColonne = COLONNES_KANBAN.map((c) => ({
    colonne: c,
    items: affichees.filter((t) =>
      t.id === dragId ? zoneCourante === c.id : colonneDe(t.statut, t.meta.bloque) === c.id,
    ),
  }));

  // `reordonner` est importé pour la cohérence de l'interface du contexte mais
  // n'est pas utilisé ici : voir le commentaire de `onDepot` ci-dessus.
  void reordonner;

  return (
    <div className="entree-vue space-y-[13px]">
      {/*
        Les filtres à nu, sans carte autour.
        Une carte sert à grouper ce qui se lit ; une rangée de boutons se lit
        déjà comme une rangée de boutons, et l'encadrer repoussait les quatre
        colonnes — le contenu de l'écran — d'un cran vers le bas.
      */}
      <div className="space-y-[5px]">
        <div className="flex flex-wrap items-center gap-[5px]">
          <Etiq>Objectif</Etiq>
          {OBJECTIFS_P90.map((o) => (
            <Puce
              key={o.id}
              actif={filtreObjectif === o.id}
              ton={o.id === "momentum" ? "accent" : "neutre"}
              onClick={() => setFiltreObjectif(filtreObjectif === o.id ? null : o.id)}
            >
              {o.nom}
            </Puce>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-[5px]">
          <Etiq>Qui</Etiq>
          {RESPONSABLES.map((r) => (
            <Puce key={r} actif={filtreQui === r} onClick={() => setFiltreQui(filtreQui === r ? null : r)}>
              {r}
            </Puce>
          ))}
          {(filtreObjectif || filtreQui) && (
            <Bouton
              className="ml-[5px]"
              onClick={() => {
                setFiltreObjectif(null);
                setFiltreQui(null);
              }}
            >
              Tout voir
            </Bouton>
          )}
        </div>
      </div>

      {!pret && taches.length === 0 && (
        <Carte>
          <Vide>Lecture des tâches…</Vide>
        </Carte>
      )}

      <div ref={grilleRef} className="grid grid-cols-1 gap-[11px] md:grid-cols-2 xl:grid-cols-4">
        {parColonne.map(({ colonne, items }) => (
          <Carte
            key={colonne.id}
            innerRef={setZoneRef(colonne.id)}
            zone={colonne.id}
            className={`zone-depot ${dragId && zoneCourante === colonne.id ? "zone-visee" : ""}`}
            style={{ minHeight: 140 }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-[6px]">
                <span
                  className="inline-block flex-none rounded-full"
                  style={{ width: 7, height: 7, background: colonne.couleur }}
                  aria-hidden
                />
                <span className="text-[11px] font-semibold tracking-[0.04em]">{colonne.nom}</span>
              </div>
              <span className="nombres text-[10px] font-semibold text-[var(--p90-texte-2)]">{items.length}</span>
            </div>

            <div className="mt-[9px] space-y-[6px]">
              {items.map((t) => {
                const jours = joursRestants(t.meta.echeance, aujourdhui);
                return (
                  <div
                    key={t.id}
                    ref={setRowRef(t.id)}
                    onPointerDown={(e) => commencerDrag(e, t.id, colonne.id, false)}
                    className={`carte-haute cursor-grab p-[9px] ${dragId === t.id ? "opacity-0" : ""}`}
                    style={{ touchAction: "none" }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (glissementArmeRef.current) {
                          glissementArmeRef.current = false;
                          return;
                        }
                        void basculerFaite(t.id);
                      }}
                      className="block w-full cursor-pointer text-left"
                    >
                      <div className={`text-[12px] font-medium leading-[1.35] ${t.faite ? "line-through opacity-40" : ""}`}>
                        {emojiVisible(t.titre) && <span className="mr-[4px]">{emojiVisible(t.titre)}</span>}
                        {t.titre}
                      </div>
                    </button>
                    <Meta
                      className="mt-[4px]"
                      bouts={[
                        t.meta.objectif ? { texte: nomObjectif(t.meta.objectif) } : null,
                        t.meta.responsables.length > 0 ? { texte: t.meta.responsables.join(", ") } : null,
                        t.meta.echeance
                          ? {
                              texte:
                                jours !== null && jours < 0
                                  ? `${-jours} j de retard`
                                  : formaterJour(t.meta.echeance),
                              ton: jours !== null && jours < 0 ? "danger" : "neutre",
                              fort: jours !== null && jours < 0,
                            }
                          : null,
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          </Carte>
        ))}
      </div>
    </div>
  );
}
