"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useOs } from "@/lib/os-context";
import { NIVEAUX, type Niveau } from "@/lib/types";
import { localDateKey } from "@/lib/local-date";
import { emojiPourTache, familleDeTache } from "@/lib/emoji-tache";
import { CheckRow, EmptyState } from "@/components/ui";
import { Panel } from "@/components/Panel";

const ORDRE_NIVEAUX: Niveau[] = ["principal", "secondaire", "annexe"];

/**
 * Déplace `id` juste avant (ou après) `survole` dans la liste d'identifiants.
 * Le drapeau `apres` vient de la moitié de ligne survolée : sous le milieu, on
 * insère en dessous — c'est ce qui rend le tri fluide au doigt.
 */
function deplacer(ids: string[], id: string, survole: string, apres: boolean): string[] {
  const sans = ids.filter((x) => x !== id);
  let i = sans.indexOf(survole);
  if (i === -1) return ids;
  if (apres) i += 1;
  sans.splice(i, 0, id);
  return sans;
}

type Cible = { id: string; niveau: Niveau; apres: boolean };

/** navigator.vibrate n'est pas dans tous les typages ; on le decrit ici. */
type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

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
  /** L'identifiant de la tâche en cours de renommage, s'il y en a une. */
  const [edition, setEdition] = useState<string | null>(null);
  /**
   * La tâche dont les actions sont dépliées. Une seule à la fois : deux
   * panneaux ouverts, et la liste devient illisible.
   */
  const [menu, setMenu] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");

  /** Le bouton « passer au jour suivant » demande confirmation avant de vider. */
  const [confirmeCloture, setConfirmeCloture] = useState(false);
  const [clotureEnCours, setClotureEnCours] = useState(false);
  const clotureeAujourdhui = todoCloturee === localDateKey();

  /* ------------------------------------------------------------------ */
  /* Glisser-déposer                                                     */
  /* ------------------------------------------------------------------ */

  // L'identifiant de la tâche tirée, sinon null. `ordreVisuel` est l'ordre des
  // identifiants pendant le tri ; `niveauCourant` le niveau que la tâche tirée
  // vient d'adopter. Chaque état est doublé d'un ref pour que les écouteurs de
  // pointeur lisent toujours la valeur fraîche.
  const [dragId, setDragId] = useState<string | null>(null);
  const [ordreVisuel, setOrdreVisuel] = useState<string[]>([]);
  const [niveauCourant, setNiveauCourant] = useState<Niveau>("secondaire");
  const ordreRef = useRef<string[]>([]);
  const niveauRef = useRef<Niveau>("secondaire");
  const niveauInitialRef = useRef<Niveau>("secondaire");
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  // Le clone flottant (dans document.body), la position du pointeur, l'offset
  // de prise, et les identifiants d'animation à annuler proprement.
  const proxyRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const grabRef = useRef({ x: 0, y: 0 });
  /** Hauteur de la ligne tirée : sert à viser d'après la carte, pas le doigt. */
  const hauteurRef = useRef(0);
  /**
   * Vrai dès qu'un appui s'est transformé en déplacement.
   *
   * On peut désormais saisir une tâche n'importe où sur la ligne — or la ligne
   * sert aussi à cocher. Le clic part après le relâchement : sans ce drapeau,
   * ranger une tâche la cocherait par la même occasion.
   */
  const glissementArmeRef = useRef(false);
  const rafProxy = useRef(0);
  const rafMove = useRef<number | null>(null);
  const rafScroll = useRef<number | null>(null);
  // Le pointeur (doigt/souris) qui a armé le drag. On ignore tout autre contact,
  // sinon un second doigt posé puis levé terminerait le glissement à sa place.
  const idPointeurRef = useRef<number | null>(null);
  // Vitesse d'auto-défilement, relue à chaque frame pour rester proportionnelle
  // à la profondeur du doigt dans la zone de bord (sinon elle se figeait à la
  // première valeur).
  const vScrollRef = useRef(0);
  // Défilement de page au dernier instantané FLIP : on le retranche des deltas,
  // sinon un réordonnancement pendant l'auto-scroll ferait glisser toutes les
  // voisines de la valeur du scroll.
  const scrollPrevRef = useRef(0);
  // A-t-on réellement réordonné ? Sinon (simple clic sur la poignée), rien à
  // persister — pas d'écriture réseau inutile.
  const aReordonneRef = useRef(false);
  // Minuteur d'appui-long, coupé si le composant se démonte avant l'armement.
  const preArmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Positions de toutes les lignes AVANT le dernier réordonnancement, indexées
  // par identifiant sur les trois sections — c'est ce qui permet à une ligne
  // qui change de niveau (donc de parent DOM) de glisser comme une voisine.
  const prevRects = useRef(new Map<string, DOMRect>());
  const reduireRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduireRef.current = mq.matches;
    const suivre = () => (reduireRef.current = mq.matches);
    mq.addEventListener("change", suivre);
    return () => mq.removeEventListener("change", suivre);
  }, []);

  const setRowRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  function mesurerToutes() {
    const m = new Map<string, DOMRect>();
    for (const [id, el] of rowRefs.current) m.set(id, el.getBoundingClientRect());
    return m;
  }

  function defilementPage() {
    return document.scrollingElement ?? document.documentElement;
  }

  // La boucle qui colle le clone au doigt : transform pur, aucune transition,
  // coordonnées viewport (fixed) — il suit même si la page défile, sans jamais
  // lire une position de layout.
  function boucleProxy() {
    const w = proxyRef.current;
    if (!w) return;
    const { x, y } = pointerRef.current;
    const g = grabRef.current;
    w.style.transform = `translate3d(${x - g.x}px,${y - g.y}px,0)`;
    rafProxy.current = requestAnimationFrame(boucleProxy);
  }

  /**
   * Début d'un glissement, sur la poignée.
   *
   * Au doigt, on n'arme qu'après un court appui (140 ms) et si le doigt n'a pas
   * bougé de plus de 8 px — sinon un simple défilement partant de la poignée
   * déclencherait un tri par accident. À la souris, c'est immédiat.
   */
  /*
   * L'ordre REGROUPÉ : les tâches de même nature deviennent voisines.
   *
   * Trois scripts dispersés entre un appel et une facture, ce sont trois
   * changements de contexte — et c'est le changement de contexte qui fatigue,
   * pas le travail. Côte à côte, ils se font en une passe.
   *
   * Le tri est STABLE et se fait sur la première apparition de la famille :
   * l'ordre qu'on a rangé à la main est donc préservé à l'intérieur d'une
   * famille, et tirer une tâche en tête de liste y emmène toute sa famille
   * plutôt que de la laisser revenir en arrière toute seule.
   *
   * C'est l'ORDRE qui est trié, pas seulement l'affichage : le glissement lit
   * la même liste (voir `ordreRef` au démarrage d'un tri), donc rien ne saute
   * au moment où l'on pose le doigt.
   */
  const ordreGroupe = useMemo(() => {
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

  function commencerDrag(
    e: React.PointerEvent,
    id: string,
    niveau: Niveau,
    depuisPoignee: boolean,
  ) {
    if (edition) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = rowRefs.current.get(id);
    if (!row) return;
    // Nouvelle séquence d'appui : le glissement précédent ne compte plus.
    glissementArmeRef.current = false;
    // Depuis la ligne, on ne coupe RIEN : le clic doit continuer de cocher si
    // l'appui reste court. Depuis la poignée, on coupe tout de suite — elle ne
    // sert qu'à ranger.
    if (depuisPoignee) {
      e.preventDefault();
      e.stopPropagation();
    }

    const idPointeur = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    pointerRef.current = { x: sx, y: sy };
    let arme = false;

    const nettoyerPre = () => {
      if (preArmRef.current) {
        clearTimeout(preArmRef.current);
        preArmRef.current = null;
      }
      window.removeEventListener("pointermove", surMovePre);
      window.removeEventListener("pointerup", nettoyerPre);
      window.removeEventListener("pointercancel", nettoyerPre);
    };

    const armer = () => {
      arme = true;
      glissementArmeRef.current = true;
      preArmRef.current = null;
      idPointeurRef.current = idPointeur;
      aReordonneRef.current = false;
      const r = row.getBoundingClientRect();
      grabRef.current = {
        x: pointerRef.current.x - r.left,
        y: pointerRef.current.y - r.top,
      };
      hauteurRef.current = r.height;
      if (!reduireRef.current) (navigator as NavVibr).vibrate?.(8);

      // Clone flottant : un conteneur qui suit le doigt (translate) enveloppant
      // la copie de la ligne, sur laquelle joue le lift (scale) — séparer les
      // deux transforms laisse le suivi rester 1:1 pendant que le lift s'anime.
      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, {
        position: "fixed",
        top: "0",
        left: "0",
        margin: "0",
        width: `${r.width}px`,
        height: `${r.height}px`,
        pointerEvents: "none",
        zIndex: "60",
        willChange: "transform",
        transform: `translate3d(${pointerRef.current.x - grabRef.current.x}px,${pointerRef.current.y - grabRef.current.y}px,0)`,
      });
      const inner = row.cloneNode(true) as HTMLElement;
      Object.assign(inner.style, {
        margin: "0",
        width: "100%",
        borderRadius: "11px",
        boxShadow: reduireRef.current
          ? "0 0 0 1px var(--color-mag)"
          : "0 18px 40px -12px rgba(255,61,139,0.45), 0 0 0 1px rgba(255,61,139,0.45)",
        transform: "scale(1)",
        transition: reduireRef.current ? "none" : "transform 90ms ease-out",
      });
      wrapper.appendChild(inner);
      document.body.appendChild(wrapper);
      proxyRef.current = wrapper;
      if (!reduireRef.current) {
        requestAnimationFrame(() => {
          inner.style.transform = "scale(1.03)";
        });
      }

      /*
       * TOUS les identifiants, y compris les `tmp-…` que le serveur n'a pas
       * encore confirmés.
       *
       * Les exclure ici était un piège : l'ordre visuel pilote l'affichage
       * pendant le glissement, et une tâche absente de cet ordre est rejetée
       * à la fin (`extras`). La tâche à peine tapée, posée en tête, sautait
       * donc en bas de sa section dès qu'on attrapait une autre ligne — puis
       * y restait après le dépôt. Le filtrage a bien lieu, mais au seul
       * moment où il compte : la composition du corps envoyé au serveur
       * (voir `deposerTache`).
       */
      /*
       * L'ordre REGROUPÉ, pas l'ordre brut : c'est celui qui est à l'écran.
       * Partir de l'autre ferait sauter toute la liste au premier appui.
       *
       * Lu par fermeture plutôt que par une référence : cette fonction est
       * redéclarée à chaque rendu, elle voit donc l'ordre qui était affiché au
       * moment où le doigt s'est posé — exactement ce qu'il faut.
       */
      const ordre = ordreGroupe;
      ordreRef.current = ordre;
      niveauRef.current = niveau;
      niveauInitialRef.current = niveau;
      // Figer les positions ET le défilement AVANT tout réordonnancement : c'est
      // le « First » du FLIP des voisines, et la référence de scroll.
      prevRects.current = mesurerToutes();
      scrollPrevRef.current = defilementPage().scrollTop;

      setOrdreVisuel(ordre);
      setNiveauCourant(niveau);
      setDragId(id);
      boucleProxy();
      nettoyerPre();
    };

    const tactile = e.pointerType === "touch";
    // À la souris, saisir la ligne elle-même ne peut pas armer sur-le-champ :
    // un simple clic servirait alors à ranger au lieu de cocher. On attend un
    // vrai geste — quelques pixels parcourus, bouton enfoncé.
    const seuilSouris = !tactile && !depuisPoignee;

    const surMovePre = (ev: PointerEvent) => {
      if (ev.pointerId !== idPointeur) return;
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      if (arme) return;
      const distance = Math.hypot(ev.clientX - sx, ev.clientY - sy);
      if (seuilSouris) {
        if (distance > 6) armer();
      } else if (distance > 8) {
        // Au doigt, s'éloigner avant l'appui long, c'est vouloir faire défiler
        // la page : on abandonne et on laisse le geste au navigateur.
        nettoyerPre();
      }
    };

    // Depuis la ligne, l'appui doit être plus franc que depuis la poignée : on
    // couvre ainsi le tap qui coche, qui est le geste le plus fréquent.
    const delai = tactile ? (depuisPoignee ? 140 : 220) : 0;

    if (!tactile && depuisPoignee) {
      armer();
      return;
    }

    window.addEventListener("pointermove", surMovePre, { passive: true });
    window.addEventListener("pointerup", nettoyerPre, { once: true });
    window.addEventListener("pointercancel", nettoyerPre, { once: true });
    if (tactile) preArmRef.current = setTimeout(armer, delai);
  }

  // Écoute du geste une fois armé : pointermove coalescé dans un seul rAF (une
  // cible + un auto-scroll par frame), et le lâcher qui fait atterrir le clone
  // puis persiste. `passive:false` autorise le preventDefault anti-défilement.
  useEffect(() => {
    if (!dragId) return;
    let derniere: string | null = null;
    let relache = false;

    function cibleSous(clientY: number): Cible | null {
      let meilleur: Cible | null = null;
      let distance = Infinity;
      for (const [id, el] of rowRefs.current) {
        if (id === dragId) continue;
        const r = el.getBoundingClientRect();
        const niveau = (el.dataset.niveau as Niveau) || "secondaire";
        const milieu = (r.top + r.bottom) / 2;
        if (clientY >= r.top && clientY <= r.bottom) {
          const d = clientY - milieu;
          // Zone morte de 4 px autour du milieu : tue le clignotement d'un cran
          // quand le doigt hésite pile à la frontière.
          if (Math.abs(d) < 4) return null;
          return { id, niveau, apres: d > 0 };
        }
        const dm = Math.abs(clientY - milieu);
        if (dm < distance) {
          distance = dm;
          meilleur = { id, niveau, apres: clientY > milieu };
        }
      }
      return meilleur;
    }

    // Recalcule la cible de dépôt et réordonne si besoin. Appelée depuis le
    // pointermove ET depuis la boucle d'auto-scroll : pendant un défilement à
    // doigt immobile, les lignes bougent sous le doigt, il faut recibler.
    function appliquerCible() {
      /*
       * On vise avec le CENTRE de la carte tirée, pas avec le doigt.
       *
       * Le doigt tient la poignée à mi-hauteur : en amenant visuellement la
       * carte au-dessus de la première ligne, il restait au niveau du milieu de
       * celle-ci, et l'OS concluait « insérer après ». Impossible, donc, de
       * poser une tâche en tête de colonne — l'écran montrait une chose et le
       * calcul en faisait une autre. Le centre de la carte, lui, correspond à
       * ce que Twaylo voit.
       */
      const centreCarte =
        pointerRef.current.y - grabRef.current.y + hauteurRef.current / 2;
      const c = cibleSous(centreCarte);
      if (c && (c.id !== derniere || c.niveau !== niveauRef.current)) {
        derniere = c.id;
        aReordonneRef.current = true;
        const nx = deplacer(ordreRef.current, dragId!, c.id, c.apres);
        ordreRef.current = nx;
        setOrdreVisuel(nx);
        setNiveauCourant(c.niveau);
        niveauRef.current = c.niveau;
      }
    }

    function stopScroll() {
      if (rafScroll.current != null) {
        cancelAnimationFrame(rafScroll.current);
        rafScroll.current = null;
      }
    }

    // Auto-défilement de la page quand le doigt approche du haut/bas de l'écran
    // — permet de déplacer une tâche au-delà de ce qui tient à l'écran. La
    // vitesse passe par un ref, relu chaque frame, et on recible à chaque pas.
    function autoScroll(y: number) {
      const cible = defilementPage();
      const E = 55;
      const MAX = 13;
      let v = 0;
      if (y < E) v = -MAX * (1 - y / E);
      else if (y > window.innerHeight - E) v = MAX * (1 - (window.innerHeight - y) / E);
      if (!v) {
        stopScroll();
        return;
      }
      vScrollRef.current = v;
      if (rafScroll.current == null) {
        const pas = () => {
          const avant = cible.scrollTop;
          cible.scrollTop += vScrollRef.current;
          // Bout de page atteint : plus rien ne bouge, inutile de tourner (et de
          // recibler) à chaque frame jusqu'au lâcher.
          if (cible.scrollTop === avant) {
            rafScroll.current = null;
            return;
          }
          appliquerCible();
          rafScroll.current = requestAnimationFrame(pas);
        };
        rafScroll.current = requestAnimationFrame(pas);
      }
    }

    function process() {
      rafMove.current = null;
      appliquerCible();
      autoScroll(pointerRef.current.y);
    }

    function onMove(e: PointerEvent) {
      // Un autre doigt ne pilote pas ce drag — et on ne bloque pas son
      // défilement en appelant preventDefault avant le filtre.
      if (e.pointerId !== idPointeurRef.current) return;
      e.preventDefault();
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafMove.current == null) rafMove.current = requestAnimationFrame(process);
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== idPointeurRef.current) return;
      if (relache) return;
      relache = true;
      cancelAnimationFrame(rafProxy.current);
      stopScroll();
      // Un pointermove peut avoir programmé un `process` juste avant le lâcher :
      // sans cette annulation il s'exécuterait APRÈS la sauvegarde et
      // réordonnerait dans le vide (voire relancerait l'auto-défilement).
      if (rafMove.current != null) {
        cancelAnimationFrame(rafMove.current);
        rafMove.current = null;
      }

      const w = proxyRef.current;
      const idAuDrop = dragId!;
      const row = rowRefs.current.get(idAuDrop);
      const changement =
        niveauRef.current !== niveauInitialRef.current
          ? { id: idAuDrop, niveau: niveauRef.current }
          : null;
      // On persiste TOUT DE SUITE (pas dans `finir`) : l'atterrissage n'est que
      // visuel, et un drag démarré pendant les 200 ms doit déjà lire l'ordre à
      // jour. Un simple clic (rien réordonné) n'écrit rien.
      if (aReordonneRef.current) deposerTache(ordreRef.current, changement);
      // `finir` ne fait plus que du visuel : retirer le clone (s'il est encore
      // le nôtre) et relâcher `dragId` — mais seulement si c'est toujours CE
      // drop qui est courant, sinon on tuerait un drag enchaîné.
      const finir = () => {
        w?.remove();
        if (proxyRef.current === w) proxyRef.current = null;
        setDragId((prev) => (prev === idAuDrop ? null : prev));
      };
      if (w && row && !reduireRef.current) {
        const d = row.getBoundingClientRect();
        const depart = w.style.transform || "translate3d(0,0,0)";
        const inner = w.firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = "scale(1)";
        const anim = w.animate(
          [{ transform: depart }, { transform: `translate3d(${d.left}px,${d.top}px,0)` }],
          { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
        );
        anim.onfinish = finir;
        anim.oncancel = finir;
      } else {
        finir();
      }
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (rafMove.current != null) {
        cancelAnimationFrame(rafMove.current);
        rafMove.current = null;
      }
      stopScroll();
      // Le clone est retiré par `finir` (au lâcher) — on n'y touche PAS ici :
      // ce nettoyage se rejoue à chaque changement de `dragId`, et effacer le
      // clone effacerait celui d'un drag suivant. Le démontage du composant est
      // couvert par l'effet dédié ci-dessous.
    };
  }, [dragId, deposerTache]);

  // Filet de démontage : si le composant disparaît en plein glissement (ou en
  // plein appui-long), on coupe le minuteur, la boucle du clone et le clone.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafProxy.current);
      if (preArmRef.current) {
        clearTimeout(preArmRef.current);
        preArmRef.current = null;
      }
      if (proxyRef.current) {
        proxyRef.current.remove();
        proxyRef.current = null;
      }
    };
  }, []);

  // FLIP des voisines : à chaque réordonnancement, faire glisser chaque ligne
  // de son ancienne position vers la nouvelle. useLayoutEffect pour poser
  // l'inverse AVANT le paint (sinon la ligne flashe à sa nouvelle place).
  useLayoutEffect(() => {
    if (!dragId || reduireRef.current) return;

    // 1) Annuler d'abord TOUTES les animations des voisines : leurs transforms
    //    résiduels retombent à l'identité, sinon getBoundingClientRect les
    //    inclut et pollue le « Last » → saut/tremblement au tri rapide.
    for (const [id, el] of rowRefs.current) {
      if (id === dragId) continue;
      el.getAnimations().forEach((a) => a.cancel());
    }

    // 2) Mesurer des positions de layout propres, et le défilement écoulé
    //    depuis le dernier instantané (à retrancher : les rects sont en
    //    coordonnées viewport, le scroll les décale sans que la ligne bouge).
    const scrollNow = defilementPage().scrollTop;
    const dScroll = scrollNow - scrollPrevRef.current;
    const now = mesurerToutes();

    // 3) Poser l'inverse (scroll compensé) puis jouer vers zéro.
    for (const [id, el] of rowRefs.current) {
      if (id === dragId) continue;
      const prev = prevRects.current.get(id);
      const n = now.get(id);
      if (!prev || !n) continue;
      const dx = prev.left - n.left;
      const dy = prev.top - n.top - dScroll;
      if (!dx && !dy) continue;
      el.animate(
        [{ transform: `translate3d(${dx}px,${dy}px,0)` }, { transform: "translate3d(0,0,0)" }],
        { duration: 200, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
    }
    prevRects.current = now;
    scrollPrevRef.current = scrollNow;
  }, [ordreVisuel, niveauCourant, dragId]);

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
        const vus = new Set(ordreGroupe);
        const suite = ordreGroupe
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

  const parNiveau = ORDRE_NIVEAUX.map((niveau) => ({
    niveau,
    meta: NIVEAUX[niveau],
    items: flat.filter((f) => f.niveau === niveau),
  }));

  /**
   * Où poser un intertitre de famille.
   *
   * Seulement quand la famille compte AU MOINS DEUX tâches dans ce niveau :
   * un intertitre au-dessus d'une ligne unique n'apprend rien et double la
   * hauteur de la liste. Renvoie, pour chaque position, la famille à annoncer
   * ou `null`.
   */
  const enTetes = (items: typeof flat): (ReturnType<typeof familleDeTache> | null)[] => {
    const combien = new Map<string, number>();
    for (const { t } of items) {
      const f = familleDeTache(t.text);
      if (f) combien.set(f.id, (combien.get(f.id) ?? 0) + 1);
    }
    let precedente: string | null = null;
    return items.map(({ t }) => {
      const f = familleDeTache(t.text);
      const groupe = f && (combien.get(f.id) ?? 0) >= 2 ? f : null;
      const nouvelle = groupe && groupe.id !== precedente ? groupe : null;
      precedente = groupe ? groupe.id : null;
      return nouvelle;
    });
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
        <div
          className="font-mono text-[11.5px] font-extrabold"
          style={{ color: "var(--color-mag-soft)" }}
        >
          {done}/{tasks.length}
        </div>
      </div>

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

      <div className="mt-[11px] flex flex-col gap-[13px]">
        {parNiveau.map(({ niveau, meta, items }) => {
          const faites = items.filter(({ t }) => t.done).length;
          const titres = enTetes(items);

          return (
            <div key={niveau}>
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
                  <span className="flex-none font-mono text-[9.5px] font-bold text-white/30">
                    {faites}/{items.length}
                  </span>
                )}
              </div>

              {/*
                Le champ d'ajout EN TÊTE de pile, jamais en bas : plus la liste
                s'allonge, plus un champ en bas s'éloigne — Twaylo veut poser
                une tâche d'un geste, pas défiler pour trouver où l'écrire.
              */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ajouterTache(nouvelle[niveau] ?? "", niveau);
                  setNouvelle((p) => ({ ...p, [niveau]: "" }));
                }}
                className="mb-[5px]"
              >
                <input
                  value={nouvelle[niveau] ?? ""}
                  onChange={(e) =>
                    setNouvelle((p) => ({ ...p, [niveau]: e.target.value }))
                  }
                  placeholder={`+ ${meta.nom.toLowerCase()}`}
                  aria-label={`Ajouter une tâche — ${meta.nom.toLowerCase()}`}
                  className="w-full rounded-[8px] px-[9px] py-[5px] text-[11px] font-semibold text-white outline-none transition-colors focus:border-white/25"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                  }}
                />
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
                        <span className="text-[12px] leading-none">{enTete.emoji}</span>
                        <span className="text-[9.5px] font-black tracking-[0.1em] text-white/35">
                          {enTete.nom.toUpperCase()}
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
                      className="group relative flex items-stretch gap-[5px]"
                      // Pendant le tri, la ligne tirée devient un trou invisible
                      // (elle garde sa boîte = l'emplacement de dépôt) : tout le
                      // visuel passe par le clone flottant.
                      style={tire ? { visibility: "hidden" } : undefined}
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

                      {/* La poignée. Toujours visible (le survol n'existe pas au
                          doigt), `touch-action:none` pour que le glissement ne
                          fasse pas défiler la page. */}
                      {id && (
                        <button
                          type="button"
                          aria-label={`Déplacer ${t.text}`}
                          title="Glisser pour ranger"
                          onPointerDown={(e) => commencerDrag(e, id, niveau, true)}
                          className="flex-none touch-none select-none px-[2px] text-[13px] leading-none text-white/25 transition-colors hover:text-white/60"
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
                    {ouvert && id && (
                      <div
                        className="sas-in flex flex-col gap-[6px] rounded-[12px] p-[8px]"
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.09)",
                        }}
                      >
                        <div className="px-[3px] text-[9.5px] font-black tracking-[0.1em] text-white/30">
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
                              supprimerTache(id);
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
