"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { NIVEAUX, type Niveau } from "@/lib/types";
import { localDateKey } from "@/lib/local-date";
import { ageEnJours, vieillesse } from "@/lib/age-tache";
import {
  PALETTE,
  avecEmoji,
  emojiDeTete,
  emojiPourTache,
  emojiVisible,
  familleDeTache,
} from "@/lib/emoji-tache";
import { CheckRow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";
import { useGlisser } from "@/lib/use-glisser";

const ORDRE_NIVEAUX: Niveau[] = ["principal", "secondaire", "annexe"];

/** navigator.vibrate n'est pas dans tous les typages ; on le decrit ici. */
type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

/**
 * Combien de tâches un seul collage peut créer.
 *
 * Le vidage de tête du matin fait cinq à quinze lignes. Au-delà, c'est un
 * document collé par erreur, et on ne veut pas voir trente lignes de contrat
 * atterrir dans la todo — ni trente requêtes partir d'un coup.
 */
const MAX_COLLAGE = 20;

/**
 * Les lignes utiles d'un texte collé.
 *
 * On accepte les retours à la ligne ET les puces d'une liste copiée ailleurs
 * (« - », « • », « * », « 1. ») : c'est exactement ce qu'on récupère d'une note
 * ou d'un message, et les retirer à la main annulerait tout le gain.
 */
function lignesCollees(texte: string): string[] {
  return texte
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–—•*]|\d+[.)])\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, MAX_COLLAGE);
}


/**
 * TÂCHES CLÉS — la carte prioritaire de l'OS (spec Partie 6).
 *
 * Découpée en trois niveaux. Une liste à plat ne dit pas où porter son
 * attention : tout y pèse pareil, et le matin on attaque ce qui est en haut
 * plutôt que ce qui compte. Ici le focus principal est ce qui fait la journée,
 * le secondaire ce qui la soutient, l'annexe ce qui doit sortir de la tête.
 *
 * On range par glisser-déposer, à la poignée ⠿. Le geste vise la manipulation
 * DIRECTE : la tâche tirée est un clone flottant (position:fixed, porté dans
 * document.body) qui colle au doigt au pixel, les voisines s'écartent en
 * glissant (FLIP), et le trou laissé par la ligne masquée matérialise la cible.
 * Un seul système de pointeur couvre souris ET doigt — les flèches ↑↓ ne
 * s'affichaient qu'au survol, jamais sur le téléphone que Twaylo utilise sur le
 * terrain. Tirer dans la zone d'un autre niveau change le niveau ; le bouton ⇅
 * reste pour le clavier ou un niveau vide.
 */
export function TachesCard() {
  const {
    tasks,
    toggleTask,
    ajouterTache,
    supprimerTache,
    renommerTache,
    basculerGelTache,
    changerNiveauTache,
    deposerTache,
    passerJourSuivant,
    todoCloturee,
    tachesPretes,
    demoMode,
  } = useOs();

  // En démo, la liste est fournie sans passer par la base : rien à attendre.
  const enChargement = !tachesPretes && !demoMode;

  const [nouvelle, setNouvelle] = useState<Record<string, string>>({});
  /**
   * L'emoji que RECEVRA la tâche en cours de frappe, par colonne.
   *
   * Calculé pendant la saisie, pas après : l'OS répond au fur et à mesure au
   * lieu d'appliquer sa pastille dans le dos une fois la tâche posée.
   */
  const apercus = useMemo(
    () =>
      Object.fromEntries(
        ORDRE_NIVEAUX.map((n) => [
          n,
          (nouvelle[n] ?? "").trim() ? emojiVisible(nouvelle[n], n) : "",
        ]),
      ) as Record<Niveau, string>,
    [nouvelle],
  );
  /** L'identifiant de la tâche en cours de renommage, s'il y en a une. */
  const [edition, setEdition] = useState<string | null>(null);
  /**
   * La tâche dont les actions sont dépliées. Une seule à la fois : deux
   * panneaux ouverts, et la liste devient illisible.
   */
  const [menu, setMenu] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  /**
   * LA SUPPRESSION EN SURSIS.
   *
   * Supprimer était le seul geste irréversible de la todo : un doigt qui
   * dérape sur un écran de téléphone, et la tâche n'existe plus — pas de
   * corbeille, pas de retour en arrière, rien à retaper de mémoire puisqu'on
   * ne se souvient plus de ce qu'il y avait écrit.
   *
   * On ne supprime donc plus tout de suite. La ligne disparaît de l'écran,
   * une barre propose « Annuler », et l'effacement ne part vraiment qu'au bout
   * de six secondes. Annuler ne recrée rien : la tâche n'a jamais quitté la
   * liste, elle réapparaît exactement à sa place, avec son identifiant, son
   * niveau et son âge.
   */
  const [aSupprimer, setASupprimer] = useState<{ id: string; texte: string } | null>(null);
  /** Posé par « Annuler » pour que le nettoyage de l'effet n'efface pas. */
  const annuleRef = useRef(false);

  /**
   * LA TÂCHE QUE LA BASE A REFUSÉE.
   *
   * Elle disparaissait de l'écran sans un mot : on tapait, la ligne
   * apparaissait une fraction de seconde, puis plus rien — et l'erreur partait
   * dans la console, que personne ne regarde. C'est le pire défaut possible
   * pour une todo : on croit avoir noté, on n'a rien noté.
   *
   * Le texte est donc CONSERVÉ ici, affiché, avec de quoi réessayer. Rien de
   * ce qui a été tapé ne se perd, même quand le réseau ou la base lâche.
   */
  const [echecAjout, setEchecAjout] = useState<{ texte: string; niveau: Niveau } | null>(
    null,
  );
  const [reessaiEnCours, setReessaiEnCours] = useState(false);

  /** Le bouton « passer au jour suivant » demande confirmation avant de vider. */
  const [confirmeCloture, setConfirmeCloture] = useState(false);
  const [clotureEnCours, setClotureEnCours] = useState(false);
  // Le jour local, calculé une fois : il sert à la clôture ET à l'âge des
  // tâches, et deux lectures d'horloge dans le même rendu pourraient tomber de
  // part et d'autre de minuit.
  const aujourdhui = localDateKey();
  const clotureeAujourdhui = todoCloturee === aujourdhui;

  /**
   * Le dernier appui, pour reconnaître le DOUBLE-TAP qui gèle une tâche.
   *
   * Pourquoi un double-tap et pas un bouton : geler, c'est dire « celle-là,
   * je la refais tous les jours ». C'est un geste qu'on fait une fois par
   * tâche, sur la ligne elle-même, sans ouvrir de menu. Le bouton existe
   * quand même dans le panneau ⋯ — pour qui ne connaît pas le raccourci.
   */
  const dernierTapRef = useRef<{ id: string | null; quand: number }>({
    id: null,
    quand: 0,
  });

  /* ------------------------------------------------------------------ */
  /* Glisser-déposer — le moteur est partagé (voir `lib/use-glisser`)     */
  /* ------------------------------------------------------------------ */

  /*
   * L'ORDRE AFFICHÉ EST L'ORDRE ENREGISTRÉ. Point.
   *
   * Il ne l'était pas : la liste était re-triée à chaque rendu pour mettre les
   * tâches de même nature côte à côte. L'intention était bonne — enchaîner
   * trois scripts coûte moins cher que d'alterner script, appel, facture.
   * L'effet, lui, était insupportable : on posait une tâche en tête, le tri se
   * rejouait aussitôt, elle atterrissait deuxième, et DEUX AUTRES lignes qu'on
   * n'avait pas touchées changeaient de place au passage. Mesuré, pas supposé.
   *
   * Un rangement à la main ne peut pas être arbitré par une règle : ou bien
   * c'est la règle qui décide, ou bien c'est le doigt — jamais les deux, sinon
   * le geste ne veut plus rien dire. C'est donc le doigt. Le regroupement
   * reste, mais il devient un GESTE : le bouton « Regrouper » range la liste
   * quand Twaylo le demande, et le résultat est un ordre enregistré comme un
   * autre, que plus rien ne défait.
   */
  const ordreAffiche = useMemo(
    () => tasks.map((t) => t.id).filter((x): x is string => Boolean(x)),
    [tasks],
  );

  /**
   * L'ordre que donnerait un regroupement par famille.
   *
   * Tri STABLE sur la première apparition de la famille dans chaque niveau :
   * ce qui est déjà rangé à la main le reste à l'intérieur d'une famille, et
   * les familles gardent l'ordre où elles apparaissent.
   */
  const ordreRegroupe = useMemo(() => {
    const rang = new Map<string, number>();
    for (const [i, t] of tasks.entries()) {
      const cle = `${t.niveau ?? "secondaire"}:${familleDeTache(t.text)?.id ?? `seul-${i}`}`;
      if (!rang.has(cle)) rang.set(cle, i);
    }
    return tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const ca = `${a.t.niveau ?? "secondaire"}:${familleDeTache(a.t.text)?.id ?? `seul-${a.i}`}`;
        const cb = `${b.t.niveau ?? "secondaire"}:${familleDeTache(b.t.text)?.id ?? `seul-${b.i}`}`;
        return (rang.get(ca) ?? 0) - (rang.get(cb) ?? 0) || a.i - b.i;
      })
      .map(({ t }) => t.id)
      .filter((x): x is string => Boolean(x));
  }, [tasks]);

  /** Le bouton ne s'affiche que s'il a quelque chose à faire. */
  const regroupementUtile = ordreRegroupe.join("|") !== ordreAffiche.join("|");

  /**
   * Le niveau d'une tâche, tel qu'il est affiché — sans le glissement.
   *
   * Par une table, pas par un parcours. Le moteur du glissement appelle cette
   * fonction UNE FOIS PAR LIGNE À CHAQUE IMAGE pour savoir quelles lignes
   * appartiennent à la colonne visée : avec un `find`, quarante tâches font
   * mille six cents parcours par image, et ça se sent sur un téléphone.
   */
  const niveauParId = useMemo(() => {
    const m = new Map<string, Niveau>();
    for (const t of tasks) if (t.id) m.set(t.id, t.niveau ?? "secondaire");
    return m;
  }, [tasks]);
  const niveauDe = (id: string): Niveau => niveauParId.get(id) ?? "secondaire";

  const {
    dragId,
    ordreVisuel,
    zoneCourante: niveauCourant,
    commencerDrag,
    setRowRef,
    setZoneRef,
    grilleRef,
    glissementArmeRef,
  } = useGlisser<Niveau>({
    ordre: ordreAffiche,
    zoneDe: niveauDe,
    onDepot: (ids, changement) =>
      deposerTache(ids, changement ? { id: changement.id, niveau: changement.zone } : null),
    // Une ligne en cours de renommage ne se déplace pas : le champ a la main.
    bloque: Boolean(edition),
    zoneParDefaut: "secondaire",
  });


  /**
   * L'arrivée en cascade — vrai le temps de la première liste, puis plus jamais.
   *
   * Sans cet interrupteur, la classe d'animation resterait sur chaque ligne et
   * le moindre rendu (une case cochée, une tâche déplacée) relancerait toute la
   * colonne. Une animation qui se rejoue à chaque geste cesse d'être une
   * arrivée pour devenir un tic.
   */
  const [entree, setEntree] = useState(true);




  /*
   * La cascade s'éteint une fois jouée. Le minuteur ne démarre qu'à l'arrivée
   * de la première liste : les tâches viennent du cache puis de la base, et
   * partir du montage ferait tomber le rideau avant que rien n'ait été peint.
   */
  useEffect(() => {
    if (!entree || tasks.length === 0) return;
    const t = setTimeout(() => setEntree(false), 900);
    return () => clearTimeout(t);
  }, [entree, tasks.length]);

  /*
   * Le compte à rebours de la suppression.
   *
   * Le nettoyage de l'effet couvre TOUS les départs : le délai écoulé, une
   * seconde suppression qui prend la place, et le démontage de la carte. Dans
   * les trois cas l'effacement part pour de bon — seul « Annuler » lève le
   * drapeau qui l'en empêche. Sans ça, quitter l'accueil dans les six secondes
   * ferait réapparaître une tâche qu'on croyait supprimée.
   */
  useEffect(() => {
    if (!aSupprimer) return;
    const { id } = aSupprimer;
    let parti = false;
    const partir = () => {
      if (parti) return;
      parti = true;
      supprimerTache(id);
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

  const done = tasks.filter((t) => t.done).length;

  /*
   * L'intensité de la fête, c'est l'avancement de la journée.
   *
   * On la mesure sur le focus principal et le secondaire seulement : les
   * annexes sont ce qu'on sort de sa tête, pas ce qui fait la journée. Les
   * compter diluerait le signal — vingt annexes en attente empêcheraient
   * d'atteindre le dernier palier même en ayant tout bouclé.
   */
  const compte = tasks.filter((t) => (t.niveau ?? "secondaire") !== "annexe");
  const intensite = compte.length
    ? compte.filter((t) => t.done).length / compte.length
    : 0;
  const toutFait = compte.length > 0 && intensite === 1;

  /*
   * La journée bouclée ne se célèbre qu'une fois, à l'instant où la dernière
   * case tombe. Sans le garde sur l'état précédent, le message reviendrait à
   * chaque rendu tant que tout est coché — et donc au rechargement de la page
   * le lendemain matin, ce qui serait absurde.
   */
  const [celebre, setCelebre] = useState(false);
  const toutFaitAvant = useRef(toutFait);
  /*
   * Le garde ne suffisait pas au rechargement.
   *
   * `tasks` démarre à vide — donc « tout fait » est faux au premier rendu —
   * puis se remplit depuis le cache du navigateur : la bascule faux → vrai se
   * rejouait, et le message traversait l'écran à chaque ouverture de page
   * d'une journée déjà bouclée. Exactement ce que le garde devait empêcher.
   * On ne célèbre donc qu'une coche vue à l'écran, jamais un état trouvé là
   * en arrivant.
   */
  const listeVueUneFois = useRef(false);
  useEffect(() => {
    if (!listeVueUneFois.current) {
      // Le premier remplissage de la liste est une lecture, pas un geste.
      if (tasks.length > 0) {
        listeVueUneFois.current = true;
        toutFaitAvant.current = toutFait;
      }
      return;
    }
    if (toutFait && !toutFaitAvant.current) {
      setCelebre(true);
      const t = setTimeout(() => setCelebre(false), 2200);
      toutFaitAvant.current = toutFait;
      return () => clearTimeout(t);
    }
    toutFaitAvant.current = toutFait;
    // `tasks.length` participe : c'est son passage de zéro à la vraie liste
    // qui marque la fin du chargement, et l'effet doit le voir.
  }, [toutFait, tasks.length]);

  /*
   * La liste à afficher, avec pour chaque tâche son index d'origine dans
   * `tasks` (dont `toggleTask` a besoin) et son niveau.
   *
   * Au repos, c'est simplement `tasks` dans l'ordre. Pendant un tri, on suit
   * `ordreVisuel` et on force le niveau de la tâche tirée à `niveauCourant` —
   * la liste se réorganise ainsi sous le doigt sans écrire en base à chaque
   * micro-mouvement.
   */
  const parIndex = new Map(
    tasks.map((t, index) => [(t as { id?: string }).id, { t, index }]),
  );


  const flat: { t: (typeof tasks)[number]; index: number; niveau: Niveau }[] = dragId
    ? (() => {
        const vus = new Set(ordreVisuel);
        const suite = ordreVisuel
          .map((id) => {
            const e = parIndex.get(id);
            if (!e) return null;
            const niveau =
              id === dragId ? niveauCourant : (e.t.niveau ?? "secondaire");
            return { t: e.t, index: e.index, niveau };
          })
          .filter((x): x is { t: (typeof tasks)[number]; index: number; niveau: Niveau } =>
            Boolean(x),
          );
        // Filet : une tâche sans identifiant (amorçage) n'est pas dans l'ordre.
        const extras = tasks
          .map((t, index) => ({ t, index }))
          .filter(({ t }) => !vus.has((t as { id?: string }).id ?? ""))
          .map(({ t, index }) => ({ t, index, niveau: t.niveau ?? "secondaire" }));
        return [...suite, ...extras];
      })()
    : (() => {
        const vus = new Set(ordreAffiche);
        const suite = ordreAffiche
          .map((id) => parIndex.get(id))
          .filter((e): e is { t: (typeof tasks)[number]; index: number } => Boolean(e))
          .map(({ t, index }) => ({ t, index, niveau: t.niveau ?? "secondaire" }));
        // Une tâche sans identifiant (amorçage) n'est pas dans l'ordre.
        const extras = tasks
          .map((t, index) => ({ t, index }))
          .filter(({ t }) => !vus.has(t.id ?? ""))
          .map(({ t, index }) => ({ t, index, niveau: t.niveau ?? "secondaire" }));
        return [...suite, ...extras];
      })();

  // La tâche en sursis quitte l'écran tout de suite — c'est ce qu'on attend
  // d'une suppression — mais elle est toujours dans la liste, prête à revenir.
  const visibles = aSupprimer ? flat.filter((f) => f.t.id !== aSupprimer.id) : flat;

  const parNiveau = ORDRE_NIVEAUX.map((niveau) => ({
    niveau,
    meta: NIVEAUX[niveau],
    items: visibles.filter((f) => f.niveau === niveau),
  }));

  /**
   * Où poser un intertitre de famille.
   *
   * Seulement quand la famille compte AU MOINS DEUX tâches dans ce niveau :
   * un intertitre au-dessus d'une ligne unique n'apprend rien et double la
   * hauteur de la liste. Renvoie, pour chaque position, la famille à annoncer
   * ou `null`.
   */
  /**
   * Où poser un intertitre de famille.
   *
   * Sur des SUITES, et seulement sur des suites d'au moins deux lignes. C'est
   * la conséquence directe de l'ordre rendu à la main : deux scripts séparés
   * par un appel ne forment plus un groupe, et prétendre le contraire
   * afficherait deux fois « ✍️ ÉCRITURE 2 » dans la même colonne, pour deux
   * lignes qui ne se touchent pas. Un intertitre annonce ce qui suit
   * immédiatement, sinon il ment.
   *
   * Le compteur donne ce qu'il RESTE à faire dans la suite : c'est ce qui
   * donne envie de l'enchaîner d'une traite, et il passe au vert une fois la
   * suite bouclée.
   */
  const enTetes = (
    items: typeof flat,
  ): ({ famille: NonNullable<ReturnType<typeof familleDeTache>>; combien: number; restent: number } | null)[] => {
    const familles = items.map(({ t }) => familleDeTache(t.text));
    const sorties: ({ famille: NonNullable<ReturnType<typeof familleDeTache>>; combien: number; restent: number } | null)[] =
      items.map(() => null);

    let i = 0;
    while (i < items.length) {
      const f = familles[i];
      if (!f) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < items.length && familles[j + 1]?.id === f.id) j += 1;
      const longueur = j - i + 1;
      if (longueur >= 2) {
        sorties[i] = {
          famille: f,
          combien: longueur,
          restent: items.slice(i, j + 1).filter(({ t }) => !t.done).length,
        };
      }
      i = j + 1;
    }
    return sorties;
  };

  return (
    <Panel
      accent="var(--color-mag)"
      className="col-span-1"
      style={{
        border: "1px solid rgba(255,61,139,0.22)",
        boxShadow: "0 14px 34px -22px rgba(255,61,139,0.45)",
      }}
    >
      {celebre && (
        <div className="journee-pliee" aria-live="polite">
          <div
            className="whitespace-nowrap rounded-[18px] px-[26px] py-[16px] text-center"
            style={{
              background: "rgba(11,24,38,0.95)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 24px 70px -20px rgba(0,0,0,0.9)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div
              className="text-[30px] font-black tracking-[-0.02em]"
              style={{
                background: "var(--grad)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Journée pliée
            </div>
            <div className="mt-[3px] text-[12px] font-bold text-white/40">
              {compte.length} tâches — tout est fait
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div
          className="eyebrow tracking-[0.14em]"
          style={{ color: "var(--color-mag-soft)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--color-amb)" }}>
            ★
          </span>
          TÂCHES CLÉS
        </div>
        <div className="flex items-center gap-[7px]">
          {/*
            REGROUPER — le tri par famille, à la demande.
            Il se faisait tout seul à chaque rendu, et défaisait les
            rangements à la main : on posait une tâche en tête, elle
            atterrissait deuxième. Devenu un geste, il range quand on le
            demande, et le résultat est un ordre enregistré que rien ne défait.
          */}
          {regroupementUtile && (
            <button
              type="button"
              onClick={() => deposerTache(ordreRegroupe, null)}
              title="Mettre les tâches de même nature côte à côte"
              className="bouton-regrouper cursor-pointer rounded-[8px] px-[8px] text-[10px] font-black tracking-[0.06em] transition-all hover:brightness-125"
              style={{
                color: "var(--color-mag-soft)",
                background: "rgba(255,61,139,0.12)",
                border: "1px solid rgba(255,61,139,0.28)",
              }}
            >
              ⇅ REGROUPER
            </button>
          )}
          <div
            className="font-mono text-[11.5px] font-extrabold"
            style={{ color: "var(--color-mag-soft)" }}
          >
            {done}/{tasks.length}
          </div>
        </div>
      </div>

      {/*
        LA JAUGE DE LA JOURNÉE.

        Le « 3/8 » disait déjà tout, et ne montrait rien : deux chiffres à lire
        et à diviser de tête. La barre se voit sans être lue, et surtout elle
        BOUGE quand on coche — c'est la récompense qui manquait entre le clic
        et la fin de journée. Elle prend le dégradé de l'OS et se teinte en vert
        quand tout est plié.

        Elle compte le focus et le secondaire, pas les annexes : vingt annexes
        en attente ne doivent pas donner l'impression d'une journée ratée.
      */}
      {compte.length > 0 && (
        <div
          className="jauge-todo mt-[7px]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(intensite * 100)}
          aria-label="Avancement de la journée"
        >
          <span
            className="jauge-todo-plein"
            style={{
              width: `${Math.round(intensite * 100)}%`,
              background: toutFait ? "var(--color-ver)" : "var(--grad)",
            }}
          />
        </div>
      )}

      {enChargement && tasks.length === 0 && (
        <div className="py-6 text-center text-[12px] font-bold text-white/25">
          Lecture des tâches…
        </div>
      )}

      {!enChargement && tasks.length === 0 && (
        <EmptyState hint="Un focus principal, deux ou trois secondaires.">
          Aucune tâche
        </EmptyState>
      )}

      {/*
        Deux colonnes à partir du grand écran : le focus principal à gauche,
        large, et les deux autres empilés à droite.

        Empilés sur toute la largeur, les trois niveaux donnaient des lignes de
        1 300 px de long pour un texte de trois mots, et il fallait défiler pour
        passer du focus aux annexes. Le focus garde la plus grande colonne :
        c'est ce qui fait la journée, il ne se met pas à côté du reste à
        égalité. En dessous de 1 024 px, on reste empilé — deux colonnes de
        180 px ne rendraient service à personne.
      */}
      {/*
        LA BANDE D'ALERTE — ce qui n'a pas pu être enregistré.

        Elle garde le texte tapé et propose de réessayer. Avant, la ligne
        s'effaçait toute seule : on croyait avoir noté sa tâche, elle n'existait
        nulle part, et rien ne le disait. Une todo qui perd ce qu'on y met en
        silence ne sert plus à rien.
      */}
      {echecAjout && (
        <div
          className="sas-in mt-[9px] flex flex-wrap items-center gap-[9px] rounded-[11px] px-[10px] py-[8px]"
          role="alert"
          style={{
            background: "rgba(255,176,32,0.10)",
            border: "1px solid rgba(255,176,32,0.32)",
          }}
        >
          <span className="text-[13px] leading-none">⚠️</span>
          <span className="min-w-0 flex-1 text-[11px] font-bold leading-[1.35] text-white/75">
            « {echecAjout.texte} » n&apos;a pas pu être enregistrée — l&apos;OS ne joint
            pas la base. Rien n&apos;est perdu : réessaie.
          </span>
          <button
            type="button"
            disabled={reessaiEnCours}
            onClick={() => {
              const { texte, niveau } = echecAjout;
              setReessaiEnCours(true);
              void ajouterTache(texte, niveau).then((ok) => {
                setReessaiEnCours(false);
                if (ok) setEchecAjout(null);
              });
            }}
            className="flex-none cursor-pointer rounded-[8px] px-[11px] text-[11px] font-black transition-all hover:brightness-125 disabled:opacity-50"
            style={{
              minHeight: 36,
              color: "var(--color-fg)",
              background: "rgba(255,176,32,0.28)",
            }}
          >
            {reessaiEnCours ? "…" : "Réessayer"}
          </button>
          <button
            type="button"
            // Abandonner rend le texte au champ : on ne le fait pas disparaître
            // une seconde fois.
            onClick={() => {
              setNouvelle((p) => ({ ...p, [echecAjout.niveau]: echecAjout.texte }));
              setEchecAjout(null);
            }}
            aria-label="Récupérer le texte et fermer"
            className="flex-none cursor-pointer rounded-[8px] px-[9px] text-[13px] font-black text-white/50 transition-all hover:text-white"
            style={{ minHeight: 36, background: "rgba(255,255,255,0.06)" }}
          >
            ×
          </button>
        </div>
      )}

      {/*
        La barre du sursis. Le compte à rebours se voit — une ligne qui se vide
        en six secondes — parce qu'« Annuler » sans savoir combien de temps il
        reste, c'est un bouton qu'on n'ose pas quitter des yeux.
      */}
      {aSupprimer && (
        <div
          className="sas-in relative mt-[9px] flex items-center gap-[9px] overflow-hidden rounded-[11px] px-[10px] py-[7px]"
          role="status"
          style={{
            background: "rgba(255,61,139,0.10)",
            border: "1px solid rgba(255,61,139,0.28)",
          }}
        >
          <span className="text-[13px] leading-none">🗑️</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white/70">
            « {aSupprimer.texte} » supprimée
          </span>
          <button
            type="button"
            onClick={() => {
              annuleRef.current = true;
              setASupprimer(null);
            }}
            className="flex-none cursor-pointer rounded-[8px] px-[11px] py-[7px] text-[11px] font-black transition-all hover:brightness-125"
            style={{
              minHeight: 36,
              color: "var(--color-fg)",
              background: "rgba(255,61,139,0.30)",
            }}
          >
            Annuler
          </button>
          <span className="sablier-suppr" aria-hidden />
        </div>
      )}

      <div
        ref={grilleRef}
        className="mt-[11px] grid grid-cols-1 items-start gap-[13px] lg:grid-cols-[1.35fr_1fr] lg:gap-x-[18px]"
      >
        {parNiveau.map(({ niveau, meta, items }) => {
          const faites = items.filter(({ t }) => t.done).length;
          const titres = enTetes(items);

          return (
            <div
              key={niveau}
              ref={setZoneRef(niveau)}
              data-zone={niveau}
              /*
               * Le focus occupe les deux rangées de la colonne de gauche ; les
               * deux autres se suivent à droite. `min-height` pour qu'une
               * colonne vide reste une cible atteignable : sans elle, un
               * niveau sans tâche se réduit à son titre et on ne peut plus
               * rien y déposer.
               */
              className={[
                "zone-niveau",
                // Le cadre s'allume sur la colonne visée pendant un
                // déplacement : on sait où la tâche va atterrir AVANT de
                // lâcher, au lieu de le découvrir après.
                dragId && niveauCourant === niveau ? "zone-visee" : "",
                niveau === "principal"
                  ? "lg:col-start-1 lg:row-span-2"
                  : "lg:col-start-2",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ minHeight: items.length === 0 ? 92 : undefined }}
            >
              <div className="mb-[5px] flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className="text-[9px] font-black tracking-[0.12em]"
                    style={{ color: meta.couleur }}
                  >
                    {meta.nom}
                  </div>
                  <div className="text-[8px] font-bold tracking-[0.08em] text-white/25">
                    {meta.sousTitre}
                  </div>
                </div>
                {items.length > 0 && (
                  <span
                    className="flex-none font-mono text-[9.5px] font-bold"
                    style={{
                      color:
                        faites === items.length ? "var(--color-ver)" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {faites === items.length ? "✓ plié" : `${faites}/${items.length}`}
                  </span>
                )}
              </div>

              {/*
                La jauge de la colonne, à la couleur du niveau. Une colonne
                pliée n'est pas la même chose qu'une colonne à moitié faite, et
                le rapport « 2/5 » demandait de calculer pour s'en rendre
                compte.
              */}
              {items.length > 0 && (
                <div className="jauge-todo jauge-todo-fine mb-[6px]">
                  <span
                    className="jauge-todo-plein"
                    style={{
                      width: `${Math.round((faites / items.length) * 100)}%`,
                      background:
                        faites === items.length ? "var(--color-ver)" : meta.couleur,
                    }}
                  />
                </div>
              )}

              {/*
                UN FOCUS, PAS CINQ.

                Le niveau « principal » ne vaut que par sa rareté : dès qu'il
                contient toute la journée, il ne désigne plus rien et la todo
                redevient une liste à plat. Un mot, jamais un blocage — c'est sa
                journée, pas la nôtre.
              */}
              {niveau === "principal" && items.filter(({ t }) => !t.done).length > 3 && (
                <div
                  className="mb-[6px] rounded-[8px] px-[8px] py-[5px] text-[10px] font-bold leading-[1.35]"
                  style={{
                    color: "var(--color-amb)",
                    background: "rgba(255,176,32,0.09)",
                    border: "1px solid rgba(255,176,32,0.22)",
                  }}
                >
                  {`${items.filter(({ t }) => !t.done).length} focus en même temps — un focus, ce n'est pas cinq. Glisse le reste en secondaire.`}
                </div>
              )}

              {/*
                Le champ d'ajout EN TÊTE de pile, jamais en bas : plus la liste
                s'allonge, plus un champ en bas s'éloigne — Twaylo veut poser
                une tâche d'un geste, pas défiler pour trouver où l'écrire.
              */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const texte = nouvelle[niveau] ?? "";
                  if (!texte.trim()) return;
                  // Le champ se vide tout de suite — la ligne est déjà à
                  // l'écran. Si la base refuse, le texte réapparaît dans la
                  // bande d'alerte plutôt que de se volatiliser.
                  setNouvelle((p) => ({ ...p, [niveau]: "" }));
                  void ajouterTache(texte, niveau).then((ok) => {
                    if (!ok) setEchecAjout({ texte, niveau });
                  });
                }}
                className="mb-[5px]"
              >
                {/*
                  L'EMOJI APPARAÎT PENDANT QU'ON TAPE.

                  L'OS déduit une pastille de l'intitulé, et jusqu'ici on la
                  découvrait après coup, une fois la tâche posée. La montrer
                  dans le champ change la nature de la chose : ce n'est plus une
                  décoration appliquée dans le dos, c'est une réponse. On écrit
                  « appeler », le téléphone apparaît, et on sait que l'OS a
                  compris avant même d'avoir validé.
                */}
                <div className="relative">
                  {apercus[niveau] && (
                    <span
                      // La clé change avec l'emoji : le nœud est remplacé, donc
                      // l'animation se rejoue à chaque fois qu'il change. Sans
                      // ça, elle ne jouerait qu'une seule fois par saisie.
                      key={apercus[niveau]}
                      aria-hidden
                      className="apercu-emoji pointer-events-none absolute left-[8px] top-1/2 -translate-y-1/2 text-[13px] leading-none"
                    >
                      {apercus[niveau]}
                    </span>
                  )}
                <input
                  value={nouvelle[niveau] ?? ""}
                  onChange={(e) =>
                    setNouvelle((p) => ({ ...p, [niveau]: e.target.value }))
                  }
                  /*
                   * COLLER UNE LISTE CRÉE TOUTE LA LISTE.
                   *
                   * Un champ de saisie écrase les retours à la ligne d'un
                   * collage : les six tâches notées sur son téléphone
                   * arrivaient sur une seule ligne, qu'il fallait redécouper à
                   * la main. On lit donc le presse-papiers avant que le
                   * navigateur ne l'aplatisse, et chaque ligne devient une
                   * tâche. Un collage d'une seule ligne suit le chemin normal.
                   */
                  onPaste={(e) => {
                    const brut = e.clipboardData.getData("text");
                    if (!brut.includes("\n")) return;
                    const lignes = lignesCollees(brut);
                    if (lignes.length < 2) return;
                    e.preventDefault();
                    void (async () => {
                      // À l'envers : chaque ajout se pose en tête de pile, donc
                      // partir de la fin remet la liste dans l'ordre tapé.
                      for (const l of [...lignes].reverse()) {
                        const ok = await ajouterTache(l, niveau);
                        if (!ok) {
                          setEchecAjout({ texte: l, niveau });
                          break;
                        }
                      }
                    })();
                  }}
                  placeholder={`+ ${meta.nom.toLowerCase()}`}
                  aria-label={`Ajouter une tâche — ${meta.nom.toLowerCase()}`}
                  className={`w-full rounded-[8px] py-[5px] text-[11px] font-semibold text-white outline-none transition-all focus:border-white/25 ${
                    apercus[niveau] ? "pl-[29px] pr-[9px]" : "px-[9px]"
                  }`}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                />
                </div>
              </form>

              <div className="flex flex-col gap-[4px]">
                {items.map(({ t, index }, i) => {
                  const id = (t as { id?: string }).id;

                  // En cours de renommage : le champ remplace la ligne.
                  if (id && edition === id) {
                    return (
                      <form
                        key={id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          renommerTache(id, brouillon);
                          setEdition(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={brouillon}
                          onChange={(e) => setBrouillon(e.target.value)}
                          onBlur={() => {
                            renommerTache(id, brouillon);
                            setEdition(null);
                          }}
                          // Échap annule : sans ça, une correction ratée ne se
                          // rattrape qu'en retapant l'ancien texte de mémoire.
                          onKeyDown={(e) => e.key === "Escape" && setEdition(null)}
                          aria-label={`Renommer ${t.text}`}
                          className="w-full rounded-[9px] px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none"
                          style={{
                            background: "rgba(255,61,139,0.10)",
                            border: "1px solid rgba(255,61,139,0.35)",
                          }}
                        />
                      </form>
                    );
                  }

                  const tire = dragId === id;
                  const ouvert = Boolean(id) && menu === id;
                  const enTete = titres[i];

                  return (
                    <Fragment key={id ?? t.text}>
                    {/*
                      L'intertitre d'une famille : « 🎬 Vidéo · 3 ».
                      Il n'apparaît qu'à partir de deux tâches de même nature —
                      au-dessus d'une ligne unique, il n'apprendrait rien et
                      doublerait la hauteur de la liste.
                    */}
                    {enTete && !tire && (
                      <div className="famille-titre mt-[3px] flex items-center gap-[7px] pl-[2px] first:mt-0">
                        <span className="text-[12px] leading-none">
                          {enTete.famille.emoji}
                        </span>
                        <span className="text-[9.5px] font-black tracking-[0.1em] text-white/35">
                          {enTete.famille.nom.toUpperCase()}
                        </span>
                        {/*
                          Combien il en reste, pas combien il y en a.
                          « ÉCRITURE · 3 » alors que deux sont déjà cochées ne
                          dit rien de ce qu'il y a à faire. Le chiffre sert à
                          décider d'enchaîner la famille d'une traite : c'est
                          donc le reste à faire qui compte, et il s'éteint
                          quand la famille est finie.
                        */}
                        <span
                          className="flex-none rounded-[5px] px-[4px] py-[1px] font-mono text-[9px] font-black leading-none"
                          style={
                            enTete.restent > 0
                              ? { color: "var(--color-fg)", background: "rgba(255,255,255,0.08)" }
                              : { color: "var(--color-ver)", background: "rgba(255,255,255,0.04)" }
                          }
                        >
                          {enTete.restent > 0 ? enTete.restent : "✓"}
                        </span>
                        <span
                          className="h-[1px] flex-1 rounded-full"
                          style={{ background: "rgba(255,255,255,0.07)" }}
                        />
                      </div>
                    )}
                    <div
                      ref={id ? setRowRef(id) : undefined}
                      data-niveau={niveau}
                      // Tenir la ligne appuyée suffit à la déplacer : la poignée
                      // reste pour qui préfère viser, mais elle n'est plus le
                      // seul moyen.
                      onPointerDown={
                        id ? (e) => commencerDrag(e, id, niveau, false) : undefined
                      }
                      /*
                       * `tache-entree` : L'ARRIVÉE EN CASCADE, une seule fois
                       * par ouverture.
                       *
                       * La liste apparaissait d'un bloc, comme un tableau qu'on
                       * affiche. Elle se pose maintenant ligne à ligne, 35 ms
                       * d'écart — assez pour que l'œil descende la colonne et
                       * voie ce qu'il y a à faire, assez peu pour que la
                       * dernière soit là avant qu'on ait fini de regarder.
                       * Plafonné à dix crans : au-delà on attendrait la liste
                       * au lieu de la lire.
                       *
                       * `entree` ne vaut vrai qu'au premier affichage : sans
                       * ça, cocher une case rejouerait toute l'animation.
                       */
                      className={`group relative flex items-stretch gap-[5px]${
                        entree ? " tache-entree" : ""
                      }${t.gelee ? " tache-gelee" : ""}`}
                      // Pendant le tri, la ligne tirée devient un trou invisible
                      // (elle garde sa boîte = l'emplacement de dépôt) : tout le
                      // visuel passe par le clone flottant.
                      style={{
                        ...(tire ? { visibility: "hidden" as const } : null),
                        ...(entree
                          ? ({ "--retard": `${Math.min(i, 10) * 35}ms` } as React.CSSProperties)
                          : null),
                      }}
                    >
                      {/* Cible de dépôt. `visibility:visible` la ré-affiche
                          malgré le parent masqué : un descendant visible d'un
                          ancêtre caché reste visible. */}
                      {tire && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-[11px]"
                          style={{
                            visibility: "visible",
                            border: "2px dashed var(--color-mag)",
                            background: "rgba(255,61,139,0.10)",
                          }}
                        />
                      )}

                      {/*
                        La poignée. Toujours visible — le survol n'existe pas au
                        doigt — et dimensionnée dans `globals.css` : 40 px au
                        doigt, 22 px à la souris. Elle mesurait 14 px, et comme
                        elle est la seule prise qui porte `touch-action: none`,
                        elle était à la fois indispensable et invisable.
                      */}
                      {id && (
                        <button
                          type="button"
                          aria-label={`Déplacer ${t.text}`}
                          title="Glisser pour ranger"
                          onPointerDown={(e) => commencerDrag(e, id, niveau, true)}
                          className="poignee-tache flex flex-none items-center justify-center text-[13px] leading-none text-white/25 transition-colors hover:text-white/60"
                          style={{ cursor: tire ? "grabbing" : "grab" }}
                        >
                          ⠿
                        </button>
                      )}

                      <div className="ligne-tache relative flex-1">
                        <CheckRow
                          /*
                           * Une pastille en tête de ligne, déduite de
                           * l'intitulé.
                           *
                           * Dix lignes de même taille, même couleur, même
                           * alignement : la liste ne se lit pas, elle se
                           * survole — et ce qui n'est pas lu n'est pas fait.
                           * L'emoji donne à chaque tâche une silhouette, et
                           * l'œil retrouve la bonne sans déchiffrer les neuf
                           * autres.
                           */
                          label={`${emojiPourTache(t.text, niveau)} ${t.text}`.trim()}
                          meta={t.categorie}
                          /*
                           * Pas d'âge sur une tâche gelée : elle est vieille
                           * par nature. « Poster sur Snap » date du jour où on
                           * l'a écrite et ne bougera plus — la marquer « 12j »
                           * serait un reproche adressé à une corvée faite tous
                           * les jours. Le flocon dit déjà ce qu'elle est.
                           */
                          badge={
                            t.gelee
                              ? {
                                  texte: "❄️",
                                  couleur: "var(--color-cya)",
                                  titre:
                                    "Gelée : elle revient tous les jours et survit au passage au jour suivant",
                                }
                              : vieillesse(ageEnJours(t.creeLe, aujourdhui))
                          }
                          done={t.done}
                          accent={meta.couleur}
                          intensite={intensite}
                          // Le clic part au relâchement, donc après un
                          // déplacement : sans cette garde, ranger une tâche la
                          // cocherait dans la foulée.
                          onToggle={() => {
                            /*
                             * La garde se désarme en la consommant.
                             *
                             * Elle n'était remise à faux qu'au début du
                             * glissement suivant : après un rangement, tout
                             * clic qui ne passe pas par là — sur la barre
                             * d'actions, sur une ligne en cours de
                             * renommage, ou au clavier, qui n'émet aucun
                             * événement de pointeur — restait avalé en
                             * silence. Elle ne bloque plus qu'une fois : le
                             * clic né du déplacement.
                             */
                            if (glissementArmeRef.current) {
                              glissementArmeRef.current = false;
                              return;
                            }

                            /*
                             * DEUX APPUIS RAPPROCHÉS : on gèle.
                             *
                             * Le premier appui a déjà coché — et c'est
                             * volontaire. Retarder la coche de 300 ms pour
                             * voir si un second appui arrive rendrait
                             * poussif le geste le plus fréquent de l'OS. On
                             * coche donc tout de suite, et le second appui
                             * ANNULE le premier avant de geler : la case
                             * revient où elle était, et la tâche prend son
                             * flocon.
                             */
                            const maintenant = Date.now();
                            const suite =
                              id &&
                              dernierTapRef.current.id === id &&
                              maintenant - dernierTapRef.current.quand < 380;
                            if (suite && id) {
                              dernierTapRef.current = { id: null, quand: 0 };
                              toggleTask(index);
                              basculerGelTache(id);
                              if (
                                !window.matchMedia("(prefers-reduced-motion: reduce)").matches
                              ) {
                                (navigator as NavVibr).vibrate?.([10, 40, 10]);
                              }
                              return;
                            }
                            dernierTapRef.current = { id: id ?? null, quand: maintenant };
                            toggleTask(index);
                          }}
                        />
                        {id && (
                          <button
                            type="button"
                            // La ligne entière arme un déplacement : sans cette
                            // coupure, viser le bouton en bougeant un peu le
                            // doigt partirait en glissement.
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => setMenu((m) => (m === id ? null : id))}
                            aria-expanded={menu === id}
                            aria-label={`Actions sur ${t.text}`}
                            title="Déplacer, renommer, supprimer"
                            className="bouton-ligne absolute right-[3px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-[9px] text-[15px] font-black leading-none text-white/35 transition-all hover:text-white"
                            style={{ background: "rgba(17,30,44,0.96)" }}
                          >
                            ⋯
                          </button>
                        )}
                      </div>
                    </div>

                    {/*
                      Les actions, DÉPLIÉES SOUS LA LIGNE — pas en bulle.

                      Ce qu'il y avait avant : trois boutons de dix-huit pixels
                      collés les uns aux autres au bord droit de la ligne, et
                      visibles au survol seulement. Au doigt, viser « déplacer »
                      sans toucher « supprimer » relevait de la chance ; sur
                      téléphone, où le survol n'existe pas, il fallait déjà
                      deviner qu'ils étaient là. Et « ⇅ » faisait tourner le
                      niveau en aveugle : on ne savait pas où la tâche partait
                      avant de l'y voir arriver.

                      Ici tout est nommé et fait 44 px de haut. Déplié en place
                      plutôt qu'en bulle flottante : une bulle se fait rogner
                      par la carte, ou sort de l'écran sur la dernière ligne.
                    */}
                    {/*
                      Le panneau disparaît pendant que SA ligne est déplacée.

                      Il est frère de la ligne, pas son enfant : la ligne
                      devient un trou invisible le temps du glissement, mais le
                      panneau, lui, restait affiché — un bloc de boutons
                      flottant dans la liste, rattaché à rien, qui décalait en
                      plus les lignes voisines et donc les cibles de dépôt.
                    */}
                    {ouvert && id && !tire && (
                      <div
                        className="sas-in flex flex-col gap-[6px] rounded-[12px] p-[8px]"
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}
                      >
                        {/*
                          CHOISIR L'EMOJI — et donc le groupe.

                          La déduction se trompe forcément parfois : « Vérité
                          #12 » est une vidéo, aucun mot ne le dit. Plutôt que
                          d'ajouter des règles à l'infini pour deviner un
                          vocabulaire qui n'est qu'à lui, on laisse trancher en
                          un geste — et le choix REGROUPE : poser 🎬 sur une
                          tâche l'envoie rejoindre les autres vidéos.

                          Une palette de familles, pas le clavier d'emojis : une
                          tâche pastèque ne se regrouperait avec rien.
                        */}
                        <div className="px-[3px] text-[9.5px] font-black tracking-[0.1em] text-white/30">
                          EMOJI
                        </div>
                        <div className="flex flex-wrap gap-[4px]">
                          {(() => {
                            const pose = emojiDeTete(t.text);
                            const vu = emojiVisible(t.text, niveau);
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => renommerTache(id, avecEmoji(t.text, null))}
                                  title="Laisser l'OS choisir d'après l'intitulé"
                                  className="flex h-[36px] cursor-pointer items-center justify-center rounded-[9px] px-[9px] text-[10px] font-black transition-all hover:brightness-125"
                                  style={
                                    pose
                                      ? {
                                          color: "rgba(255,255,255,0.55)",
                                          background: "rgba(255,255,255,0.05)",
                                        }
                                      : {
                                          color: "var(--color-mag-soft)",
                                          background: "rgba(255,61,139,0.14)",
                                          border: "1.5px solid var(--color-mag)",
                                        }
                                  }
                                >
                                  {vu} AUTO
                                </button>
                                {PALETTE.map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => renommerTache(id, avecEmoji(t.text, f.emoji))}
                                    title={f.nom}
                                    aria-label={f.nom}
                                    aria-pressed={pose === f.emoji}
                                    className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded-[9px] text-[15px] leading-none transition-all hover:brightness-125"
                                    style={
                                      pose === f.emoji
                                        ? {
                                            background: "rgba(255,61,139,0.16)",
                                            border: "1.5px solid var(--color-mag)",
                                          }
                                        : { background: "rgba(255,255,255,0.05)" }
                                    }
                                  >
                                    {f.emoji}
                                  </button>
                                ))}
                              </>
                            );
                          })()}
                        </div>

                        <div className="mt-[3px] px-[3px] text-[9.5px] font-black tracking-[0.1em] text-white/30">
                          DÉPLACER VERS
                        </div>
                        <div className="flex gap-[5px]">
                          {ORDRE_NIVEAUX.map((n) => {
                            const ici = n === niveau;
                            return (
                              <button
                                key={n}
                                type="button"
                                disabled={ici}
                                onClick={() => {
                                  changerNiveauTache(id, n);
                                  setMenu(null);
                                }}
                                className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] px-[6px] text-[11px] font-black leading-[1.15] transition-all hover:brightness-125 disabled:cursor-default"
                                style={
                                  ici
                                    ? {
                                        color: NIVEAUX[n].couleur,
                                        background: "rgba(255,255,255,0.05)",
                                        border: `1.5px solid ${NIVEAUX[n].couleur}`,
                                      }
                                    : {
                                        color: "rgba(255,255,255,0.75)",
                                        background: "rgba(255,255,255,0.05)",
                                        border: "1.5px solid rgba(255,255,255,0.1)",
                                      }
                                }
                              >
                                {NIVEAUX[n].nom}
                                {ici && (
                                  <span className="mt-[2px] block text-[8.5px] font-black tracking-[0.08em] opacity-70">
                                    ICI
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {/*
                          GELER — le même geste que le double-tap, mais nommé.
                          Le raccourci ne se devine pas ; ce bouton l'apprend,
                          et sert à ceux qui préfèrent viser.
                        */}
                        <button
                          type="button"
                          onClick={() => basculerGelTache(id)}
                          className="mt-[2px] min-h-[44px] cursor-pointer rounded-[10px] px-[10px] text-left text-[11px] font-extrabold leading-[1.3] transition-all hover:brightness-125"
                          style={
                            t.gelee
                              ? {
                                  color: "var(--color-cya)",
                                  background: "rgba(34,211,238,0.12)",
                                  border: "1.5px solid var(--color-cya)",
                                }
                              : {
                                  color: "rgba(255,255,255,0.7)",
                                  background: "rgba(255,255,255,0.05)",
                                }
                          }
                        >
                          {t.gelee
                            ? "❄️ Gelée — elle revient chaque jour. Appuyer pour dégeler"
                            : "❄️ Geler — la garder tous les jours (ou double-tap)"}
                        </button>

                        <div className="mt-[2px] flex gap-[5px]">
                          <button
                            type="button"
                            onClick={() => {
                              setBrouillon(t.text);
                              setEdition(id);
                              setMenu(null);
                            }}
                            className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] text-[12px] font-extrabold text-white/70 transition-all hover:brightness-125"
                            style={{ background: "rgba(255,255,255,0.05)" }}
                          >
                            ✎ Renommer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // En sursis : la barre « Annuler » décide de la
                              // suite. Voir l'effet du compte à rebours.
                              setASupprimer({ id, texte: t.text });
                              setMenu(null);
                            }}
                            className="min-h-[44px] flex-1 cursor-pointer rounded-[10px] text-[12px] font-extrabold transition-all hover:brightness-125"
                            style={{
                              color: "var(--color-mag-soft)",
                              background: "rgba(255,61,139,0.12)",
                            }}
                          >
                            × Supprimer
                          </button>
                        </div>
                      </div>
                    )}
                    </Fragment>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>

      {/*
        Pas de journée type ici.
        Elle avait sa propre section en bas de cette carte, en plus de sa carte
        à elle, juste à côté sur l'accueil : les mêmes sept lignes affichées
        deux fois sur le même écran. Deux listes identiques, ça ne double pas
        l'information, ça fait douter de laquelle est la vraie. Elle vit
        maintenant à un seul endroit — la carte JOURNÉE TYPE — où on peut aussi
        changer de modèle et la modifier. Cocher là-bas met à jour le même état
        central, donc rien n'est perdu au passage.
      */}

      {/* Passer au jour suivant : archive la todo, garde les tâches non faites. */}
      <div className="mt-[14px] border-t border-white/10 pt-[11px]">
        {clotureeAujourdhui && tasks.length === 0 ? (
          <div className="text-center text-[10.5px] font-bold text-white/30">
            Journée clôturée · liste prête pour demain
          </div>
        ) : !confirmeCloture ? (
          <button
            type="button"
            onClick={() => setConfirmeCloture(true)}
            disabled={tasks.length === 0}
            className="w-full cursor-pointer rounded-[9px] py-[8px] text-[11.5px] font-black tracking-[0.04em] transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-25"
            style={{
              color: "var(--color-mag-soft)",
              background: "rgba(255,61,139,0.10)",
              border: "1px solid rgba(255,61,139,0.22)",
            }}
          >
            Passer au jour suivant →
          </button>
        ) : (
          <div className="flex flex-col gap-[7px]">
            <div className="text-center text-[10.5px] font-bold leading-[1.4] text-white/45">
              La todo du jour part dans l&apos;historique. Les tâches faites
              disparaissent, celles qui restent passent à demain. On y va&nbsp;?
            </div>
            <div className="flex gap-[7px]">
              <button
                type="button"
                onClick={() => setConfirmeCloture(false)}
                disabled={clotureEnCours}
                className="flex-1 cursor-pointer rounded-[9px] py-[8px] text-[11px] font-extrabold text-white/55 transition-all hover:brightness-125 disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  setClotureEnCours(true);
                  await passerJourSuivant();
                  setClotureEnCours(false);
                  setConfirmeCloture(false);
                }}
                disabled={clotureEnCours}
                className="flex-1 cursor-pointer rounded-[9px] py-[8px] text-[11px] font-black text-[#07121d] transition-all hover:brightness-110 disabled:opacity-60"
                style={{ background: "var(--grad)" }}
              >
                {clotureEnCours ? "Archivage…" : "Oui, nouvelle journée"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
