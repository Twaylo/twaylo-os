"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useOs } from "./os-context";
import { localDateKey } from "./local-date";
import { synchroniserJour } from "./sync";
import { readJSON, writeJSON } from "./storage";
import { feter } from "./recompenses-store";
import {
  BONUS,
  CUMULS_VIDES,
  JOUR_CHIFFRE_VIDE,
  bonusMerites,
  detailXp,
  estPalierSerie,
  exploitsDe,
  gradeDe,
  palierDe,
  prochainPalierSerie,
  xpDuJour,
  type Cumuls,
  type Exploit,
  type JourChiffre,
  type LigneXp,
  type Palier,
} from "./xp";

/**
 * La couche « jeu » de l'OS.
 *
 * Séparée du contexte principal à dessein : elle ne fait que LIRE ce que
 * l'OS sait déjà (blocs cochés, habitudes, tâches, journal) pour en tirer une
 * XP, un niveau et des récompenses. Rien ici n'est indispensable au
 * fonctionnement de l'OS — si cette couche tombe, l'OS marche toujours.
 *
 * Le principe qui la rend motivante plutôt qu'agaçante : **tout est instantané
 * et rien ne redescend**. L'XP du jour se recalcule à chaque coche, sans
 * attendre le réseau ; l'XP passée vient du serveur et ne bouge plus.
 *
 * Les célébrations partent vers un magasin extérieur (recompenses-store), pas
 * vers un état local : un effet doit pousser vers un système extérieur, pas
 * relancer un rendu du composant qu'il vient de rendre.
 */

type ProgressionDistante = {
  connecte: boolean;
  jours: { jour: string; xp: number }[];
  xpAvant: number;
  xpAujourdhui: number;
  serie: number;
  meilleureSerie: number;
  cumuls: Cumuls;
  seriesBlocs: Record<string, number>;
  record: { jour: string; xp: number } | null;
  bonusAujourdhui: string[];
  dernierJourRempli: string | null;
};

type ProgressionState = {
  /** Faux tant que le serveur n'a pas répondu : n'affiche pas de chiffre faux. */
  pret: boolean;
  /** Les nombres du jour, recalculés à chaque geste. */
  jour: JourChiffre;
  xpJour: number;
  detailJour: LigneXp[];
  xpTotal: number;
  palier: Palier;
  serie: number;
  meilleureSerie: number;
  prochainPalierSerie: number | null;
  cumuls: Cumuls;
  exploits: Exploit[];
  seriesBlocs: Record<string, number>;
  jours: { jour: string; xp: number }[];
  record: { jour: string; xp: number } | null;
  /** Le dernier jour rempli avant aujourd'hui — sert aux relances. */
  dernierJourRempli: string | null;
};

const Ctx = createContext<ProgressionState | null>(null);

/** Mémoire locale des célébrations déjà jouées — pour ne pas refêter au rechargement. */
const CLE_FETES = "twaylo.progression.fetes";

type Fetes = {
  /** Dernier niveau célébré. */
  niveau?: number;
  /** `jour:serie` déjà fêté. */
  serie?: string;
  /** Identifiants d'exploits déjà débloqués et annoncés. */
  exploits?: string[];
};

const DISTANTE_VIDE: ProgressionDistante = {
  connecte: false,
  jours: [],
  xpAvant: 0,
  xpAujourdhui: 0,
  serie: 0,
  meilleureSerie: 0,
  cumuls: CUMULS_VIDES,
  seriesBlocs: {},
  record: null,
  bonusAujourdhui: [],
  dernierJourRempli: null,
};

const AUCUN_BONUS: string[] = [];

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const {
    demoMode,
    journees,
    blocsFaits,
    habits,
    faitesDuJour,
    tasks,
    journalText,
    uneChose,
    repas,
  } = useOs();

  /**
   * Le jour suivi. Calculé une fois au montage, puis avancé par un battement
   * d'une minute : sans lui, un OS resté ouvert toute la nuit continuerait de
   * compter l'XP d'hier et refuserait les bonus du matin.
   */
  const [jourVoulu, setJourVoulu] = useState(() => localDateKey());

  useEffect(() => {
    const t = setInterval(() => setJourVoulu(localDateKey()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [distantBrut, setDistantBrut] = useState<ProgressionDistante | null>(null);
  /** En démo, on ne montre AUCUN chiffre réel — et on ne va même pas les chercher. */
  const distant = demoMode ? null : distantBrut;

  useEffect(() => {
    if (demoMode) return;
    let annule = false;
    void fetch(`/api/progression?jour=${jourVoulu}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Partial<ProgressionDistante> & { connecte?: boolean }) => {
        if (annule) return;
        setDistantBrut({ ...DISTANTE_VIDE, ...d, connecte: Boolean(d.connecte) });
      })
      .catch((err) => {
        console.error("[progression] lecture impossible :", err);
        if (!annule) setDistantBrut(DISTANTE_VIDE);
      });
    return () => {
      annule = true;
    };
  }, [demoMode, jourVoulu]);

  const pret = Boolean(distant) && !demoMode;

  /* ---------------- Les nombres du jour, en direct ---------------- */

  /** L'état du jour AVANT bonus — c'est lui qui décide quels bonus tombent. */
  const brut = useMemo<JourChiffre>(() => {
    if (demoMode) return JOUR_CHIFFRE_VIDE;

    const modele =
      journees?.liste.find((j) => j.id === journees.active) ?? journees?.liste[0] ?? null;
    const blocs = modele?.blocs ?? [];
    const niveauDe = (t: { niveau?: string }) => t.niveau ?? "secondaire";
    const faites = (n: string) => tasks.filter((t) => t.done && niveauDe(t) === n).length;

    return {
      blocsFaits: blocs.filter((b) => blocsFaits.includes(b.id)).length,
      blocsTotal: blocs.length,
      habitudesFaites: habits.filter((h) => (faitesDuJour[h.id] ?? []).length > 0).length,
      habitudesTotal: habits.length,
      principalesFaites: faites("principal"),
      principalesTotal: tasks.filter((t) => niveauDe(t) === "principal").length,
      secondairesFaites: faites("secondaire"),
      annexesFaites: faites("annexe"),
      journalEcrit: journalText.trim().length > 0,
      uneChoseFaite: uneChose.fait,
      repas: repas.length,
      bonus: AUCUN_BONUS,
    };
  }, [
    demoMode,
    journees,
    blocsFaits,
    habits,
    faitesDuJour,
    tasks,
    journalText,
    uneChose.fait,
    repas.length,
  ]);

  /*
   * Les bonus acquis, ajustés PENDANT le rendu.
   *
   * C'est le motif que React recommande pour « corriger un état quand une
   * entrée change » : le rendu est immédiatement rejoué avec la bonne valeur,
   * sans passage par l'écran ni cascade d'effets. Un bonus entré dans cette
   * liste n'en ressort jamais — décocher un bloc en fin de journée ne retire
   * pas une récompense déjà gagnée.
   */
  const [acquis, setAcquis] = useState<string[]>([]);
  const [jourDesAcquis, setJourDesAcquis] = useState(jourVoulu);
  /**
   * Le plus haut total atteint aujourd'hui.
   *
   * Sans ce plancher, l'XP du jour REDESCENDAIT dans un cas très réel :
   * « passer au jour suivant » archive la todo et retire les tâches faites de
   * la liste vivante — les points qu'elles rapportaient disparaissaient donc
   * de l'écran, et la barre de niveau reculait le soir même. Une XP acquise
   * est acquise ; décocher corrige la liste, pas le crédit.
   */
  const [plancher, setPlancher] = useState(0);

  const jour = useMemo<JourChiffre>(() => ({ ...brut, bonus: acquis }), [brut, acquis]);
  const xpCalcule = useMemo(() => xpDuJour(jour), [jour]);
  const xpJour = Math.max(xpCalcule, plancher, distant?.xpAujourdhui ?? 0);

  /*
   * Ajustements PENDANT le rendu — le motif que React recommande pour
   * corriger un état quand une entrée change : le rendu est immédiatement
   * rejoué avec la bonne valeur, sans passage par l'écran ni cascade d'effets.
   */
  if (jourDesAcquis !== jourVoulu) {
    // Minuit : la journée repart vierge.
    setJourDesAcquis(jourVoulu);
    setAcquis([]);
    setPlancher(0);
  } else {
    if (pret) {
      const attendus = [
        ...new Set([...(distant?.bonusAujourdhui ?? []), ...bonusMerites(brut)]),
      ];
      const manquants = attendus.filter((id) => !acquis.includes(id));
      if (manquants.length > 0) setAcquis([...acquis, ...manquants]);
    }
    if (xpJour > plancher) setPlancher(xpJour);
  }

  const detailJour = useMemo(() => detailXp(jour), [jour]);
  const xpTotal = (distant?.xpAvant ?? 0) + xpJour;
  const palier = useMemo(() => palierDe(xpTotal), [xpTotal]);

  /* ---------------- Écrire et annoncer les bonus ---------------- */

  /** Ce qui a déjà été envoyé en base et annoncé, pour ne pas le refaire. */
  const bonusTraites = useRef<{ jour: string; ids: Set<string> }>({
    jour: jourVoulu,
    ids: new Set(),
  });

  useEffect(() => {
    if (!pret) return;
    if (bonusTraites.current.jour !== jourVoulu) {
      bonusTraites.current = { jour: jourVoulu, ids: new Set() };
    }

    const dejaEnBase = new Set(distant?.bonusAujourdhui ?? []);
    const nouveaux = acquis.filter((id) => !bonusTraites.current.ids.has(id));
    if (nouveaux.length === 0) return;
    for (const id of nouveaux) bonusTraites.current.ids.add(id);

    // Ceux que la base n'a pas encore : on les écrit (la route les fusionne).
    const aEcrire = nouveaux.filter((id) => !dejaEnBase.has(id));
    if (aEcrire.length > 0) synchroniserJour({ jour: jourVoulu, bonus: acquis });

    // On ne fête que ce qui vient de tomber, jamais ce qui dormait en base.
    for (const id of aEcrire) {
      const b = BONUS.find((x) => x.id === id);
      if (!b) continue;
      feter({
        emoji: b.emoji,
        titre: b.label,
        texte: b.cri,
        couleur: id === "parfaite" ? "#ffd23d" : "#3ddc84",
        xp: b.xp,
      });
    }
  }, [pret, acquis, jourVoulu, distant]);

  /* ---------------- Montée de niveau ---------------- */

  const niveauPrecedent = useRef<number | null>(null);

  useEffect(() => {
    if (!pret) return;
    const avant = niveauPrecedent.current;
    niveauPrecedent.current = palier.niveau;
    if (avant === null || palier.niveau <= avant) return;

    const fetes = readJSON<Fetes>(CLE_FETES, {});
    writeJSON(CLE_FETES, { ...fetes, niveau: palier.niveau });
    feter({
      emoji: "🆙",
      titre: `Niveau ${palier.niveau}`,
      texte: `Tu passes ${gradeDe(palier.niveau).nom}. Prochain palier dans ${palier.pourNiveau} XP.`,
      couleur: palier.couleur,
    });
  }, [pret, palier.niveau, palier.pourNiveau, palier.couleur]);

  /* ---------------- Paliers de série ---------------- */

  const serie = distant?.serie ?? 0;

  useEffect(() => {
    if (!pret || serie <= 0 || !estPalierSerie(serie)) return;
    const marque = `${jourVoulu}:${serie}`;
    const fetes = readJSON<Fetes>(CLE_FETES, {});
    if (fetes.serie === marque) return;
    writeJSON(CLE_FETES, { ...fetes, serie: marque });
    feter({
      emoji: "🔥",
      titre: `${serie} jours d'affilée`,
      texte:
        serie >= 100
          ? "Cent jours. Ce n'est plus de la discipline, c'est ton fonctionnement."
          : "La série tient. C'est elle qui fait la différence, pas les gros jours.",
      couleur: "#ff7a3d",
    });
  }, [pret, serie, jourVoulu]);

  /* ---------------- Exploits débloqués ---------------- */

  const cumuls = useMemo<Cumuls>(() => {
    const base = distant?.cumuls ?? CUMULS_VIDES;
    /*
     * Le serveur s'arrête à hier ; on ajoute ici l'état VIVANT du jour.
     *
     * C'est ce qui fait qu'un exploit tombe au moment du geste et non le
     * lendemain au rechargement — une récompense détachée de ce qui l'a
     * méritée ne récompense plus rien.
     */
    return {
      blocs: base.blocs + jour.blocsFaits,
      habitudes: base.habitudes + jour.habitudesFaites,
      taches:
        base.taches + jour.principalesFaites + jour.secondairesFaites + jour.annexesFaites,
      journaux: base.journaux + (jour.journalEcrit ? 1 : 0),
      parfaites: base.parfaites + (jour.bonus.includes("parfaite") ? 1 : 0),
      joursRemplis: base.joursRemplis + (xpJour > 0 ? 1 : 0),
      meilleurJour: Math.max(base.meilleurJour, xpJour),
      meilleureSerie: Math.max(base.meilleureSerie, serie),
    };
  }, [distant, jour, xpJour, serie]);

  const exploits = useMemo(() => exploitsDe(cumuls), [cumuls]);

  useEffect(() => {
    if (!pret) return;
    const debloques = exploits.filter((e) => e.debloque).map((e) => e.id);
    const fetes = readJSON<Fetes>(CLE_FETES, {});
    const connus = fetes.exploits;

    /*
     * Première fois : on enregistre sans rien annoncer. Un OS déjà rempli
     * depuis des mois débloquerait sinon huit exploits d'un coup au premier
     * chargement — une avalanche qui ne récompense aucun geste.
     */
    if (!Array.isArray(connus)) {
      writeJSON(CLE_FETES, { ...fetes, exploits: debloques });
      return;
    }

    const nouveaux = debloques.filter((id) => !connus.includes(id));
    if (nouveaux.length === 0) return;
    writeJSON(CLE_FETES, { ...fetes, exploits: debloques });

    for (const id of nouveaux) {
      const e = exploits.find((x) => x.id === id);
      if (!e) continue;
      feter({
        emoji: e.emoji,
        titre: `Exploit — ${e.nom}`,
        texte: e.description,
        couleur: "#b06bff",
      });
    }
  }, [pret, exploits]);

  /* ---------------- Ce que voit le reste de l'app ---------------- */

  const value = useMemo<ProgressionState>(
    () => ({
      pret,
      jour,
      xpJour,
      detailJour,
      xpTotal,
      palier,
      serie,
      meilleureSerie: distant?.meilleureSerie ?? 0,
      prochainPalierSerie: prochainPalierSerie(serie),
      cumuls,
      exploits,
      seriesBlocs: distant?.seriesBlocs ?? {},
      jours: distant?.jours ?? [],
      record: distant?.record ?? null,
      dernierJourRempli: distant?.dernierJourRempli ?? null,
    }),
    [pret, jour, xpJour, detailJour, xpTotal, palier, serie, distant, cumuls, exploits],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgression(): ProgressionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProgression doit être appelé dans un <ProgressionProvider>");
  return ctx;
}
