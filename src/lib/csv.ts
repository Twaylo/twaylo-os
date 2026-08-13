/**
 * Écriture de CSV, pour des fichiers ouverts dans un tableur.
 *
 * Deux précautions, et la seconde n'est pas cosmétique.
 *
 * 1. Les guillemets internes sont doublés et toute valeur est encadrée :
 *    sans quoi une virgule ou un retour à la ligne dans un prénom décale
 *    toute la colonne.
 *
 * 2. Une valeur qui commence par « = », « + », « - » ou « @ » est préfixée
 *    d'une apostrophe. Sans elle, Excel et LibreOffice la prennent pour une
 *    FORMULE : un prénom saisi « =1+1 » s'évalue à l'ouverture, et des
 *    formules bien choisies savent appeler des commandes système. C'est une
 *    attaque connue — « CSV injection » — et elle vise exactement notre cas :
 *    un fichier rempli par des inconnus, ouvert plus tard par son
 *    propriétaire sur sa propre machine.
 */

/** Une valeur, protégée pour un tableur. */
export function cellule(valeur: string | null | undefined): string {
  const v = String(valeur ?? "").replace(/"/g, '""');
  const sur = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${sur}"`;
}

/**
 * Un tableau complet, en-têtes compris.
 *
 * Le fichier commence par un BOM. Sans lui, Excel sous Windows lit l'UTF-8
 * comme du Latin-1 et affiche « PrÃ©nom » : le fichier est techniquement
 * juste et pratiquement inutilisable.
 */
export function versCsv(entetes: string[], lignes: (string | null | undefined)[][]): string {
  const corps = lignes.map((ligne) => ligne.map(cellule).join(","));
  return `﻿${entetes.map(cellule).join(",")}\n${corps.join("\n")}\n`;
}
