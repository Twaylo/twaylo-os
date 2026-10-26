"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LISTES, blocDeListe, listeDe, type IdListe } from "@/lib/p90";
import { emojiVisible } from "@/lib/emoji-tache";
import { useCockpit, type TacheVue } from "@/lib/p90-context";
import { useGlisser } from "@/lib/use-glisser";
import { useFlipListe } from "@/lib/use-flip";
import { LigneTache } from "@/components/p90/LigneTache";
import { Bouton, Carte, Champ, EnTeteVue, Surtitre, Vide } from "@/components/p90/ui";

/**
 * LA TODO — le module qui porte tout le reste.
 *
 * C'est l'écran que Twaylo ouvre quarante fois par jour. DEUX LISTES, côte à
 * côte : le Deep work et les Annexes — sa demande, mot pour mot (« faire deux
 * to do : DEEP WORK et ANNEXES »). Elles remplacent les quatre blocs horaires,
 * les trois priorités calculées (« ça je regarde jamais ») et la bascule
 * Aujourd'hui / Semaine / Tout : tout ce qui est écrit est visible, rangé à la
 * main, et une tâche passe d'une liste à l'autre d'un glisser.
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
    verrouSync,
  } = useCockpit();

  const [saisie, setSaisie] = useState<Record<IdListe, string>>({ deep: "", annexes: "" });
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [entree, setEntree] = useState(true);
  const [confirmeCloture, setConfirmeCloture] = useState(false);

  /**
   * LA SUPPRESSION EN SURSIS.
   *
   * La ligne quitte l'écran tout de suite — c'est ce qu'on attend d'une
   * suppression — mais l'écriture ne part qu'au bout de six secondes. Annuler
   * ne recrée rien : la tâche n'a jamais quitté la liste, elle reparaît à sa
   * place.
   */
  const [aSupprimer, setASupprimer] = useState<{ id: string; titre: string } | null>(null);
  const annuleRef = useRef(false);

  /*
   * La fonction de suppression, tenue en ref — et c'était un vrai défaut.
   *
   * Elle change d'identité à chaque modification de la liste. Placée dans les
   * dépendances du compte à rebours, elle le faisait REPARTIR à chaque coche,
   * à chaque relecture qui rapportait du neuf : le nettoyage envoyait la
   * suppression sur-le-champ, puis un nouveau minuteur la renvoyait six
   * secondes plus tard. Résultat : supprimer une tâche puis en cocher une
   * autre rendait « Annuler » inopérant, et le second envoi affichait un faux
   * échec.
   */
  const supprimerRef = useRef(supprimerTache);
  useEffect(() => {
    supprimerRef.current = supprimerTache;
  });

  useEffect(() => {
    if (!entree || taches.length === 0) return;
    const t = setTimeout(() => setEntree(false), 700);
    return () => clearTimeout(t);
  }, [entree, taches.length]);

  /*
   * Le compte à rebours de la suppression. Son nettoyage couvre TOUS les
   * départs — délai écoulé, seconde suppression qui prend la place, changement
   * d'onglet : dans les trois cas l'effacement part. Seul « Annuler » lève le
   * drapeau qui l'en empêche.
   */
  useEffect(() => {
    if (!aSupprimer) return;
    const { id } = aSupprimer;
    let parti = false;
    const partir = () => {
      if (parti) return;
      parti = true;
      void supprimerRef.current(id);
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
  }, [aSupprimer]);

  /* ---------- Ce qui s'affiche ---------- */

  const enSursis = aSupprimer?.id;
  const vivantes = useMemo(() => taches.filter((t) => t.id !== enSursis), [taches, enSursis]);
  const ordreAffiche = useMemo(() => vivantes.map((t) => t.id), [vivantes]);

  /*
   * La liste d'une tâche, par une table : le moteur de glissement la demande
   * UNE FOIS PAR LIGNE À CHAQUE IMAGE.
   */
  const listeParId = useMemo(() => {
    const m = new Map<string, IdListe>();
    for (const t of vivantes) m.set(t.id, listeDe(t.bloc));
    return m;
  }, [vivantes]);

  const { dragId, ordreVisuel, zoneCourante, commencerDrag, setRowRef, setZoneRef, grilleRef, glissementArmeRef } =
    useGlisser<IdListe>({
      ordre: ordreAffiche,
      zoneDe: (id) => listeParId.get(id) ?? "annexes",
      onDepot: (ids, changement) => {
        /*
         * L'ordre envoyé couvre TOUTE la liste, tâche en sursis comprise : on
         * réinsère l'ordre visible à l'intérieur de l'ordre complet, sinon la
         * tâche cachée perdrait sa place.
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
        void reordonner(
          complet,
          changement ? { id: changement.id, bloc: blocDeListe(changement.zone) } : undefined,
        );
      },
      /*
       * Jamais bloqué. Il l'était dès qu'un panneau ⋯ était ouvert, n'importe
       * où dans la liste : aucune ligne ne se laissait plus glisser, sans le
       * moindre signe. Le panneau se referme maintenant au départ du geste.
       */
      zoneParDefaut: "annexes",
    });

  /*
   * Pendant un glissement, la relecture automatique est suspendue : une liste
   * descendue de la base au milieu du geste remplacerait les lignes en
   * mouvement. Le verrou se lève au lâcher, et au démontage.
   */
  useEffect(() => {
    verrouSync("glisser", dragId !== null);
    return () => verrouSync("glisser", false);
  }, [dragId, verrouSync]);

  const parId = useMemo(() => new Map(vivantes.map((t) => [t.id, t])), [vivantes]);
  const affichees: TacheVue[] = dragId
    ? ordreVisuel.map((id) => parId.get(id)).filter((t): t is TacheVue => Boolean(t))
    : vivantes;

  /** La liste où une ligne s'affiche — celle que vise le doigt, pendant un glissement. */
  const listeAffichee = (t: TacheVue): IdListe => (t.id === dragId ? zoneCourante : listeDe(t.bloc));

  /*
   * LA LISTE QUI S'ÉCARTE (voir `use-flip.ts`) : une tâche qui arrive, qui
   * part ou qui change de liste fait glisser ses voisines au lieu de les
   * faire sauter. L'empreinte porte l'ordre ET la liste de chaque ligne.
   */
  useFlipListe(
    grilleRef,
    affichees.map((t) => `${t.cle ?? t.id}:${listeAffichee(t)}`).join("|"),
    dragId === null,
  );

  /** « Lundi 26 octobre », pour le grand titre. */
  const dateDuJour = (() => {
    const d = new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  const faites = vivantes.filter((t) => t.faite).length;

  /*
   * LA PROPORTION DE LA JOURNÉE DÉJÀ FAITE, de 0 à 1 : elle règle l'intensité
   * de l'animation quand on coche — discrète au réveil, spectaculaire quand la
   * journée est pliée.
   */
  const intensite = vivantes.length > 0 ? faites / vivantes.length : 0;

  /* ---------- Ajouter ---------- */

  /**
   * Crée une ou plusieurs tâches dans une liste.
   *
   * Plusieurs lignes : créées dans l'ordre où elles sont écrites. Chaque
   * tâche créée va en bas de la liste : une liste collée « A, B, C » s'affiche
   * donc « A, B, C », sous ce qui y était déjà.
   *
   * Aucune date posée d'office. Il y en avait une — le jour même — pour que la
   * tâche apparaisse dans la vue du jour ; cette vue n'existe plus, et la date
   * faisait passer « en retard » dès le lendemain tout ce qui n'avait pas été
   * fait le jour même.
   */
  const creer = async (liste: IdListe, lignes: string[]) => {
    const bloc = blocDeListe(liste);
    for (const ligne of lignes) {
      const ok = await ajouterTache(ligne, undefined, bloc);
      if (!ok) {
        // La ligne qui a échoué revient dans le champ, et le bandeau la nomme :
        // inutile d'enchaîner des créations qui échoueront toutes pareil.
        setSaisie((p) => ({ ...p, [liste]: ligne }));
        return;
      }
    }
  };

  const ajouter = (liste: IdListe) => {
    const texte = saisie[liste].trim();
    if (!texte) return;
    setSaisie((p) => ({ ...p, [liste]: "" }));
    void creer(liste, [texte]);
  };

  return (
    <div className="entree-vue space-y-[14px]">
      {/* ---------- Le grand titre : le jour, le compte, et la clôture ---------- */}
      <EnTeteVue
        titre="To-do"
        sousTitre={
          <>
            {dateDuJour} · <span className="nombres">{faites} sur {vivantes.length}</span> faites
          </>
        }
      >
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
              titre="Retire les tâches cochées. Les gelées sont simplement décochées."
            >
              Clôturer la journée
            </Bouton>
          ))}
      </EnTeteVue>

      {/* ---------- Les bandeaux : échec, et suppression en sursis ---------- */}
      {echec && (
        <div
          role="alert"
          className="entree-ligne flex flex-wrap items-center gap-[10px] rounded-[20px] px-[14px] py-[10px]"
          style={{ background: "rgba(255,198,61,0.14)", border: "1px solid rgba(255,198,61,0.38)" }}
        >
          <span className="min-w-0 flex-1 text-[14px] font-medium">{echec}</span>
          <Bouton onClick={oublierEchec}>Fermer</Bouton>
        </div>
      )}

      {aSupprimer && (
        <div
          role="status"
          className="entree-ligne relative flex items-center gap-[10px] overflow-hidden rounded-[20px] px-[14px] py-[10px]"
          style={{ background: "rgba(255,61,139,0.14)", border: "1px solid rgba(255,61,139,0.38)" }}
        >
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
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

      {!pret && taches.length === 0 && (
        <Carte>
          <Vide>Lecture des tâches…</Vide>
        </Carte>
      )}

      {/* ---------- Les deux listes ---------- */}
      <div ref={grilleRef} className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-2">
        {LISTES.map((liste) => {
          const items = affichees.filter((t) => listeAffichee(t) === liste.id);
          const faitesListe = items.filter((t) => t.faite).length;
          const autre = LISTES.find((l) => l.id !== liste.id)!;
          const texte = saisie[liste.id];
          return (
            <Carte
              key={liste.id}
              accent={liste.couleur}
              survol={false}
              innerRef={setZoneRef(liste.id)}
              zone={liste.id}
              className={`zone-depot ${dragId && zoneCourante === liste.id ? "zone-visee" : ""}`}
              style={{ minHeight: 150 }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Surtitre couleur={liste.couleur}>{liste.nom}</Surtitre>
                  <div className="mt-[2px] text-[12.5px] text-white/40">{liste.indice}</div>
                </div>
                {items.length > 0 && (
                  <span
                    className="nombres flex-none text-[13px] font-medium"
                    style={{
                      color: faitesListe === items.length ? "var(--color-ver-soft)" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {faitesListe}/{items.length}
                  </span>
                )}
              </div>

              {/* LE CHAMP D'AJOUT, EN HAUT : une tâche créée prend la tête de
                  la liste, juste sous l'endroit où on l'a tapée. */}
              <form
                className="mt-[10px] flex items-center gap-[7px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  ajouter(liste.id);
                }}
              >
                <Champ
                  valeur={texte}
                  onChange={(v) => setSaisie((p) => ({ ...p, [liste.id]: v }))}
                  onPaste={(e) => {
                    const colle = e.clipboardData.getData("text");
                    const lignes = lignesCollees(colle);
                    if (lignes.length < 2) return;
                    // Plusieurs lignes : une tâche par ligne, tout de suite.
                    e.preventDefault();
                    void creer(liste.id, lignes);
                  }}
                  placeholder={`Ajouter dans ${liste.nom}…`}
                  aria={`Ajouter une tâche dans ${liste.nom}`}
                  className="flex-1"
                />
                {/* L'emoji que la tâche RECEVRA, pendant la frappe. */}
                {texte.trim() && <span className="flex-none text-[16px]">{emojiVisible(texte)}</span>}
                <button
                  type="submit"
                  disabled={!texte.trim()}
                  aria-label={`Ajouter dans ${liste.nom}`}
                  className={`capsule flex-none text-[19px] font-normal ${texte.trim() ? "capsule-pleine" : ""}`}
                  style={{ width: 38, height: 38, padding: 0 }}
                >
                  +
                </button>
              </form>

              {/* Une liste groupée : les rangées se suivent, séparées d'un filet. */}
              <div className="mt-[8px]">
                {items.length === 0 && (
                  <div className="py-[14px] text-center text-[13px] text-white/35">Rien ici pour l&apos;instant</div>
                )}
                {items.map((t, i) => (
                  <LigneTache
                    // La clé d'affichage : stable quand une tâche tapée ici
                    // reçoit son vrai identifiant (voir `TacheVue.cle`).
                    key={t.cle ?? t.id}
                    rang={i}
                    intensite={intensite}
                    tache={t}
                    aujourdhui={aujourdhui}
                    couleur={liste.couleur}
                    autreListe={{ nom: autre.nom, bloc: autre.bloc }}
                    ouvert={ouvert === t.id}
                    surOuvrir={(id) => {
                      // Un clic qui conclut un glissement ne doit pas ouvrir le
                      // panneau : le clic part au relâchement, donc APRÈS.
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
                    surPointerDown={(e, poignee) => {
                      if (ouvert) setOuvert(null);
                      commencerDrag(e, t.id, listeDe(t.bloc), poignee);
                    }}
                    tire={dragId === t.id}
                    entree={entree}
                  />
                ))}
              </div>
            </Carte>
          );
        })}
      </div>
    </div>
  );
}
