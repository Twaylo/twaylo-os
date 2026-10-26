"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DUREE_PAR_DEFAUT,
  LISTES,
  auQuart,
  blocDeListe,
  composerTitre,
  decalerJour,
  disposerBlocs,
  estPause,
  formaterHeure,
  jourAuProgramme,
  joursDeLaSemaine,
  listeDe,
  lundiDe,
  plageEnTete,
  rangAPlanifier,
  type IdListe,
  type MetaTache,
} from "@/lib/p90";
import { avecEmoji, emojiDeTete, sansEmoji } from "@/lib/emoji-tache";
import { useCockpit, type TacheVue } from "@/lib/p90-context";
import { Bouton, Champ, Coche, Depliant, EnTeteVue, Feuille, Puce, formaterJour } from "@/components/p90/ui";

/**
 * LE PROGRAMME DE LA SEMAINE — la todo posée sur un agenda.
 *
 * Demande de Twaylo : « ajoute section programme semaine avec comme un google
 * agenda mais avec mes taches persos de la semaine ». Ce ne sont donc PAS des
 * évènements d'un calendrier à part : ce sont les tâches de la todo, les mêmes,
 * vues sur sept jours. Cocher ici coche là-bas ; déplacer un bloc ici change la
 * date et l'heure de la tâche là-bas.
 *
 * Ce qui place une tâche :
 *  · son JOUR, c'est sa date (le 📅 du panneau ⋯) — ou, sans date, aujourd'hui
 *    si elle porte une heure (voir `jourAuProgramme`) ;
 *  · son HEURE, c'est celle qu'il tape déjà en tête (« 14h : lire ») — et la
 *    plage, s'il en tape une (« 14h-16h : tournage ») ; sans heure de fin, un
 *    bloc dure une heure ;
 *  · sa COULEUR, c'est sa liste : bleu le Deep work, orange les Annexes.
 *
 * Ce qui n'a ni jour ni heure attend dans « À planifier », d'où on le glisse
 * dans la semaine. Glisser un bloc le déplace, tirer son bord bas l'allonge,
 * cliquer dans un créneau vide y ajoute une tâche.
 */

const MINUTES_JOUR = 24 * 60;
/** La hauteur d'une heure : 48 px sur grand écran, comme Google Agenda ; 56 au doigt. */
const HAUTEUR_BUREAU = 48;
const HAUTEUR_TEL = 56;
/** Le seuil des deux mises en page — le même que la barre d'onglets. */
const REQUETE_LARGE = "(min-width: 1024px)";

const JOURS_COURTS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const JOURS_LONGS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const LETTRES = ["L", "M", "M", "J", "V", "S", "D"];

type NavVibr = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

/** 0 pour un lundi, 6 pour un dimanche. */
function rangDuJour(jour: string): number {
  return (new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** « mer. 28 oct. » */
function jourEnClair(jour: string): string {
  return `${JOURS_COURTS[rangDuJour(jour)]} ${formaterJour(jour)}`;
}

/** 870 → « 14:30 », la valeur d'un champ `time`. */
function versChamp(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function depuisChamp(valeur: string): number | null {
  const m = valeur.match(/^(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** « 14h–15h30 », ou « 14h » seul. */
function plageEnClair(debut: number, fin: number | null): string {
  return fin === null ? formaterHeure(debut) : `${formaterHeure(debut)}–${formaterHeure(fin)}`;
}

/**
 * Grand écran ou téléphone. Lu en direct : faire pivoter une tablette, ou
 * rétrécir la fenêtre du Mac, rebascule la mise en page sans recharger.
 */
function useEcranLarge(): boolean {
  return useSyncExternalStore(
    (rappel) => {
      const mq = window.matchMedia(REQUETE_LARGE);
      mq.addEventListener("change", rappel);
      return () => mq.removeEventListener("change", rappel);
    },
    () => window.matchMedia(REQUETE_LARGE).matches,
    () => true,
  );
}

/** L'heure qu'il est, en minutes depuis minuit — la ligne rouge de l'agenda. */
function useMinuteCourante(): number {
  const lire = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [minute, setMinute] = useState(lire);
  useEffect(() => {
    const id = window.setInterval(() => setMinute(lire()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return minute;
}

/* ------------------------------------------------------------------ */
/* Une tâche, lue pour l'agenda                                        */
/* ------------------------------------------------------------------ */

type Element = {
  t: TacheVue;
  /** La clé d'affichage stable (voir `TacheVue.cle`). */
  cle: string;
  emoji: string | null;
  /** L'intitulé sans emoji ni heure, tel qu'il sera réécrit. */
  reste: string;
  /** Ce qu'on affiche : l'intitulé, ou le titre entier s'il n'était qu'une heure. */
  intitule: string;
  debut: number | null;
  /** La fin TAPÉE, s'il y en a une. */
  fin: number | null;
  /** La fin DESSINÉE : celle tapée, sinon une heure après le début. */
  finVue: number;
  jour: string | null;
  liste: IdListe;
  couleur: string;
};

function versElement(t: TacheVue, aujourdhui: string): Element {
  const emoji = emojiDeTete(t.titre);
  const titre = sansEmoji(t.titre);
  const { debut, fin, reste } = plageEnTete(titre);
  const liste = listeDe(t.bloc);
  return {
    t,
    cle: t.cle ?? t.id,
    emoji,
    reste,
    intitule: `${emoji ? `${emoji} ` : ""}${reste || titre}`,
    debut,
    fin,
    finVue: debut === null ? 0 : Math.min(MINUTES_JOUR, fin ?? debut + DUREE_PAR_DEFAUT),
    jour: jourAuProgramme(
      { echeance: t.meta.echeance, aUneHeure: debut !== null, faite: t.faite, faiteLe: t.faiteLe },
      aujourdhui,
    ),
    liste,
    couleur: LISTES.find((l) => l.id === liste)?.couleur ?? "var(--color-ble)",
  };
}

function nbAPlanifierDe(retard: Element[], sansDate: Element[]): number {
  return retard.length + sansDate.length;
}

/* ------------------------------------------------------------------ */
/* Le glisser de l'agenda                                              */
/* ------------------------------------------------------------------ */

/** Ce qu'on tient : le bloc, et comment on le tient. */
type Prise = {
  el: Element;
  /** Déplacer le bloc entier, ou tirer son bord bas. */
  mode: "deplacer" | "etirer";
  /** Sa durée, en minutes : elle le suit d'un créneau à l'autre. */
  duree: number;
  /** Où le pointeur l'a saisi, en minutes depuis son début : le bloc ne saute pas sous le doigt. */
  decalage: number;
};

/** Où il atterrira. */
type Cible =
  | { type: "heure"; jour: string; debut: number; fin: number }
  | { type: "journee"; jour: string }
  | { type: "jour"; jour: string }
  | { type: "sansdate" };

function memeCible(a: Cible | null, b: Cible | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * La cible sous le pointeur, lue dans le DOM : chaque zone de dépôt porte
 * `data-agenda` (« heure », « journee », « jour », « sansdate ») et son jour.
 * Le fantôme et le clone flottant ne captent aucun pointeur : on vise à
 * travers eux.
 */
function cibleSous(x: number, y: number, prise: Prise, hauteur: number): Cible | null {
  if (prise.mode === "etirer") {
    // Le bord bas suit le pointeur dans SA colonne, où qu'aille la main.
    const jour = prise.el.jour;
    const colonne = jour ? document.querySelector<HTMLElement>(`[data-agenda="heure"][data-jour="${jour}"]`) : null;
    if (!colonne || !jour || prise.el.debut === null) return null;
    const r = colonne.getBoundingClientRect();
    const fin = Math.min(MINUTES_JOUR - 15, Math.max(prise.el.debut + 15, auQuart(((y - r.top) / hauteur) * 60)));
    return { type: "heure", jour, debut: prise.el.debut, fin };
  }
  const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-agenda]");
  if (!zone) return null;
  const jour = zone.dataset.jour;
  switch (zone.dataset.agenda) {
    case "heure": {
      if (!jour) return null;
      const r = zone.getBoundingClientRect();
      const brut = ((y - r.top) / hauteur) * 60 - prise.decalage;
      const debut = Math.max(0, Math.min(MINUTES_JOUR - prise.duree, auQuart(brut)));
      return { type: "heure", jour, debut, fin: debut + prise.duree };
    }
    case "journee":
      return jour ? { type: "journee", jour } : null;
    case "jour":
      return jour ? { type: "jour", jour } : null;
    case "sansdate":
      return { type: "sansdate" };
    default:
      return null;
  }
}

/**
 * LE GLISSER DE L'AGENDA.
 *
 * Pas celui des listes (`use-glisser.ts`) : ici on ne range pas une ligne
 * entre deux autres, on vise un JOUR et une HEURE. Mais les leçons du tactile
 * sont les mêmes, et reprises telles quelles :
 *  · au doigt, on n'arme qu'après un appui long, immobile — sinon chaque
 *    défilement de l'agenda déplacerait un bloc ;
 *  · l'anti-défilement est posé sur le cadre AVANT tout appui (un écouteur
 *    ajouté pendant le geste arrive trop tard pour l'arrêter), et doublé sur
 *    le nœud touché ;
 *  · la relecture automatique est suspendue le temps du geste : la semaine ne
 *    doit pas bouger sous le doigt.
 *
 * Pendant le geste, un fantôme montre le créneau visé, calé au quart d'heure,
 * avec sa nouvelle heure — on sait où le bloc tombera avant de le lâcher.
 */
function useGlisserAgenda({
  hauteur,
  surDepot,
  verrouSync,
}: {
  hauteur: number;
  surDepot: (prise: Prise, cible: Cible) => void;
  verrouSync: (nom: string, actif: boolean) => void;
}) {
  const [prise, setPrise] = useState<Prise | null>(null);
  const [cible, setCible] = useState<Cible | null>(null);
  const cadreRef = useRef<HTMLDivElement | null>(null);
  const defileRef = useRef<HTMLDivElement | null>(null);
  const proxyRef = useRef<HTMLDivElement | null>(null);
  const pointeurRef = useRef({ x: 0, y: 0 });
  const enCoursRef = useRef(false);
  /** Vrai juste après un glissement : le clic qui suit le lâcher ne doit rien ouvrir. */
  const vientDeGlisserRef = useRef(false);
  const arreterRef = useRef<(() => void) | null>(null);

  // Les rappels de l'appelant, frais à chaque rendu, lus pendant le geste.
  const rappels = useRef({ hauteur, surDepot, verrouSync });
  useEffect(() => {
    rappels.current = { hauteur, surDepot, verrouSync };
  });

  useEffect(() => {
    const cadre = cadreRef.current;
    if (!cadre) return;
    const bloquer = (ev: TouchEvent) => {
      if (enCoursRef.current && ev.cancelable) ev.preventDefault();
    };
    cadre.addEventListener("touchmove", bloquer, { passive: false });
    return () => {
      cadre.removeEventListener("touchmove", bloquer);
      // Un onglet quitté en plein geste ne laisse ni écouteur ni relecture suspendue.
      arreterRef.current?.();
    };
  }, []);

  // Le clone flottant naît sous le doigt, pas dans le coin de l'écran.
  useLayoutEffect(() => {
    const proxy = proxyRef.current;
    if (!prise || !proxy) return;
    const { x, y } = pointeurRef.current;
    proxy.style.transform = `translate3d(${x + 14}px, ${y + 10}px, 0)`;
  }, [prise]);

  const saisir = (e: React.PointerEvent, p: Prise, immediat = false) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (enCoursRef.current) return;
    const idPointeur = e.pointerId;
    const depart = { x: e.clientX, y: e.clientY };
    const tactile = e.pointerType !== "mouse";
    pointeurRef.current = depart;
    let arme = false;
    let minuteur: number | null = null;
    let raf = 0;
    let cibleCourante: Cible | null = null;
    const touche = e.target as HTMLElement;

    const calculer = () => {
      const { x, y } = pointeurRef.current;
      const c = cibleSous(x, y, p, rappels.current.hauteur);
      if (!memeCible(c, cibleCourante)) {
        cibleCourante = c;
        setCible(c);
      }
      const proxy = proxyRef.current;
      if (proxy) proxy.style.transform = `translate3d(${x + 14}px, ${y + 10}px, 0)`;
    };

    /** Près du bord haut ou bas de l'agenda, il défile tout seul. */
    const boucle = () => {
      const d = defileRef.current;
      const { x, y } = pointeurRef.current;
      if (d && d.scrollHeight > d.clientHeight) {
        const r = d.getBoundingClientRect();
        const bord = 56;
        let v = 0;
        if (x >= r.left && x <= r.right) {
          if (y < r.top + bord && y > r.top - 60) v = -Math.ceil((r.top + bord - y) / 5);
          else if (y > r.bottom - bord && y < r.bottom + 60) v = Math.ceil((y - (r.bottom - bord)) / 5);
        }
        if (v !== 0) {
          d.scrollTop += v;
          calculer();
        }
      }
      raf = requestAnimationFrame(boucle);
    };

    const bloquerToucher = (ev: TouchEvent) => {
      if (arme && ev.cancelable) ev.preventDefault();
    };

    const finir = (deposer: boolean) => {
      if (minuteur !== null) window.clearTimeout(minuteur);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
      window.removeEventListener("pointercancel", annuler);
      touche.removeEventListener("touchmove", bloquerToucher);
      arreterRef.current = null;
      if (!arme) return;
      enCoursRef.current = false;
      rappels.current.verrouSync("agenda", false);
      if (deposer && cibleCourante) rappels.current.surDepot(p, cibleCourante);
      setPrise(null);
      setCible(null);
    };

    const armer = () => {
      arme = true;
      minuteur = null;
      enCoursRef.current = true;
      vientDeGlisserRef.current = true;
      if (tactile && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        (navigator as NavVibr).vibrate?.(8);
      }
      rappels.current.verrouSync("agenda", true);
      setPrise(p);
      calculer();
      raf = requestAnimationFrame(boucle);
    };

    function bouger(ev: PointerEvent) {
      if (ev.pointerId !== idPointeur) return;
      pointeurRef.current = { x: ev.clientX, y: ev.clientY };
      if (!arme) {
        const distance = Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y);
        // Au doigt, bouger avant l'appui long, c'est vouloir défiler : on rend la main.
        if (tactile) {
          if (distance > 10) finir(false);
        } else if (distance > 4) armer();
        return;
      }
      calculer();
    }
    function lacher(ev: PointerEvent) {
      if (ev.pointerId === idPointeur) finir(true);
    }
    function annuler(ev: PointerEvent) {
      if (ev.pointerId === idPointeur) finir(false);
    }

    window.addEventListener("pointermove", bouger, { passive: true });
    window.addEventListener("pointerup", lacher);
    window.addEventListener("pointercancel", annuler);
    if (tactile) touche.addEventListener("touchmove", bloquerToucher, { passive: false });
    arreterRef.current = () => finir(false);

    if (immediat) {
      e.preventDefault();
      e.stopPropagation();
      armer();
    } else if (tactile) {
      minuteur = window.setTimeout(armer, 320);
    }
  };

  return { prise, cible, saisir, cadreRef, defileRef, proxyRef, vientDeGlisserRef };
}

/* ------------------------------------------------------------------ */
/* La vue                                                              */
/* ------------------------------------------------------------------ */

type Brouillon = { jour: string; debut: number | null };

export function SemaineView() {
  const { aujourdhui, taches, pret, echec, oublierEchec, ajouterTache, modifierTache, basculerFaite, verrouSync } =
    useCockpit();
  const large = useEcranLarge();
  const hauteur = large ? HAUTEUR_BUREAU : HAUTEUR_TEL;
  const maintenant = useMinuteCourante();

  /*
   * La semaine affichée, en semaines d'écart avec la semaine en cours : à
   * minuit le dimanche, « cette semaine » avance d'elle-même.
   */
  const [ecart, setEcart] = useState(0);
  const lundi = decalerJour(lundiDe(aujourdhui), 7 * ecart);
  const semaine = useMemo(() => joursDeLaSemaine(lundi), [lundi]);
  // Au téléphone, un jour à la fois — aujourd'hui d'abord.
  const [jourChoisi, setJourChoisi] = useState(aujourdhui);
  const jourTel = semaine.includes(jourChoisi) ? jourChoisi : semaine.includes(aujourdhui) ? aujourdhui : semaine[0];
  const jours = large ? semaine : [jourTel];

  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [listeBrouillon, setListeBrouillon] = useState<IdListe>("deep");
  const [fiche, setFiche] = useState<string | null>(null);
  const [listeOuverte, setListeOuverte] = useState(false);

  const elements = useMemo(() => taches.map((t) => versElement(t, aujourdhui)), [taches, aujourdhui]);

  const { parJour, retard, sansDate, auProgramme, faites } = useMemo(() => {
    const parJour = new Map<string, { heures: Element[]; journee: Element[] }>();
    for (const j of semaine) parJour.set(j, { heures: [], journee: [] });
    const retard: Element[] = [];
    const sansDate: Element[] = [];
    let auProgramme = 0;
    let faites = 0;
    for (const el of elements) {
      const caseDuJour = el.jour ? parJour.get(el.jour) : undefined;
      if (caseDuJour) {
        (el.debut === null ? caseDuJour.journee : caseDuJour.heures).push(el);
        auProgramme += 1;
        if (el.t.faite) faites += 1;
        continue;
      }
      const rang = rangAPlanifier(
        { echeance: el.t.meta.echeance, creeLe: el.t.creeLe, faite: el.t.faite },
        el.jour,
        aujourdhui,
        semaine,
      );
      if (rang === "retard") retard.push(el);
      else if (rang === "sansdate") sansDate.push(el);
    }
    retard.sort((a, b) => (a.jour ?? "").localeCompare(b.jour ?? ""));
    return { parJour, retard, sansDate, auProgramme, faites };
  }, [elements, semaine, aujourdhui]);

  /*
   * RÉÉCRIRE une tâche après un geste : son heure vit dans son titre, son jour
   * dans sa date. Une seule écriture pour les deux — sinon le bloc sautait un
   * instant au bon jour à la mauvaise heure.
   */
  const reprogrammer = (el: Element, v: { debut: number | null; fin: number | null; echeance: string | undefined }) => {
    const t = el.t;
    const fin = v.debut === null || v.fin === null ? null : Math.min(v.fin, MINUTES_JOUR - 1);
    // Un titre qui n'était qu'une heure la garde : sans elle, il ne resterait rien.
    const titre =
      el.reste || v.debut !== null ? avecEmoji(composerTitre(v.debut, fin, el.reste), el.emoji) : t.titre;
    const patch: { titre?: string; meta?: MetaTache } = {};
    if (titre && titre !== t.titre) patch.titre = titre;
    if (v.echeance !== t.meta.echeance) patch.meta = { ...t.meta, echeance: v.echeance };
    if (patch.titre === undefined && patch.meta === undefined) return;
    void modifierTache(t.id, patch);
  };

  const deposer = (p: Prise, c: Cible) => {
    const el = p.el;
    switch (c.type) {
      case "heure": {
        // Une fin tapée suit le bloc ; un bloc étiré prend une fin à lui.
        const garderFin = p.mode === "etirer" || el.fin !== null || c.fin - c.debut !== DUREE_PAR_DEFAUT;
        reprogrammer(el, { debut: c.debut, fin: garderFin ? c.fin : null, echeance: c.jour });
        break;
      }
      case "journee":
        reprogrammer(el, { debut: null, fin: null, echeance: c.jour });
        break;
      case "jour":
        reprogrammer(el, { debut: el.debut, fin: el.fin, echeance: c.jour });
        break;
      case "sansdate":
        // Sans date ET sans heure : une heure seule la ramènerait aujourd'hui.
        reprogrammer(el, { debut: null, fin: null, echeance: undefined });
        break;
    }
  };

  const { prise, cible, saisir, cadreRef, defileRef, proxyRef, vientDeGlisserRef } = useGlisserAgenda({
    hauteur,
    surDepot: deposer,
    verrouSync,
  });

  /** Le clic qui suit un lâcher appartient au glissement : on l'avale. */
  const avalerClic = () => {
    if (!vientDeGlisserRef.current) return false;
    vientDeGlisserRef.current = false;
    return true;
  };

  const prendre = (e: React.PointerEvent, el: Element, mode: Prise["mode"] = "deplacer") => {
    const bloc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const duree = el.debut === null ? DUREE_PAR_DEFAUT : el.finVue - el.debut;
    // Tenu par le milieu de sa hauteur dessinée : un bloc de la grille garde la prise exacte.
    const decalage =
      el.debut !== null && mode === "deplacer" && (e.currentTarget as HTMLElement).dataset.bloc === "heure"
        ? Math.max(0, Math.min(duree, ((e.clientY - bloc.top) / hauteur) * 60))
        : 15;
    saisir(e, { el, mode, duree, decalage }, mode === "etirer");
  };

  const ouvrir = (el: Element) => {
    if (avalerClic()) return;
    setFiche(el.cle);
  };

  const cocher = (el: Element) => {
    void basculerFaite(el.t.id);
  };

  /* --- ajouter dans un créneau --- */
  const surClicColonne = (e: React.MouseEvent<HTMLDivElement>, jour: string) => {
    if (avalerClic()) return;
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const demi = Math.floor(((e.clientY - r.top) / hauteur) * 2) * 30;
    setBrouillon({ jour, debut: Math.max(0, Math.min(demi, MINUTES_JOUR - DUREE_PAR_DEFAUT)) });
  };

  const surClicJournee = (e: React.MouseEvent<HTMLDivElement>, jour: string) => {
    if (avalerClic()) return;
    if (e.target !== e.currentTarget) return;
    setBrouillon({ jour, debut: null });
  };

  const creer = (b: Brouillon, texte: string) => {
    setBrouillon((courant) => (courant === b ? null : courant));
    const propre = texte.trim();
    if (!propre) return;
    void ajouterTache(composerTitre(b.debut, null, propre), { echeance: b.jour }, blocDeListe(listeBrouillon));
  };

  const abandonner = (b: Brouillon) => setBrouillon((courant) => (courant === b ? null : courant));

  /* --- naviguer --- */
  const changerSemaine = (n: number) => {
    setEcart((x) => x + n);
    setJourChoisi(decalerJour(jourTel, 7 * n));
    setBrouillon(null);
  };
  const revenirAujourdhui = () => {
    setEcart(0);
    setJourChoisi(aujourdhui);
    setBrouillon(null);
  };
  const changerJour = (n: number) => {
    const suivant = decalerJour(jourTel, n);
    if (!semaine.includes(suivant)) setEcart((x) => x + Math.sign(n));
    setJourChoisi(suivant);
    setBrouillon(null);
  };

  /*
   * L'agenda s'ouvre sur ce qui compte : un peu avant l'heure qu'il est, si la
   * semaine est la semaine en cours ; sinon sur le premier bloc, ou 7h.
   */
  useLayoutEffect(() => {
    const d = defileRef.current;
    if (!d) return;
    let minutes = 7 * 60;
    if (semaine.includes(aujourdhui)) minutes = Math.max(6 * 60, maintenant - 90);
    else {
      for (const c of parJour.values()) for (const el of c.heures) minutes = Math.min(minutes, (el.debut ?? minutes) - 30);
    }
    d.scrollTop = Math.max(0, (minutes / 60) * hauteur);
    // Seulement à l'ouverture et au changement de semaine : jamais sous les yeux,
    // pas à chaque tâche cochée ni à chaque minute qui passe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lundi, large]);

  /*
   * LA HAUTEUR de l'agenda : tout l'écran qui reste sous lui — jusqu'à la
   * barre d'onglets au téléphone. Mesurée et non devinée : le titre, la bande
   * des jours et « À planifier » n'ont pas la même hauteur d'un écran à
   * l'autre, et un agenda qui passe sous la barre cache ses dernières heures.
   */
  const aPlanifierVisible = nbAPlanifierDe(retard, sansDate) > 0;
  useLayoutEffect(() => {
    const d = defileRef.current;
    if (!d) return;
    const ajuster = () => {
      const haut = d.getBoundingClientRect().top + window.scrollY;
      const barre = document.querySelector(".barre-onglets");
      const bas = large || !barre ? window.innerHeight - 40 : barre.getBoundingClientRect().top - 12;
      d.style.height = `${Math.max(large ? 440 : 320, Math.round(bas - haut))}px`;
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, [large, echec, aPlanifierVisible, defileRef]);

  /* --- le balayage du doigt, d'un jour à l'autre (téléphone) --- */
  const balayage = useRef<{ x: number; y: number; t: number } | null>(null);
  const surToucher = (e: React.TouchEvent) => {
    const p = e.touches[0];
    balayage.current = e.touches.length === 1 && p ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
  };
  const surLever = (e: React.TouchEvent) => {
    const b = balayage.current;
    balayage.current = null;
    const p = e.changedTouches[0];
    if (!b || !p || large || prise) return;
    const dx = p.clientX - b.x;
    const dy = p.clientY - b.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > 2.2 * Math.abs(dy) && Date.now() - b.t < 700) changerJour(dx < 0 ? 1 : -1);
  };

  const elementFiche = fiche ? elements.find((el) => el.cle === fiche) : undefined;
  const nbAPlanifier = nbAPlanifierDe(retard, sansDate);
  const cibleJour = cible && (cible.type === "journee" || cible.type === "jour") ? cible.jour : null;
  const cibleHeure = cible?.type === "heure" ? cible : null;
  const contientAujourdhui = jours.includes(aujourdhui);

  const aPlanifier = (
    <ListeAPlanifier
      retard={retard}
      sansDate={sansDate}
      visee={cible?.type === "sansdate"}
      tire={prise?.el.cle ?? null}
      surPrendre={prendre}
      surOuvrir={ouvrir}
    />
  );

  return (
    <div
      ref={cadreRef}
      className="entree-vue space-y-[14px]"
      onPointerDownCapture={() => {
        // Toute nouvelle pression ouvre un nouveau geste : l'ancien glissement ne compte plus.
        vientDeGlisserRef.current = false;
      }}
    >
      <EnTeteVue
        titre="Semaine"
        sousTitre={
          <>
            <span className="nombres">
              {formaterJour(semaine[0])} – {formaterJour(semaine[6])}
            </span>
            {pret && !large && (
              <>
                {" "}
                · <span className="nombres">{faites}/{auProgramme}</span> faites
              </>
            )}
            {pret && large && (
              <>
                {" "}
                · <span className="nombres">{faites}</span> sur <span className="nombres">{auProgramme}</span> faites
                {nbAPlanifier > 0 && (
                  <>
                    {" "}
                    · <span className="nombres">{nbAPlanifier}</span> à planifier
                  </>
                )}
              </>
            )}
          </>
        }
      >
        <button
          type="button"
          className="capsule cible-doigt"
          onClick={() => changerSemaine(-1)}
          aria-label="Semaine précédente"
        >
          ‹
        </button>
        <button
          type="button"
          className="capsule cible-doigt"
          onClick={revenirAujourdhui}
          disabled={ecart === 0 && (large || jourTel === aujourdhui)}
        >
          {large ? "Aujourd'hui" : "Auj."}
        </button>
        <button
          type="button"
          className="capsule cible-doigt"
          onClick={() => changerSemaine(1)}
          aria-label="Semaine suivante"
        >
          ›
        </button>
      </EnTeteVue>

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

      {!large && (
        <>
          {/* La bande des sept jours : on touche un jour pour l'ouvrir, on y dépose un bloc pour l'y mettre. */}
          <div className="bande-jours carte" role="group" aria-label="Jours de la semaine">
            {semaine.map((j, i) => {
              const c = parJour.get(j);
              const points = [...(c?.journee ?? []), ...(c?.heures ?? [])].slice(0, 3);
              return (
                <button
                  key={j}
                  type="button"
                  data-agenda="jour"
                  data-jour={j}
                  aria-pressed={j === jourTel}
                  aria-label={`${JOURS_LONGS[i]} ${formaterJour(j)}`}
                  onClick={() => {
                    setJourChoisi(j);
                    setBrouillon(null);
                  }}
                  className={`bande-jour ${j === jourTel ? "choisi" : ""} ${j === aujourdhui ? "aujourdhui" : ""} ${
                    cibleJour === j ? "visee" : ""
                  }`}
                >
                  <span className="lettre">{LETTRES[i]}</span>
                  <span className="numero nombres">{Number(j.slice(8))}</span>
                  <span className="points" aria-hidden>
                    {points.map((el) => (
                      <span key={el.cle} style={{ background: el.couleur, opacity: el.t.faite ? 0.35 : 1 }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {nbAPlanifier > 0 && (
            <div className="carte p-[6px]">
              <button
                type="button"
                className="flex w-full items-center gap-[10px] rounded-[16px] px-[10px] py-[8px] text-left"
                aria-expanded={listeOuverte}
                onClick={() => setListeOuverte((o) => !o)}
              >
                <span className="text-[15px] font-semibold">À planifier</span>
                <span className="nombres text-[13px] text-white/50">{nbAPlanifier}</span>
                <span
                  aria-hidden
                  className="ml-auto text-white/50 transition-transform duration-300"
                  style={{ transform: listeOuverte ? "rotate(90deg)" : "none" }}
                >
                  ›
                </span>
              </button>
              <Depliant ouvert={listeOuverte}>
                <div className="px-[4px] pb-[4px]">{aPlanifier}</div>
              </Depliant>
            </div>
          )}
        </>
      )}

      <div className={large ? "grid grid-cols-[minmax(0,1fr)_268px] items-start gap-[14px]" : ""}>
        <div
          className="agenda carte"
          style={{ "--jours": jours.length, "--h": `${hauteur}px` } as CSSProperties}
        >
          <div ref={defileRef} className="agenda-defile" onTouchStart={surToucher} onTouchEnd={surLever}>
            <div className="agenda-tete">
              <div className="agenda-rangee">
                <div />
                {jours.map((j) => {
                  const i = rangDuJour(j);
                  return (
                    <div key={j} className={`agenda-jour ${j === aujourdhui ? "aujourdhui" : ""}`}>
                      <span className="nom">{large ? JOURS_COURTS[i] : JOURS_LONGS[i]}</span>
                      <span className="numero nombres">{Number(j.slice(8))}</span>
                      {!large && <span className="nom">{formaterJour(j).split(" ")[1]}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="agenda-rangee agenda-journee">
                <div className="agenda-legende">Journée</div>
                {jours.map((j) => (
                  <div
                    key={j}
                    data-agenda="journee"
                    data-jour={j}
                    className={`case-journee ${cibleJour === j ? "visee" : ""}`}
                    onClick={(e) => surClicJournee(e, j)}
                  >
                    {(parJour.get(j)?.journee ?? []).map((el) => (
                      <PuceJournee
                        key={el.cle}
                        el={el}
                        tire={prise?.el.cle === el.cle}
                        surPrendre={(e) => prendre(e, el)}
                        surOuvrir={() => ouvrir(el)}
                        surCocher={() => cocher(el)}
                      />
                    ))}
                    {brouillon && brouillon.jour === j && brouillon.debut === null && (
                      <SaisieRapide
                        key={`${brouillon.jour}-journee`}
                        compacte
                        liste={listeBrouillon}
                        surListe={() => setListeBrouillon((l) => (l === "deep" ? "annexes" : "deep"))}
                        surValider={(texte) => creer(brouillon, texte)}
                        surAbandon={() => abandonner(brouillon)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="agenda-rangee agenda-corps" style={{ height: 24 * hauteur }}>
              <div className="agenda-gouttiere" aria-hidden>
                {Array.from({ length: 23 }, (_, k) => k + 1).map((h) => {
                  // L'heure qu'il est prend la place de l'étiquette qu'elle chevauche.
                  const masquee = contientAujourdhui && Math.abs(h * 60 - maintenant) < 14;
                  return masquee ? null : (
                    <span key={h} className="agenda-heure nombres" style={{ top: h * hauteur }}>
                      {h}h
                    </span>
                  );
                })}
                {contientAujourdhui && (
                  <span className="agenda-heure maintenant nombres" style={{ top: (maintenant / 60) * hauteur }}>
                    {formaterHeure(maintenant)}
                  </span>
                )}
              </div>

              {jours.map((j) => {
                const blocs = parJour.get(j)?.heures ?? [];
                const poses = disposerBlocs(blocs.map((el) => ({ id: el.cle, debut: el.debut!, fin: el.finVue })));
                return (
                  <div
                    key={j}
                    data-agenda="heure"
                    data-jour={j}
                    className={`agenda-colonne ${j === aujourdhui ? "aujourdhui" : ""}`}
                    onClick={(e) => surClicColonne(e, j)}
                  >
                    {blocs.map((el) => (
                      <BlocAgenda
                        key={el.cle}
                        el={el}
                        hauteur={hauteur}
                        pose={poses.get(el.cle) ?? { colonne: 0, colonnes: 1 }}
                        tire={prise?.el.cle === el.cle}
                        surPrendre={(e) => prendre(e, el)}
                        surEtirer={(e) => prendre(e, el, "etirer")}
                        surOuvrir={() => ouvrir(el)}
                        surCocher={() => cocher(el)}
                      />
                    ))}

                    {j === aujourdhui && (
                      <div className="ligne-maintenant" style={{ top: (maintenant / 60) * hauteur }} aria-hidden />
                    )}

                    {prise && cibleHeure && cibleHeure.jour === j && (
                      <div
                        className="bloc-agenda fantome-agenda"
                        style={
                          {
                            top: (cibleHeure.debut / 60) * hauteur,
                            height: Math.max(18, ((cibleHeure.fin - cibleHeure.debut) / 60) * hauteur - 2),
                            left: 2,
                            right: 2,
                            "--c": prise.el.couleur,
                          } as CSSProperties
                        }
                        aria-hidden
                      >
                        <span className="heure-bloc nombres">{plageEnClair(cibleHeure.debut, cibleHeure.fin)}</span>
                        <span className="titre-bloc">{prise.el.intitule}</span>
                      </div>
                    )}

                    {brouillon && brouillon.jour === j && brouillon.debut !== null && (
                      <div
                        className="saisie-creneau"
                        style={{
                          top: (brouillon.debut / 60) * hauteur,
                          height: Math.max(44, hauteur - 2),
                        }}
                      >
                        <span className="heure-bloc nombres">{formaterHeure(brouillon.debut)}</span>
                        <SaisieRapide
                          key={`${brouillon.jour}-${brouillon.debut}`}
                          liste={listeBrouillon}
                          surListe={() => setListeBrouillon((l) => (l === "deep" ? "annexes" : "deep"))}
                          surValider={(texte) => creer(brouillon, texte)}
                          surAbandon={() => abandonner(brouillon)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {large && (
          <div className="carte p-[14px]" style={{ position: "sticky", top: 76 }}>
            <div className="mb-[8px] flex items-baseline gap-[8px] px-[4px]">
              <span className="text-[15px] font-semibold">À planifier</span>
              <span className="nombres text-[13px] text-white/45">{nbAPlanifier}</span>
            </div>
            {aPlanifier}
          </div>
        )}
      </div>

      {prise &&
        createPortal(
          <div
            ref={proxyRef}
            className="proxy-agenda"
            style={{ "--c": prise.el.couleur, opacity: cibleHeure ? 0 : 1 } as CSSProperties}
            aria-hidden
          >
            {prise.el.intitule}
          </div>,
          document.body,
        )}

      {elementFiche && (
        <FicheAgenda
          key={elementFiche.cle}
          el={elementFiche}
          semaine={semaine}
          aujourdhui={aujourdhui}
          surReprogrammer={(v) => reprogrammer(elementFiche, v)}
          surFermer={() => setFiche(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les pièces                                                          */
/* ------------------------------------------------------------------ */

/** La petite case ronde d'un bloc : cocher sans ouvrir. */
function CocheBloc({ el, surCocher }: { el: Element; surCocher: () => void }) {
  return (
    <button
      type="button"
      className={`coche-bloc ${el.t.faite ? "cochee" : ""}`}
      aria-label={el.t.faite ? `Décocher ${el.intitule}` : `Cocher ${el.intitule}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        surCocher();
      }}
    >
      {el.t.faite && <Coche taille={9} />}
    </button>
  );
}

/** Un bloc horaire, couleur de sa liste. */
function BlocAgenda({
  el,
  hauteur,
  pose,
  tire,
  surPrendre,
  surEtirer,
  surOuvrir,
  surCocher,
}: {
  el: Element;
  hauteur: number;
  pose: { colonne: number; colonnes: number };
  tire: boolean;
  surPrendre: (e: React.PointerEvent) => void;
  surEtirer: (e: React.PointerEvent) => void;
  surOuvrir: () => void;
  surCocher: () => void;
}) {
  const debut = el.debut ?? 0;
  const haut = Math.max(18, ((el.finVue - debut) / 60) * hauteur - 2);
  const part = 100 / pose.colonnes;
  /*
   * Trois mises en page selon la hauteur : une ligne (une demi-heure),
   * l'heure DANS le texte qui se replie (une heure — sinon l'intitulé tenait
   * sur une seule ligne coupée), l'heure au-dessus de l'intitulé (au-delà).
   */
  const court = haut < 36;
  const enLigne = !court && haut < 60;
  const etroit = pose.colonnes > 1;
  const lignes = Math.max(1, Math.floor((haut - (enLigne ? 8 : 22)) / 15.6));
  return (
    <div
      role="button"
      tabIndex={0}
      data-bloc="heure"
      data-cle={el.cle}
      aria-label={`${el.intitule}, ${plageEnClair(debut, el.fin)}${el.t.faite ? ", faite" : ""}`}
      className={`bloc-agenda ${el.t.faite ? "faite" : ""} ${tire ? "tire" : ""} ${court ? "court" : ""} ${
        etroit ? "etroit" : ""
      } ${estPause(el.t.titre) ? "pause" : ""}`}
      style={
        {
          top: (debut / 60) * hauteur,
          height: haut,
          left: `calc(${pose.colonne * part}% + 2px)`,
          width: `calc(${part}% - 4px)`,
          "--c": el.couleur,
        } as CSSProperties
      }
      onPointerDown={surPrendre}
      onClick={surOuvrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          surOuvrir();
        }
      }}
    >
      <CocheBloc el={el} surCocher={surCocher} />
      {court ? (
        <span className="ligne-bloc">
          <span className="heure-bloc nombres">{formaterHeure(debut)}</span> {el.intitule}
        </span>
      ) : enLigne ? (
        <span className="titre-bloc" style={{ WebkitLineClamp: lignes }}>
          <span className="heure-bloc nombres">{plageEnClair(debut, el.fin)}</span> {el.intitule}
        </span>
      ) : (
        <>
          <span className="heure-bloc nombres">{plageEnClair(debut, el.fin)}</span>
          <span className="titre-bloc" style={{ WebkitLineClamp: lignes }}>
            {el.intitule}
          </span>
        </>
      )}
      {/* Le bord bas : on le tire pour allonger le bloc (à la souris ; au doigt, la fiche). */}
      <span className="bord-bloc" aria-hidden onPointerDown={surEtirer} />
    </div>
  );
}

/** Une tâche du jour sans heure, dans la rangée « Journée ». */
function PuceJournee({
  el,
  tire,
  surPrendre,
  surOuvrir,
  surCocher,
}: {
  el: Element;
  tire: boolean;
  surPrendre: (e: React.PointerEvent) => void;
  surOuvrir: () => void;
  surCocher: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-bloc="journee"
      data-cle={el.cle}
      aria-label={`${el.intitule}, toute la journée${el.t.faite ? ", faite" : ""}`}
      className={`puce-journee ${el.t.faite ? "faite" : ""} ${tire ? "tire" : ""} ${estPause(el.t.titre) ? "pause" : ""}`}
      style={{ "--c": el.couleur } as CSSProperties}
      onPointerDown={surPrendre}
      onClick={surOuvrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          surOuvrir();
        }
      }}
    >
      <CocheBloc el={el} surCocher={surCocher} />
      <span className="min-w-0 flex-1 truncate">{el.intitule}</span>
    </div>
  );
}

/** « À planifier » : le retard d'abord, puis ce qui n'a pas de jour. */
function ListeAPlanifier({
  retard,
  sansDate,
  visee,
  tire,
  surPrendre,
  surOuvrir,
}: {
  retard: Element[];
  sansDate: Element[];
  visee: boolean;
  tire: string | null;
  surPrendre: (e: React.PointerEvent, el: Element) => void;
  surOuvrir: (el: Element) => void;
}) {
  const ligne = (el: Element, enRetard: boolean) => (
    <div
      key={el.cle}
      role="button"
      tabIndex={0}
      data-bloc="liste"
      data-cle={el.cle}
      className={`ligne-a-planifier ${tire === el.cle ? "tire" : ""}`}
      style={{ "--c": el.couleur } as CSSProperties}
      onPointerDown={(e) => surPrendre(e, el)}
      onClick={() => surOuvrir(el)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          surOuvrir(el);
        }
      }}
    >
      <span className="point-liste" aria-hidden />
      {el.debut !== null && <span className="bulle-heure">{plageEnClair(el.debut, el.fin)}</span>}
      <span className="min-w-0 flex-1 truncate">{el.intitule}</span>
      {enRetard && el.jour && <span className="nombres flex-none text-[11.5px] text-[var(--color-cor-soft)]">{formaterJour(el.jour)}</span>}
    </div>
  );

  return (
    <div data-agenda="sansdate" className={`liste-a-planifier ${visee ? "visee" : ""}`}>
      {retard.length === 0 && sansDate.length === 0 && (
        <p className="px-[6px] py-[10px] text-[13px] text-white/45">
          Tout est planifié. Dépose un bloc ici pour le retirer du programme.
        </p>
      )}
      {retard.length > 0 && (
        <>
          <div className="libelle-a-planifier">En retard</div>
          {retard.map((el) => ligne(el, true))}
        </>
      )}
      {sansDate.length > 0 && (
        <>
          {retard.length > 0 && <div className="libelle-a-planifier">Sans date</div>}
          {sansDate.map((el) => ligne(el, false))}
        </>
      )}
      {(retard.length > 0 || sansDate.length > 0) && (
        <p className="px-[6px] pt-[8px] text-[12px] leading-[1.4] text-white/40">
          Glisse une tâche dans la semaine pour lui donner un jour et une heure.
        </p>
      )}
    </div>
  );
}

/** L'ajout éclair, à l'endroit même où l'on a cliqué. */
function SaisieRapide({
  liste,
  surListe,
  surValider,
  surAbandon,
  compacte = false,
}: {
  liste: IdListe;
  surListe: () => void;
  surValider: (texte: string) => void;
  surAbandon: () => void;
  compacte?: boolean;
}) {
  const [texte, setTexte] = useState("");
  const conteneurRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);
  const finiRef = useRef(false);
  const def = LISTES.find((l) => l.id === liste) ?? LISTES[0];

  const conclure = () => {
    if (finiRef.current) return;
    finiRef.current = true;
    if (texte.trim()) surValider(texte);
    else surAbandon();
  };

  return (
    <div
      ref={conteneurRef}
      className={`saisie-rapide ${compacte ? "compacte" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={champRef}
        autoFocus
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Nouvelle tâche"
        aria-label="Nouvelle tâche dans le programme"
        enterKeyHint="done"
        className="champ-rapide"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            conclure();
          } else if (e.key === "Escape") {
            e.preventDefault();
            finiRef.current = true;
            surAbandon();
          }
        }}
        onBlur={() => {
          // Un temps pour laisser le bouton de liste reprendre le champ : sinon le toucher fermait tout.
          window.setTimeout(() => {
            if (conteneurRef.current?.contains(document.activeElement)) return;
            conclure();
          }, 140);
        }}
      />
      <button
        type="button"
        className="liste-rapide"
        style={{ "--c": def.couleur } as CSSProperties}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          surListe();
          champRef.current?.focus();
        }}
        title="Changer de liste"
      >
        {def.nom}
      </button>
    </div>
  );
}

/** Une rangée de la fiche : son libellé, puis ses choix. */
function Rangee({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <span className="w-[64px] flex-none text-[12.5px] text-white/45">{titre}</span>
      {children}
    </div>
  );
}

/** La fiche d'une tâche du programme : son jour, son heure, sa liste. */
function FicheAgenda({
  el,
  semaine,
  aujourdhui,
  surReprogrammer,
  surFermer,
}: {
  el: Element;
  semaine: string[];
  aujourdhui: string;
  surReprogrammer: (v: { debut: number | null; fin: number | null; echeance: string | undefined }) => void;
  surFermer: () => void;
}) {
  const { modifierTache, basculerFaite, supprimerTache } = useCockpit();
  const [nom, setNom] = useState(el.reste);
  const [enSaisie, setEnSaisie] = useState(false);
  const [confirme, setConfirme] = useState(false);

  // L'intitulé suit la base tant qu'on ne le tape pas (changé sur l'autre appareil).
  const [resteConnu, setResteConnu] = useState(el.reste);
  if (el.reste !== resteConnu && !enSaisie) {
    setResteConnu(el.reste);
    setNom(el.reste);
  }

  const echeance = el.t.meta.echeance;
  // Changer l'heure d'une tâche qui flotte sur aujourd'hui l'y ancre.
  const ancrage = echeance ?? el.jour ?? undefined;

  const renommer = () => {
    setEnSaisie(false);
    const propre = nom.trim();
    if (!propre || propre === el.reste) {
      setNom(el.reste);
      return;
    }
    const titre = avecEmoji(composerTitre(el.debut, el.fin, propre), el.emoji);
    if (titre !== el.t.titre) void modifierTache(el.t.id, { titre });
  };

  const choisirDebut = (valeur: string) => {
    const debut = depuisChamp(valeur);
    if (debut === null) return;
    // La durée tapée suit le début ; sans fin tapée, le bloc reste d'une heure.
    const fin = el.fin !== null && el.debut !== null ? Math.min(MINUTES_JOUR - 1, debut + (el.fin - el.debut)) : null;
    surReprogrammer({ debut, fin, echeance: ancrage });
  };

  const choisirFin = (valeur: string) => {
    if (el.debut === null) return;
    const fin = depuisChamp(valeur);
    surReprogrammer({ debut: el.debut, fin: fin !== null && fin > el.debut ? fin : null, echeance: ancrage });
  };

  const jourAffiche = el.jour;
  const sousTitre = jourAffiche
    ? `${jourEnClair(jourAffiche)}${el.debut !== null ? ` · ${plageEnClair(el.debut, el.fin)}` : " · toute la journée"}`
    : "À planifier";

  return (
    <Feuille
      etiquette={`Programmer ${el.intitule}`}
      titre={el.intitule}
      sousTitre={`${sousTitre} · ${LISTES.find((l) => l.id === el.liste)?.nom ?? ""}`}
      surFermer={surFermer}
    >
      {(fermer) => (
        <>
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              className="case-ronde"
              style={el.t.faite ? { background: el.couleur, borderColor: el.couleur } : undefined}
              aria-label={el.t.faite ? "Décocher" : "Cocher"}
              onClick={() => void basculerFaite(el.t.id)}
            >
              {el.t.faite && <Coche taille={12} />}
            </button>
            <Champ
              valeur={nom}
              onChange={(v) => {
                setEnSaisie(true);
                setNom(v);
              }}
              onBlur={renommer}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria="Intitulé"
              className="flex-1"
            />
          </div>

          <Rangee titre="Jour">
            {semaine.map((j) => (
              <Puce
                key={j}
                actif={jourAffiche === j}
                couleur={j === aujourdhui ? "var(--color-mag-soft)" : undefined}
                onClick={() => surReprogrammer({ debut: el.debut, fin: el.fin, echeance: j })}
              >
                {JOURS_COURTS[rangDuJour(j)]} {Number(j.slice(8))}
              </Puce>
            ))}
            <input
              type="date"
              aria-label="Une autre date"
              value={echeance ?? ""}
              onChange={(e) => {
                if (e.target.value) surReprogrammer({ debut: el.debut, fin: el.fin, echeance: e.target.value });
              }}
              className="champ nombres h-[26px] w-[132px] px-[8px] text-[12.5px]"
              style={{ colorScheme: "dark" }}
            />
          </Rangee>

          <Rangee titre="Heure">
            <input
              type="time"
              step={900}
              aria-label="Début"
              value={el.debut !== null ? versChamp(el.debut) : ""}
              onChange={(e) => choisirDebut(e.target.value)}
              className="champ nombres h-[32px] w-[98px] px-[8px] text-[14px]"
              style={{ colorScheme: "dark" }}
            />
            <span className="text-white/40">→</span>
            <input
              type="time"
              step={900}
              aria-label="Fin"
              disabled={el.debut === null}
              value={el.debut !== null ? versChamp(el.finVue % MINUTES_JOUR) : ""}
              onChange={(e) => choisirFin(e.target.value)}
              className="champ nombres h-[32px] w-[98px] px-[8px] text-[14px] disabled:opacity-40"
              style={{ colorScheme: "dark" }}
            />
            <Puce
              actif={el.debut === null && jourAffiche !== null}
              onClick={() => surReprogrammer({ debut: null, fin: null, echeance: ancrage })}
            >
              Toute la journée
            </Puce>
          </Rangee>

          <Rangee titre="Liste">
            {LISTES.map((l) => (
              <Puce
                key={l.id}
                actif={el.liste === l.id}
                couleur={l.couleur}
                onClick={() => {
                  if (el.liste !== l.id) void modifierTache(el.t.id, { bloc: blocDeListe(l.id) });
                }}
              >
                {l.nom}
              </Puce>
            ))}
          </Rangee>

          <div className="flex flex-wrap items-center gap-[8px] pt-[2px]">
            {jourAffiche !== null && (
              <Bouton
                onClick={() => {
                  surReprogrammer({ debut: null, fin: null, echeance: undefined });
                  fermer();
                }}
              >
                Retirer du programme
              </Bouton>
            )}
            <span className="flex-1" />
            {confirme ? (
              <>
                <Bouton
                  ton="danger"
                  onClick={() => {
                    // La feuille repart d'abord ; la tâche s'en va ensuite, vers les Oubliés.
                    const id = el.t.id;
                    fermer();
                    window.setTimeout(() => void supprimerTache(id), 320);
                  }}
                >
                  Oui, supprimer
                </Bouton>
                <Bouton onClick={() => setConfirme(false)}>Annuler</Bouton>
              </>
            ) : (
              <Bouton ton="danger" onClick={() => setConfirme(true)}>
                Supprimer
              </Bouton>
            )}
          </div>
        </>
      )}
    </Feuille>
  );
}
