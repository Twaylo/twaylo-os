import type { CaptureType, ContactType, Format, Relation } from "./types";

/** Libellé + couleur de chaque catégorie du classifieur de capture. */
export const CAPTURE_META: Record<CaptureType, { label: string; color: string }> = {
  tache: { label: "Tâche", color: "#ff3d8b" },
  idee_video: { label: "Idée", color: "#22d3ee" },
  contact: { label: "Contact", color: "#4f9cff" },
  objectif: { label: "Objectif", color: "#ffc63d" },
  depense: { label: "Dépense", color: "#ff7a3d" },
  note: { label: "Note", color: "#b06bff" },
  journal: { label: "Journal", color: "#3ddc84" },
};

/** L'ordre du tri local, en attendant le vrai classifieur Claude (étape 3). */
export const CAPTURE_CYCLE: CaptureType[] = ["idee_video", "tache", "note"];

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  collab: "Collab",
  sponsor: "Sponsor",
  investisseur: "Investisseur",
  fournisseur: "Fournisseur",
  equipe: "Équipe",
  audience: "Audience",
};

export const RELATION_META: Record<Relation, { label: string; color: string }> = {
  chaud: { label: "Chaud", color: "#ff3d8b" },
  tiede: { label: "Tiède", color: "#ffc63d" },
  froid: { label: "Froid", color: "#4f9cff" },
  actif: { label: "Actif", color: "#3ddc84" },
};

/** L'ordre des colonnes du kanban Contacts. */
export const RELATION_ORDER: Relation[] = ["chaud", "actif", "tiede", "froid"];

/**
 * Style de la pastille de format. Le Short est plein, les autres sont en
 * contour teinté — ça garde une hiérarchie lisible quand une colonne mélange
 * plusieurs formats.
 */
export const FORMAT_META: Record<Format, { fill: boolean; color: string }> = {
  Short: { fill: true, color: "#ffc63d" },
  Long: { fill: false, color: "#22d3ee" },
  Reel: { fill: false, color: "#b06bff" },
  TikTok: { fill: false, color: "#ff3d8b" },
  Live: { fill: false, color: "#ff7a3d" },
};
