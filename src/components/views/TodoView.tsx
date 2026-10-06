"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BLOCS,
  couleurObjectif,
  blocSuggere,
  filtrerVue,
  joursRestants,
  nomObjectif,
  scorePriorite,
  troisPriorites,
  type IdBloc,
  type MetaTache,
  type Vue,
} from "@/lib/p90";
import { emojiVisible } from "@/lib/emoji-tache";
import { useCockpit, type TacheVue } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import { LigneTache } from "@/components/p90/LigneTache";
import { Bouton, Carte, Champ, Puce, Surtitre, Vide, formaterJour } from "@/components/p90/ui";

/**
 * LA TODO — le module qui porte tout le reste.
 *
 * C'est l'écran que Twaylo ouvre quarante fois par jour, et le seul dont il se
 * sert à 90 %. Tout le cockpit est bâti autour : le Kanban montre les mêmes
 * lignes, les objectifs comptent ce qu'elles font avancer.
 *
 * Trois choses, dans cet ordre :
 *   1. LES TROIS PRIORITÉS DU JOUR, calculées — échéance, objectif, impact.
 *      Pas une sélection à la main : une liste de vingt lignes ne dit pas par
 *      où commencer, et c'est précisément là qu'une todo perd sa valeur.
 *   2. Aujourd'hui / Semaine, pour choisir l'horizon.
 *   3. La liste, rangée par BLOC DE LA JOURNÉE, qu'on réorganise au doigt.
 */

/** Combien de tâches un seul collage peut créer. */
const MAX_COLLAGE = 20;

/**
 * Les lignes utiles d'un texte collé.
 *
 * On accepte les retours à la ligne ET les puces d'une liste copiée ailleurs
 * (« - », « • », « 1. ») : c'est exactement ce qu'on récupère d'une note ou
 * d'un message, et les retirer à la main annulerait tout le gain.
 */
function lignesCollees(texte: string): string[] {
  return texte
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–—•*]|\d+[.)])\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, MAX_COLLAGE);
}

export function TodoView() {
  const {
    aujourdhui,
    taches,
    pret,
    echec,
    oublierEchec,
    ajouterTache,
    modifierTache,
    basculerFaite,
    reordonner,
    supprimerTache,
    basculerGel,
    cloturer,
  } = useCockpit();

  /*
   * « Semaine » par défaut, pas « Aujourd'hui ».
   *
   * Au 5 octobre, la vue du jour ne contient que les trois chantiers déjà
   * lancés : un écran presque vide pour qui ouvre sa todo quarante fois par
   * jour, et qui donne l'impression que l'OS a perdu la liste. La semaine, en
   * revanche, est exactement ce qu'une todo montre — et le jour reste à une
   * pression de doigt.
   */
  const [vue, setVue] = useState<Vue>("semaine");
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [entree, setEntree] = useState(true);
  const [confirmeCloture, setConfirmeCloture] = useState(false);

  /**
   * LA SUPPRESSION EN SURSIS.
   *
   * La ligne quitte l'écran tout de suite — c'est ce qu'on attend d'une
   * suppression — mais l'écriture ne part qu'au bout de six secondes. Annuler
   * ne recrée rien : la tâche n'a jamais quitté la liste, elle reparaît à sa
   * place, avec son identifiant, son bloc et son âge.
   */
  const [aSupprimer, setASupprimer] = useState<{ id: string; titre: string } | null>(null);
  const annuleRef = useRef(false);

  useEffect(() => {
    if (!entree || taches.length === 0) return;
    const t = setTimeout(() => setEntree(false), 700);
    return () => clearTimeout(t);
  }, [entree, taches.length]);

  /*
   * Le compte à rebours de la suppression.
   *
   * Le nettoyage couvre TOUS les départs : délai écoulé, seconde suppression
   * qui prend la place, changement d'onglet. Dans les trois cas l'effacement
   * part — seul « Annuler » lève le drapeau qui l'en empêche. Sans ça, quitter
   * la todo dans les six secondes ferait réapparaître la tâche supprimée.
   */
  useEffect(() => {
    if (!aSupprimer) return;
    const { id } = aSupprimer;
    let parti = false;
    const partir = () => {
      if (parti) return;
      parti = true;
      void supprimerTache(id);
    };
    const minuterie = setTimeout(() => {
      partir();
      setASupprimer((p) => (p?.id === id ? null : p));
    }, 6000);
    return () => {
      clearTimeout(minuterie);
      if (annuleRef.current) {
        annuleRef.current = false;
        return;
      }
      partir();
    };
  }, [aSupprimer, supprimerTache]);

  /* ---------- Ce qui s'affiche ---------- */

  const enSursis = aSupprimer?.id;
  const vivantes = useMemo(
    () => taches.filter((t) => t.id !== enSursis),
    [taches, enSursis],
  );

  const priorites = useMemo(() => troisPriorites(vivantes, aujourdhui), [vivantes, aujourdhui]);
  const filtrees = useMemo(() => filtrerVue(vivantes, vue, aujourdhui), [vivantes, vue, aujourdhui]);

  /** Ce que la vue laisse de côté : annoncé, jamais caché en silence. */
  const horsVue = vivantes.length - filtrees.length;

  /* ---------- Glisser-déposer : les zones sont les BLOCS ---------- */

  const ordreAffiche = useMemo(() => filtrees.map((t) => t.id), [filtrees]);

  /*
   * Le bloc d'une tâche, par une table et non par un parcours.
   *
   * Le moteur de glissement appelle cette fonction UNE FOIS PAR LIGNE À CHAQUE
   * IMAGE pour savoir quelles lignes appartiennent à la colonne visée : avec un
   * `find`, quarante tâches font mille six cents parcours par image, et ça se
   * sent au doigt.
   */
  const blocParId = useMemo(() => {
    const m = new Map<string, IdBloc>();
    for (const t of filtrees) m.set(t.id, t.bloc);
    return m;
  }, [filtrees]);

  const { dragId, ordreVisuel, zoneCourante, commencerDrag, setRowRef, setZoneRef, grilleRef, glissementArmeRef } =
    useGlisser<IdBloc>({
      ordre: ordreAffiche,
      zoneDe: (id) => blocParId.get(id) ?? "operations",
      onDepot: (ids, changement) => {
        /*
         * L'ordre envoyé couvre TOUTE la liste, pas seulement la vue.
         *
         * La vue « Aujourd'hui » ne montre qu'une partie des tâches : n'écrire
         * que son ordre effacerait la place de toutes les autres, qui
         * repartiraient en bas de liste au prochain chargement. On réinsère
         * donc l'ordre visible à l'intérieur de l'ordre complet.
         */
        const visibles = new Set(ids);
        const complet: string[] = [];
        let curseur = 0;
        for (const t of taches) {
          if (visibles.has(t.id)) {
            complet.push(ids[curseur]);
            curseur += 1;
          } else {
            complet.push(t.id);
          }
        }
        void reordonner(complet, changement ? { id: changement.id, bloc: changement.zone } : undefined);
      },
      bloque: Boolean(ouvert),
      zoneParDefaut: "operations",
    });

  /** La liste à peindre : l'ordre visuel pendant un glissement, sinon l'ordre. */
  const parId = useMemo(() => new Map(filtrees.map((t) => [t.id, t])), [filtrees]);
  const affichees: TacheVue[] = dragId
    ? ordreVisuel
        .map((id) => parId.get(id))
        .filter((t): t is TacheVue => Boolean(t))
        .map((t) => (t.id === dragId ? { ...t, bloc: zoneCourante } : t))
    : filtrees;

  const parBloc = BLOCS.map((b) => ({
    bloc: b,
    items: affichees.filter((t) => t.bloc === b.id),
  }));

  const faites = vivantes.filter((t) => t.faite).length;

  /* ---------- Ajouter ---------- */

  const ajouter = async (bloc: IdBloc) => {
    const texte = (saisie[bloc] ?? "").trim();
    if (!texte) return;
    setSaisie((p) => ({ ...p, [bloc]: "" }));

    const lignes = lignesCollees(texte);

    /*
     * UNE TÂCHE NAÎT DATÉE D'AUJOURD'HUI.
     *
     * Sans date, elle tombait hors de la vue du jour ET hors de la semaine :
     * on tapait « Appeler le fixeur », la ligne partait bien en base, et
     * l'écran n'en montrait rien. Le pire défaut possible pour une todo — on
     * croit avoir noté, on ne voit rien.
     *
     * La date est de toute façon juste : on l'ajoute dans le bloc horaire
     * d'aujourd'hui, donc c'est pour aujourd'hui. Un geste la repousse.
     */
    const meta: Partial<MetaTache> = { echeance: aujourdhui };
    for (const ligne of lignes.length > 0 ? lignes : [texte]) {
      const ok = await ajouterTache(ligne, meta, bloc);
      // Un échec s'affiche en bandeau et conserve le texte : inutile d'enchaîner
      // vingt créations qui échoueront toutes de la même façon.
      if (!ok) {
        setSaisie((p) => ({ ...p, [bloc]: ligne }));
        break;
      }
    }
  };

  return (
    <div className="entree-vue space-y-[13px]">
      {/* ---------- Les trois priorités ---------- */}
      {/* Le dégradé signature sur la carte maîtresse — une seule la porte. */}
      <Carte accent="var(--grad)">
        <div className="flex items-baseline justify-between gap-2">
          <Surtitre couleur="var(--color-cya-soft)">Les 3 priorités du jour</Surtitre>
          <span className="nombres text-[11px] font-semibold text-white/40">
            {faites}/{vivantes.length} faites
          </span>
        </div>

        {priorites.length === 0 ? (
          <Vide indice="Ajoute une tâche avec une échéance : elle remontera ici toute seule.">
            Rien à prioriser
          </Vide>
        ) : (
          <ol className="mt-[9px] space-y-[6px]">
            {priorites.map((t, i) => {
              const jours = joursRestants(t.meta.echeance, aujourdhui);
              return (
                <li key={t.id} className="flex items-start gap-[9px]">
                  <span
                    className="nombres mt-[1px] flex-none rounded-[6px] px-[6px] text-[12px] font-bold leading-[20px]"
                    style={{
                      color: i === 0 ? "#07121d" : "var(--color-cya)",
                      background: i === 0 ? "var(--grad)" : "transparent",
                      border: `1px solid ${i === 0 ? "transparent" : "rgba(34,211,238,0.35)"}`,
                    }}
                  >
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => void basculerFaite(t.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <div className="truncate text-[13px] font-semibold">
                      {emojiVisible(t.titre) && <span className="mr-[5px]">{emojiVisible(t.titre)}</span>}
                      {t.titre}
                    </div>
                    <div className="mt-[2px] flex flex-wrap items-center gap-[4px]">
                      <Puce couleur={couleurObjectif(t.meta.objectif)}>{nomObjectif(t.meta.objectif)}</Puce>
                      {jours !== null && (
                        <Puce ton={jours <= 0 ? "danger" : jours <= 2 ? "alerte" : "neutre"}>
                          {jours < 0 ? `${-jours} j de retard` : jours === 0 ? "aujourd'hui" : `dans ${jours} j`}
                        </Puce>
                      )}
                      <Puce titre="Score de priorité : échéance + objectif + impact">
                        {scorePriorite(t, aujourdhui)} pts
                      </Puce>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Carte>

      {/* ---------- La bascule de vue ---------- */}
      <div className="flex flex-wrap items-center gap-[7px]">
        <Puce actif={vue === "aujourdhui"} ton="accent" onClick={() => setVue("aujourdhui")}>
          Aujourd&apos;hui
        </Puce>
        <Puce actif={vue === "semaine"} ton="accent" onClick={() => setVue("semaine")}>
          Semaine
        </Puce>
        <Puce actif={vue === "tout"} ton="accent" onClick={() => setVue("tout")}>
          Tout
        </Puce>
        <span className="nombres text-[11px] text-white/40">
          {filtrees.length} tâche{filtrees.length > 1 ? "s" : ""}
          {horsVue > 0 && vue === "semaine" && ` · ${horsVue} plus loin`}
          {horsVue > 0 && vue === "aujourdhui" && ` · ${horsVue} hors du jour`}
        </span>

        <span className="flex-1" />

        {faites > 0 &&
          (confirmeCloture ? (
            <>
              <Bouton
                ton="plein"
                onClick={() => {
                  setConfirmeCloture(false);
                  void cloturer();
                }}
              >
                Confirmer la clôture
              </Bouton>
              <Bouton onClick={() => setConfirmeCloture(false)}>Annuler</Bouton>
            </>
          ) : (
            <Bouton
              onClick={() => setConfirmeCloture(true)}
              titre="Retire les tâches cochées. Les quotidiennes sont simplement décochées."
            >
              Clôturer la journée
            </Bouton>
          ))}
      </div>

      {/* ---------- Les bandeaux : échec, et suppression en sursis ---------- */}
      {echec && (
        <div
          role="alert"
          className="entree-ligne flex flex-wrap items-center gap-[9px] rounded-[14px] px-[11px] py-[9px]"
          style={{ background: "rgba(255,198,61,0.12)", border: "1px solid rgba(255,198,61,0.35)" }}
        >
          <span className="min-w-0 flex-1 text-[12px] font-medium">{echec}</span>
          <Bouton onClick={oublierEchec}>Fermer</Bouton>
        </div>
      )}

      {aSupprimer && (
        <div
          role="status"
          className="entree-ligne relative flex items-center gap-[9px] overflow-hidden rounded-[14px] px-[11px] py-[9px]"
          style={{ background: "rgba(255,61,139,0.12)", border: "1px solid rgba(255,61,139,0.35)" }}
        >
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
            « {aSupprimer.titre} » part aux Oubliés
          </span>
          <Bouton
            onClick={() => {
              annuleRef.current = true;
              setASupprimer(null);
            }}
          >
            Annuler
          </Bouton>
          <span className="sablier" aria-hidden />
        </div>
      )}

      {/* ---------- La liste, par bloc de la journée ---------- */}
      {!pret && taches.length === 0 && (
        <Carte>
          <Vide>Lecture des tâches…</Vide>
        </Carte>
      )}

      <div ref={grilleRef} className="grid grid-cols-1 gap-[11px] lg:grid-cols-2">
        {parBloc.map(({ bloc, items }) => {
          const faitesBloc = items.filter((t) => t.faite).length;
          return (
            <Carte
              key={bloc.id}
              accent={bloc.couleur}
              survol={false}
              innerRef={setZoneRef(bloc.id)}
              zone={bloc.id}
              className={`zone-depot ${dragId && zoneCourante === bloc.id ? "zone-visee" : ""}`}
              style={{ minHeight: items.length === 0 ? 108 : undefined }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Surtitre couleur={bloc.couleur}>{bloc.nom}</Surtitre>
                  <div className="nombres mt-[3px] text-[10px] text-white/35">{bloc.plage}</div>
                </div>
                {items.length > 0 && (
                  <span
                    className="nombres flex-none text-[10px] font-semibold"
                    style={{
                      color: faitesBloc === items.length ? "var(--color-ver)" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {faitesBloc}/{items.length}
                  </span>
                )}
              </div>

              {/*
                LE CHAMP D'AJOUT EST EN HAUT, au-dessus de la liste.

                En bas, il fallait descendre sous treize lignes pour noter ce
                qui vient de traverser l'esprit — et sur téléphone, défiler
                jusqu'au bout du bloc avant même de pouvoir taper. Or une tâche
                créée prend la TÊTE de la liste : le champ est maintenant juste
                au-dessus de l'endroit où la ligne va apparaître.
              */}
              <form
                className="mt-[9px] flex items-center gap-[6px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ajouter(bloc.id);
                }}
              >
                <Champ
                  valeur={saisie[bloc.id] ?? ""}
                  onChange={(v) => setSaisie((p) => ({ ...p, [bloc.id]: v }))}
                  placeholder={`Ajouter dans ${bloc.nom}…`}
                  aria={`Ajouter une tâche dans ${bloc.nom}`}
                  className="flex-1"
                />
                {/* L'emoji que la tâche RECEVRA, pendant la frappe. */}
                {(saisie[bloc.id] ?? "").trim() && (
                  <span className="flex-none text-[15px]">{emojiVisible(saisie[bloc.id] ?? "")}</span>
                )}
                <Bouton type="submit" ton="plein" disabled={!(saisie[bloc.id] ?? "").trim()}>
                  +
                </Bouton>
              </form>
              <div className="mt-[9px] space-y-[1px]">
                {items.length === 0 && (
                  <div className="py-[9px] text-center text-[11px] text-white/40 opacity-50">
                    Rien dans ce bloc
                  </div>
                )}
                {items.map((t) => (
                  <LigneTache
                    key={t.id}
                    tache={t}
                    aujourdhui={aujourdhui}
                    ouvert={ouvert === t.id}
                    surOuvrir={(id) => {
                      // Un clic qui conclut un glissement ne doit pas ouvrir
                      // l'éditeur : le clic part au relâchement, donc APRÈS le
                      // déplacement.
                      if (glissementArmeRef.current) {
                        glissementArmeRef.current = false;
                        return;
                      }
                      setOuvert(id);
                    }}
                    surBasculer={() => {
                      if (glissementArmeRef.current) {
                        glissementArmeRef.current = false;
                        return;
                      }
                      void basculerFaite(t.id);
                    }}
                    surModifier={(patch) => void modifierTache(t.id, patch)}
                    surSupprimer={() => setASupprimer({ id: t.id, titre: t.titre })}
                    surGel={() => void basculerGel(t.id)}
                    rowRef={setRowRef(t.id)}
                    surPointerDown={(e, poignee) => commencerDrag(e, t.id, t.bloc, poignee)}
                    tire={dragId === t.id}
                    entree={entree}
                  />
                ))}
              </div>

            </Carte>
          );
        })}
      </div>

      {pret && vivantes.length === 0 && (
        <Carte>
          <Vide indice="Tape une tâche dans le bloc où elle doit se faire.">Aucune tâche</Vide>
        </Carte>
      )}

      {/* Le rappel du bloc suggéré par objectif, pour qui range à la main. */}
      <div className="px-[2px] text-[10px] text-white/40 opacity-60">
        Les tâches créées depuis un objectif tombent dans son bloc :{" "}
        {["momentum", "twaylo", "terrain"].map((o, i) => (
          <span key={o}>
            {i > 0 && " · "}
            {nomObjectif(o)} → {BLOCS.find((b) => b.id === blocSuggere(o))?.nom}
          </span>
        ))}
        . Échéance la plus proche en haut de la carte du jour ({formaterJour(aujourdhui)}).
      </div>
    </div>
  );
}
