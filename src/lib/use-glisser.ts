"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * LE GLISSER-DÉPOSER ENTRE COLONNES, une fois pour toutes.
 *
 * Ce moteur a été écrit et corrigé pour la todo, au doigt, en mesurant. Il
 * porte une demi-douzaine de pièges qui ne se devinent pas et se paient cher :
 * le défilement qui confisque le geste, le nœud détaché quand une carte change
 * de colonne, la zone morte qui suspendait tout le ciblage, la cible qu'il faut
 * recalculer au moment du lâcher parce que la mise en page a bougé.
 *
 * Il vit donc ici, et non dans un composant : la deuxième liste qui en a besoin
 * (les objectifs, et leurs quatre horizons) ne doit pas repartir de zéro et
 * retomber une à une dans les mêmes chausse-trapes. Une seule implémentation,
 * un seul endroit où les subtilités du tactile sont écrites — et un seul
 * endroit à corriger.
 *
 * Ce qu'il ne sait pas : ce qu'est un élément, à quoi il ressemble, où il est
 * rangé. Tout cela passe en paramètres.
 */

/** navigator.vibrate n'est pas dans tous les typages ; on le décrit ici. */
type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

/**
 * Où l'élément tiré va atterrir.
 *
 * `id` vaut `null` quand la colonne visée est VIDE : il n'y a alors aucune
 * ligne devant ou derrière laquelle s'insérer, mais la colonne, elle, change.
 * C'est le cas qu'on ne savait pas traiter — déposer dans un bloc vide ne
 * faisait rien.
 */
type Cible<Z extends string> = { id: string | null; zone: Z; apres: boolean };

/**
 * Déplace `id` juste avant (ou après) `survole` dans la liste d'identifiants.
 * Le drapeau `apres` vient de la moitié de ligne survolée : sous le milieu, on
 * insère en dessous — c'est ce qui rend le tri fluide au doigt.
 */
export function deplacer(
  ids: string[],
  id: string,
  survole: string,
  apres: boolean,
): string[] {
  const sans = ids.filter((x) => x !== id);
  let i = sans.indexOf(survole);
  if (i === -1) return ids;
  if (apres) i += 1;
  sans.splice(i, 0, id);
  return sans;
}

export type Glisser<Z extends string> = {
  /** L'identifiant de l'élément tiré, sinon `null`. */
  dragId: string | null;
  /** L'ordre des identifiants pendant le tri (vide au repos). */
  ordreVisuel: string[];
  /** La colonne que l'élément tiré vient d'adopter. */
  zoneCourante: Z;
  /** À poser sur le `onPointerDown` d'une ligne, ou de sa poignée. */
  commencerDrag: (
    e: React.PointerEvent,
    id: string,
    zone: Z,
    depuisPoignee: boolean,
  ) => void;
  /** `ref` de chaque ligne, indexée par identifiant. */
  setRowRef: (id: string) => (el: HTMLDivElement | null) => void;
  /** `ref` de chaque colonne. */
  setZoneRef: (zone: Z) => (el: HTMLDivElement | null) => void;
  /** `ref` du cadre qui contient toutes les colonnes — voir l'anti-défilement. */
  grilleRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Vrai dès qu'un appui s'est transformé en déplacement.
   *
   * À consulter dans le gestionnaire de clic de la ligne : le clic part au
   * relâchement, donc APRÈS un déplacement. Sans cette garde, ranger un
   * élément le cocherait dans la foulée. Elle se désarme en la consommant.
   */
  glissementArmeRef: React.RefObject<boolean>;
};

export function useGlisser<Z extends string>({
  ordre,
  zoneDe,
  onDepot,
  bloque = false,
  zoneParDefaut,
}: {
  /**
   * L'ordre des identifiants AU REPOS, tel qu'il est affiché.
   *
   * Lu au moment où le doigt se pose, par fermeture : partir d'un autre ordre
   * ferait sauter toute la liste au premier appui.
   */
  ordre: string[];
  /** La colonne d'un élément, hors glissement. */
  zoneDe: (id: string) => Z;
  /**
   * Appelé au lâcher, et seulement si quelque chose a bougé.
   * `changement` est `null` quand l'élément n'a pas changé de colonne.
   */
  onDepot: (ordre: string[], changement: { id: string; zone: Z } | null) => void;
  /** Coupe le glisser — pendant une édition en place, par exemple. */
  bloque?: boolean;
  /** La colonne d'atterrissage par défaut, avant tout geste. */
  zoneParDefaut: Z;
}): Glisser<Z> {
  const [dragId, setDragId] = useState<string | null>(null);
  const [ordreVisuel, setOrdreVisuel] = useState<string[]>([]);
  const [zoneCourante, setZoneCourante] = useState<Z>(zoneParDefaut);

  const ordreRef = useRef<string[]>([]);
  const zoneRef = useRef<Z>(zoneParDefaut);
  const zoneInitialeRef = useRef<Z>(zoneParDefaut);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  /**
   * Le cadre de chaque colonne.
   *
   * Indispensable dès que les colonnes ne sont plus empilées : viser celle de
   * droite demande de savoir OÙ elle est, pas seulement à quelle hauteur. C'est
   * aussi ce qui permet de déposer dans une colonne vide, qui n'offre aucune
   * ligne à viser.
   */
  const zoneRefs = useRef(new Map<Z, HTMLDivElement>());
  const grilleRef = useRef<HTMLDivElement | null>(null);
  /**
   * Un glissement est-il en cours ?
   *
   * En ref et non en état : l'écouteur anti-défilement est posé une fois pour
   * toutes et doit lire la valeur fraîche à chaque `touchmove`.
   */
  const enGlissementRef = useRef(false);

  // Le clone flottant (dans document.body), la position du pointeur, l'offset
  // de prise, et les identifiants d'animation à annuler proprement.
  const proxyRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const grabRef = useRef({ x: 0, y: 0 });
  /** Hauteur de la ligne tirée : sert à viser d'après la carte, pas le doigt. */
  const hauteurRef = useRef(0);
  const glissementArmeRef = useRef(false);
  const rafProxy = useRef(0);
  const rafMove = useRef<number | null>(null);
  const rafScroll = useRef<number | null>(null);
  // Le pointeur (doigt/souris) qui a armé le drag. On ignore tout autre contact,
  // sinon un second doigt posé puis levé terminerait le glissement à sa place.
  const idPointeurRef = useRef<number | null>(null);
  // Vitesse d'auto-défilement, relue à chaque frame pour rester proportionnelle
  // à la profondeur du doigt dans la zone de bord.
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
  // Positions de toutes les lignes AVANT le dernier réordonnancement, sur
  // TOUTES les colonnes — c'est ce qui permet à une ligne qui change de colonne
  // (donc de parent DOM) de glisser comme une voisine.
  const prevRects = useRef(new Map<string, DOMRect>());
  const reduireRef = useRef(false);

  /*
   * Les fonctions de l'appelant, tenues en ref.
   *
   * L'effet du glissement ne doit se remonter QU'AU changement de `dragId` : le
   * relire à chaque rendu couperait les écouteurs en plein geste. Or `zoneDe` et
   * `onDepot` sont redéclarés à chaque rendu par l'appelant.
   */
  const zoneDeRef = useRef(zoneDe);
  const onDepotRef = useRef(onDepot);
  useEffect(() => {
    zoneDeRef.current = zoneDe;
    onDepotRef.current = onDepot;
  });

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

  const setZoneRef = (zone: Z) => (el: HTMLDivElement | null) => {
    if (el) zoneRefs.current.set(zone, el);
    else zoneRefs.current.delete(zone);
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
   * Début d'un glissement.
   *
   * Au doigt, on n'arme qu'après un court appui — 140 ms depuis la poignée,
   * 220 ms depuis la ligne, parce que la ligne sert aussi à cocher — et si le
   * doigt n'a pas bougé de plus de 10 px, sinon un simple défilement partant de
   * là déclencherait un tri par accident. À la souris, la poignée arme
   * sur-le-champ et la ligne attend six pixels parcourus.
   */
  function commencerDrag(
    e: React.PointerEvent,
    id: string,
    zone: Z,
    depuisPoignee: boolean,
  ) {
    if (bloque) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = rowRefs.current.get(id);
    if (!row) return;
    // Nouvelle séquence d'appui : le glissement précédent ne compte plus.
    glissementArmeRef.current = false;
    // Depuis la ligne, on ne coupe RIEN : le clic doit continuer d'agir si
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
      enGlissementRef.current = true;
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
       * L'ordre TEL QU'IL EST À L'ÉCRAN, lu par fermeture.
       *
       * Cette fonction est redéclarée à chaque rendu : elle voit donc l'ordre
       * affiché au moment où le doigt s'est posé — exactement ce qu'il faut.
       * Y compris les identifiants provisoires que le serveur n'a pas encore
       * confirmés : l'ordre visuel pilote l'affichage pendant le glissement, et
       * un élément absent de cet ordre serait rejeté en fin de liste au dépôt.
       */
      ordreRef.current = ordre;
      zoneRef.current = zone;
      zoneInitialeRef.current = zone;
      // Figer les positions ET le défilement AVANT tout réordonnancement : c'est
      // le « First » du FLIP des voisines, et la référence de scroll.
      prevRects.current = mesurerToutes();
      scrollPrevRef.current = defilementPage().scrollTop;

      setOrdreVisuel(ordre);
      setZoneCourante(zone);
      setDragId(id);
      boucleProxy();
      nettoyerPre();
    };

    const tactile = e.pointerType === "touch";
    // À la souris, saisir la ligne elle-même ne peut pas armer sur-le-champ :
    // un simple clic servirait alors à ranger. On attend un vrai geste.
    const seuilSouris = !tactile && !depuisPoignee;

    const surMovePre = (ev: PointerEvent) => {
      if (ev.pointerId !== idPointeur) return;
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      if (arme) return;
      const distance = Math.hypot(ev.clientX - sx, ev.clientY - sy);
      if (seuilSouris) {
        if (distance > 6) armer();
      } else if (distance > 10) {
        // Au doigt, s'éloigner avant l'appui long, c'est vouloir faire défiler
        // la page : on abandonne et on laisse le geste au navigateur.
        nettoyerPre();
      }
    };

    const delai = tactile ? (depuisPoignee ? 140 : 220) : 0;

    if (!tactile && depuisPoignee) {
      armer();
      return;
    }

    window.addEventListener("pointermove", surMovePre, { passive: true });
    window.addEventListener("pointerup", nettoyerPre, { once: true });
    window.addEventListener("pointercancel", nettoyerPre, { once: true });
    if (tactile) {
      /*
       * Le second garde-fou, posé sur le nœud TOUCHÉ lui-même.
       *
       * Celui du cadre (plus bas) suffit tant que la ligne reste où elle est.
       * Mais dès qu'elle change de colonne, React la détache du DOM pour la
       * reconstruire dans l'autre — et un évènement tactile continue de viser
       * le nœud d'origine, désormais hors de l'arbre : il ne remonte plus
       * jusqu'au cadre, le garde-fou cesse d'être appelé, le navigateur reprend
       * le geste pour faire défiler, et il annule le pointeur.
       *
       * C'était le dernier bug du glisser au doigt : mesuré, le geste mourait
       * EXACTEMENT au premier changement de colonne. Les petits trajets s'en
       * sortaient (le changement arrivait juste avant le lâcher), les longs se
       * posaient dans la colonne traversée en chemin. D'où l'impression d'un
       * glisser qui marche une fois sur deux.
       *
       * Un écouteur posé sur le nœud touché suit ce nœud, détaché ou non.
       */
      const touche = e.target as HTMLElement;
      const bloquer = (ev: TouchEvent) => {
        if (arme && ev.cancelable) ev.preventDefault();
      };
      const oublier = () => {
        touche.removeEventListener("touchmove", bloquer);
        window.removeEventListener("touchend", oublier);
        window.removeEventListener("touchcancel", oublier);
      };
      touche.addEventListener("touchmove", bloquer, { passive: false });
      window.addEventListener("touchend", oublier);
      window.addEventListener("touchcancel", oublier);
      preArmRef.current = setTimeout(armer, delai);
    }
  }

  /*
   * LE DÉFILEMENT QUI VOLE LE GESTE — la panne principale du glisser au doigt.
   *
   * Ce qui ne marche pas, et pourquoi :
   *  · `touch-action: none` sur les lignes — la propriété est lue quand le
   *    doigt se pose, donc avant de savoir s'il s'agit d'un appui long ou d'un
   *    défilement. Les lignes couvrent l'écran : la liste ne défilerait plus ;
   *  · `preventDefault()` sur un `pointermove` tactile — il n'arrête rien ;
   *  · un `touchmove` non passif posé au moment de l'appui — TESTÉ, inopérant.
   *    Le navigateur fige au contact du doigt la liste des zones qui peuvent
   *    l'interrompre ; un écouteur ajouté après n'y figure pas, et son
   *    `preventDefault` arrive sur un évènement déjà non annulable.
   *
   * Il faut donc que l'écouteur soit là AVANT que le doigt ne se pose. Il est
   * posé une fois pour toutes sur le cadre des colonnes — pas sur la fenêtre :
   * seuls les gestes qui commencent dans la liste passent par le fil principal,
   * le reste de la page continue de défiler sans rien demander à personne. Et
   * il ne bloque QUE si un glissement est armé : un défilement parti d'une
   * ligne reste un défilement.
   */
  useEffect(() => {
    const cadre = grilleRef.current;
    if (!cadre) return;
    const bloquer = (ev: TouchEvent) => {
      if (enGlissementRef.current && ev.cancelable) ev.preventDefault();
    };
    cadre.addEventListener("touchmove", bloquer, { passive: false });
    return () => cadre.removeEventListener("touchmove", bloquer);
  }, []);

  // Écoute du geste une fois armé : pointermove coalescé dans un seul rAF (une
  // cible + un auto-scroll par frame), et le lâcher qui fait atterrir le clone
  // puis persiste. `passive:false` autorise le preventDefault anti-défilement.
  useEffect(() => {
    if (!dragId) return;
    let derniere: string | null = null;
    let relache = false;

    /**
     * La COLONNE visée, d'abord.
     *
     * Le ciblage purement vertical suffisait tant que les colonnes étaient
     * empilées. Côte à côte, il est faux — amener un élément à droite le
     * faisait retomber dans la colonne de gauche, à la même hauteur.
     *
     * On décide donc de la colonne par la position HORIZONTALE ET verticale,
     * puis de la place dans cette colonne par la hauteur seule. Hors de toute
     * colonne (au-dessus, en dessous, dans la gouttière), on prend la plus
     * proche en distance réelle plutôt que d'abandonner : un doigt qui dépasse
     * un peu du cadre veut visiblement y déposer.
     */
    function zoneSous(x: number, y: number): Z | null {
      let proche: Z | null = null;
      let distance = Infinity;
      for (const [zone, el] of zoneRefs.current) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zone;
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < distance) {
          distance = d;
          proche = zone;
        }
      }
      return proche;
    }

    function cibleSous(clientX: number, clientY: number): Cible<Z> | null {
      const zone = zoneSous(clientX, clientY);
      if (!zone) return null;

      let meilleur: Cible<Z> | null = null;
      let distance = Infinity;
      let vide = true;

      for (const [id, el] of rowRefs.current) {
        if (id === dragId) continue;
        // On ne compare QU'AUX lignes de la colonne visée.
        if (zoneDeRef.current(id) !== zone) continue;
        vide = false;
        const r = el.getBoundingClientRect();
        const milieu = (r.top + r.bottom) / 2;
        if (clientY >= r.top && clientY <= r.bottom) {
          const d = clientY - milieu;
          /*
           * Zone morte de 4 px autour du milieu : elle tue le clignotement d'un
           * cran quand le doigt hésite pile à la frontière.
           *
           * Mais SEULEMENT à l'intérieur de la colonne où l'élément se trouve
           * déjà. Appliquée partout, elle suspendait tout le ciblage — donc
           * aussi le changement de colonne : lâcher pile au milieu d'une ligne
           * ne faisait rien, et l'élément restait dans la colonne traversée en
           * chemin. Quatre pixels sur un écran de téléphone, c'est un hasard,
           * pas une intention.
           */
          if (Math.abs(d) < 4 && zone === zoneRef.current) return null;
          return { id, zone, apres: d > 0 };
        }
        const dm = Math.abs(clientY - milieu);
        if (dm < distance) {
          distance = dm;
          meilleur = { id, zone, apres: clientY > milieu };
        }
      }

      // Colonne vide : rien à viser, mais la colonne change quand même.
      if (vide) return { id: null, zone, apres: false };
      return meilleur;
    }

    // Recalcule la cible de dépôt et réordonne si besoin. Appelée depuis le
    // pointermove ET depuis la boucle d'auto-scroll : pendant un défilement à
    // doigt immobile, les lignes bougent sous le doigt, il faut recibler.
    function appliquerCible() {
      /*
       * On vise avec le CENTRE de la carte tirée, pas avec le doigt.
       *
       * Le doigt tient la carte à mi-hauteur : en l'amenant visuellement
       * au-dessus de la première ligne, il restait au niveau du milieu de
       * celle-ci, et l'OS concluait « insérer après ». Impossible, donc, de
       * poser un élément en tête de colonne — l'écran montrait une chose et le
       * calcul en faisait une autre.
       */
      const centreCarte =
        pointerRef.current.y - grabRef.current.y + hauteurRef.current / 2;
      /*
       * En X on suit le DOIGT, pas le centre de la carte : la carte est large,
       * son centre peut déborder dans la colonne voisine alors que le doigt
       * vise clairement celle d'à côté.
       */
      const c = cibleSous(pointerRef.current.x, centreCarte);
      if (c && (c.id !== derniere || c.zone !== zoneRef.current)) {
        derniere = c.id;
        aReordonneRef.current = true;
        // Colonne vide : on ne réordonne rien, on change juste de colonne.
        if (c.id) {
          const nx = deplacer(ordreRef.current, dragId!, c.id, c.apres);
          ordreRef.current = nx;
          setOrdreVisuel(nx);
        }
        setZoneCourante(c.zone);
        zoneRef.current = c.zone;
      }
    }

    function stopScroll() {
      if (rafScroll.current != null) {
        cancelAnimationFrame(rafScroll.current);
        rafScroll.current = null;
      }
    }

    // Auto-défilement de la page quand le doigt approche du haut/bas de l'écran
    // — permet de déplacer un élément au-delà de ce qui tient à l'écran.
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
      enGlissementRef.current = false;
      cancelAnimationFrame(rafProxy.current);
      stopScroll();
      // Un pointermove peut avoir programmé un `process` juste avant le lâcher :
      // sans cette annulation il s'exécuterait APRÈS la sauvegarde.
      if (rafMove.current != null) {
        cancelAnimationFrame(rafMove.current);
        rafMove.current = null;
      }

      /*
       * UN DERNIER CIBLAGE, à l'endroit exact où le doigt s'est levé.
       *
       * Chaque changement de colonne réorganise la liste : celle qu'on quitte
       * rétrécit, celle d'arrivée s'allonge, et tout ce qui est en dessous
       * remonte — SOUS le doigt. Un long trajet traversait donc une colonne
       * intermédiaire, la mise en page bougeait, et l'élément se posait là où
       * la colonne visée se trouvait AVANT le décalage.
       */
      appliquerCible();

      const w = proxyRef.current;
      const idAuDrop = dragId!;
      const row = rowRefs.current.get(idAuDrop);
      const changement =
        zoneRef.current !== zoneInitialeRef.current
          ? { id: idAuDrop, zone: zoneRef.current }
          : null;
      // On persiste TOUT DE SUITE (pas dans `finir`) : l'atterrissage n'est que
      // visuel, et un drag démarré pendant les 200 ms doit déjà lire l'ordre à
      // jour. Un simple clic (rien réordonné) n'écrit rien.
      if (aReordonneRef.current) onDepotRef.current(ordreRef.current, changement);
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
  }, [dragId]);

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
  }, [ordreVisuel, zoneCourante, dragId]);

  return {
    dragId,
    ordreVisuel,
    zoneCourante,
    commencerDrag,
    setRowRef,
    setZoneRef,
    grilleRef,
    glissementArmeRef,
  };
}
