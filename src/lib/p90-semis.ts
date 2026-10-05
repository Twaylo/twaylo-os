/**
 * LES DONNÉES DE DÉPART du PROJECT 90.
 *
 * Le plan des 90 jours tel qu'il a été arrêté : 26 tâches datées, trois OP à
 * encaisser, et les cinq objectifs (ceux-là vivent dans `p90.ts`, ce sont des
 * constantes du cockpit). Semé une seule fois, derrière un drapeau sur la
 * sentinelle, et REJOUABLE sans doublon : les identifiants sont déduits du
 * titre, donc un second passage réécrit les mêmes lignes au lieu d'en créer
 * d'autres — la même protection que le semis d'origine, qui avait produit
 * quinze tâches au lieu de cinq le jour où trois onglets se sont ouverts
 * ensemble.
 *
 * Aucune dépendance ici non plus : juste la liste, vérifiable hors ligne.
 */

import {
  type IdBloc,
  type IdChaine,
  type Impact,
  type Portee,
  type Responsable,
  blocSuggere,
} from "./p90";

export type SemisTache = {
  titre: string;
  echeance: string;
  objectif: Portee;
  responsables: Responsable[];
  /** Les trois chantiers déjà lancés le 5 octobre. */
  enCours?: boolean;
  /** Fort pour ce qui ouvre une vanne : une sortie, une ouverture, un dépôt. */
  impact?: Impact;
  /** Forcé seulement quand le bloc déduit de l'objectif tomberait à côté. */
  bloc?: IdBloc;
};

/**
 * Les 26 tâches, dans l'ordre des échéances.
 *
 * L'impact « fort » est réservé à ce qui débloque le reste — une sortie qui
 * amène les abonnés, l'ouverture de Momentum, le dépôt INPI sans lequel la
 * marque n'existe pas, l'argent à faire rentrer. Le reste reste à « normal » :
 * un impact fort partout ne dirait plus rien.
 */
export const SEMIS_TACHES: SemisTache[] = [
  {
    titre: "Ouvrir la liste d'attente Trigger Warning",
    echeance: "2026-10-08",
    objectif: "trigger",
    responsables: ["Nicolas", "Creator Lab"],
    impact: 3,
  },
  {
    titre: "Relancer Expandia sur les paiements carVertical et Linguana",
    echeance: "2026-10-09",
    objectif: "tresorerie",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Envoyer la mise en demeure Legal Place via Rares Corp",
    echeance: "2026-10-09",
    objectif: "tresorerie",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Sortie « Les pires moments pour être né »",
    echeance: "2026-10-10",
    objectif: "twaylo",
    responsables: ["Océane"],
    enCours: true,
    impact: 3,
  },
  {
    titre: "Ouvrir le compte réserve",
    echeance: "2026-10-12",
    objectif: "tresorerie",
    responsables: ["Nicolas"],
  },
  {
    titre: "Liste d'attente Momentum + formulaire de candidature 1:1",
    echeance: "2026-10-12",
    objectif: "momentum",
    responsables: ["Nicolas", "Océane"],
    impact: 3,
  },
  {
    titre: "Recherche d'antériorité Trigger Warning (France + UE)",
    echeance: "2026-10-14",
    objectif: "trigger",
    responsables: ["Nicolas"],
  },
  {
    titre: "Créer les chaînes EN, ES et BN",
    echeance: "2026-10-15",
    objectif: "terrain",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Ouvrir le Discord gratuit avec les retours clients",
    echeance: "2026-10-15",
    objectif: "momentum",
    responsables: ["Océane"],
  },
  {
    titre: "Programmer la série Bangladesh J1 → J14",
    echeance: "2026-10-15",
    objectif: "twaylo",
    responsables: ["Océane"],
  },
  {
    titre: "Séminaire Expandia Bordeaux : OP Q4 à 4 500 € et plus",
    echeance: "2026-10-16",
    objectif: "twaylo",
    responsables: ["Nicolas", "Océane"],
    impact: 3,
    bloc: "operations",
  },
  {
    titre: "Sortie du dossier Chine",
    echeance: "2026-10-17",
    objectif: "twaylo",
    responsables: ["Océane"],
  },
  {
    titre: "CGV Momentum + critères mesurables de la garantie",
    echeance: "2026-10-20",
    objectif: "momentum",
    responsables: ["Nicolas"],
  },
  {
    titre: "Trailer Bangladesh",
    echeance: "2026-10-21",
    objectif: "twaylo",
    responsables: ["Océane"],
  },
  {
    titre: "Dépôt INPI",
    echeance: "2026-10-23",
    objectif: "trigger",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Recruter 1 ou 2 monteurs Tway News",
    echeance: "2026-10-23",
    objectif: "twaylo",
    responsables: ["Océane"],
    bloc: "operations",
  },
  {
    titre: "Proto v2 validé et reçu en Espagne",
    echeance: "2026-10-26",
    objectif: "trigger",
    responsables: ["Creator Lab"],
    enCours: true,
    impact: 3,
  },
  {
    titre: "Contrat Creator Lab signé",
    echeance: "2026-10-28",
    objectif: "trigger",
    responsables: ["Nicolas"],
  },
  {
    titre: "Doublages BN et EN du doc",
    echeance: "2026-10-28",
    objectif: "terrain",
    responsables: ["Nicolas"],
  },
  {
    titre: "Formations Momentum et web app prêtes",
    echeance: "2026-10-29",
    objectif: "momentum",
    responsables: ["Nicolas", "Océane"],
    enCours: true,
    impact: 3,
  },
  {
    titre: "Sortie Hors Zone Bangladesh",
    echeance: "2026-10-30",
    objectif: "twaylo",
    responsables: ["Océane"],
    impact: 3,
  },
  {
    titre: "Ouverture des précommandes Trigger Warning",
    echeance: "2026-11-01",
    objectif: "trigger",
    responsables: ["Creator Lab"],
    impact: 3,
  },
  {
    titre: "Grand vlog Nico P + ouverture de Momentum",
    echeance: "2026-11-01",
    objectif: "momentum",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Tournage Pologne (OP armée)",
    echeance: "2026-11-06",
    objectif: "terrain",
    responsables: ["Nicolas"],
    impact: 3,
  },
  {
    titre: "Clôture des précommandes",
    echeance: "2026-11-30",
    objectif: "trigger",
    responsables: ["Creator Lab"],
  },
  {
    titre: "Bilan des 90 jours",
    echeance: "2026-12-31",
    objectif: "tous",
    responsables: ["Nicolas"],
    bloc: "operations",
  },
];

/** Le bloc d'une tâche semée : celui qu'elle force, sinon celui de son objectif. */
export function blocSemis(t: SemisTache): IdBloc {
  return t.bloc ?? blocSuggere(t.objectif);
}

export type SemisOp = {
  marque: string;
  chaine: IdChaine;
  brut: number;
  /** Passe par Expandia : c'est ce qui déclenche les 30 % sur Twaylo. */
  expandia: boolean;
  /** Facture envoyée — l'étape « Facturé ». */
  facture: boolean;
  litige?: boolean;
  /** Date de paiement attendue, celle qui fait courir le retard. */
  paiement?: string;
  diffusion?: string;
  note?: string;
};

/**
 * Les trois OP à encaisser au 5 octobre, à l'étape « Facturé » : diffusées,
 * facturées, pas payées.
 *
 * AUCUNE DATE DE PAIEMENT ici, et c'est volontaire. Je ne les connais pas, et
 * une date inventée ferait afficher « en retard de 66 jours » à l'écran avec
 * l'aplomb d'un fait. La vue les marque donc « date de paiement à renseigner »
 * — un geste par OP, et l'alerte au-delà de 30 jours s'allume d'elle-même.
 */
export const SEMIS_OPS: SemisOp[] = [
  {
    marque: "carVertical",
    chaine: "twaylo",
    brut: 2_500,
    expandia: true,
    facture: true,
    note: "Via Expandia · montant à confirmer",
  },
  {
    marque: "Linguana",
    chaine: "twaylo",
    brut: 1_400,
    expandia: true,
    facture: true,
    note: "Via Expandia",
  },
  {
    marque: "Legal Place",
    chaine: "twaylo",
    brut: 4_500,
    expandia: false,
    facture: true,
    litige: true,
    note: "Via Rares Corp · litige en cours",
  },
];
