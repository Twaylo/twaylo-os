/**
 * Outillage de la traduction des récits ASAM.
 *
 * Les récits sont la pièce d'origine de la NGA, en anglais. Un lecteur
 * francophone doit pouvoir les lire dans sa langue sans que l'original
 * disparaisse : la traduction vit donc dans un fichier à part, indexé sur la
 * position du récit dans `asam-descriptions.json`.
 *
 *   node scripts/recits-traduire.mjs extraire 3 0 60
 *       → sort les 60 premiers récits de gravité 3 encore non traduits
 *
 *   node scripts/recits-traduire.mjs fusionner
 *       → replie tous les lots traduits dans le fichier servi au site
 *
 *   node scripts/recits-traduire.mjs etat
 *       → où en est le chantier, gravité par gravité
 *
 * Les lots vivent hors du dépôt : seul le fichier fusionné est publié.
 */

import fs from "node:fs";
import path from "node:path";

const RACINE = path.join(import.meta.dirname, "..");
const DONNEES = path.join(RACINE, "public/piraterie/donnees");
const SORTIE = path.join(DONNEES, "asam-recits-fr.json");

/* Les lots sont des brouillons de travail : ils n'ont rien à faire dans le
 * dépôt, mais ils doivent survivre entre deux commandes. */
const LOTS =
  process.env.LOTS_RECITS ||
  "/tmp/claude-0/-home-user-twaylo-os/38822360-6632-5a2e-8709-06f1f5ab4a14/scratchpad/lots";

const lire = (f, defaut) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : defaut);

const recits = lire(path.join(DONNEES, "asam-descriptions.json"), []);
const gravites = lire(path.join(DONNEES, "asam-carte.json"), { colonnes: {} }).colonnes.gravite || [];

/** Toutes les traductions déjà écrites, lots compris. */
function traductions() {
  const tout = { ...lire(SORTIE, {}) };
  if (fs.existsSync(LOTS)) {
    for (const nom of fs.readdirSync(LOTS).sort()) {
      if (nom.endsWith(".json")) Object.assign(tout, lire(path.join(LOTS, nom), {}));
    }
  }
  return tout;
}

/* ── extraire ─────────────────────────────────────────────────────────── */

function extraire(gravite, saut, combien) {
  const faits = traductions();
  const restants = [];
  for (let i = 0; i < recits.length; i += 1) {
    if (gravite !== null && gravites[i] !== gravite) continue;
    if (!recits[i] || faits[i]) continue;
    restants.push(i);
  }

  const lot = restants.slice(saut, saut + combien);
  const morceaux = lot.map((i) => `#${i}\n${recits[i].replace(/\s+/g, " ").trim()}`);
  const signes = lot.reduce((a, i) => a + recits[i].length, 0);

  process.stderr.write(
    `${lot.length} récits · ${signes.toLocaleString("fr-FR")} signes · ` +
      `${(restants.length - saut - lot.length).toLocaleString("fr-FR")} encore à faire ` +
      `dans cette gravité\n`,
  );
  process.stdout.write(`${morceaux.join("\n\n")}\n`);
}

/* ── fusionner ────────────────────────────────────────────────────────── */

function fusionner() {
  const tout = traductions();

  // On range par index numérique : un fichier trié se relit et se compare.
  const trie = {};
  for (const cle of Object.keys(tout).sort((a, b) => Number(a) - Number(b))) {
    const texte = String(tout[cle]).trim();
    if (!texte) continue;
    if (!recits[Number(cle)]) {
      process.stderr.write(`⚠ index ${cle} sans récit d'origine, ignoré\n`);
      continue;
    }
    trie[cle] = texte;
  }

  fs.writeFileSync(SORTIE, JSON.stringify(trie));
  const poids = fs.statSync(SORTIE).size;
  process.stderr.write(
    `${Object.keys(trie).length.toLocaleString("fr-FR")} récits traduits · ` +
      `${(poids / 1024).toFixed(0)} Ko\n`,
  );
}

/* ── etat ─────────────────────────────────────────────────────────────── */

function etat() {
  const faits = traductions();
  const noms = { 3: "mortelles", 2: "violence", 1: "vol", 0: "tentative", "-1": "sans récit" };
  let totalFaits = 0;
  let totalTout = 0;

  process.stderr.write("gravité        traduits /  total   signes restants\n");
  for (const n of [3, 2, 1, 0]) {
    let a = 0;
    let b = 0;
    let signes = 0;
    for (let i = 0; i < recits.length; i += 1) {
      if (gravites[i] !== n || !recits[i]) continue;
      b += 1;
      if (faits[i]) a += 1;
      else signes += recits[i].length;
    }
    totalFaits += a;
    totalTout += b;
    process.stderr.write(
      `${noms[n].padEnd(12)} ${String(a).padStart(8)} / ${String(b).padStart(6)}` +
        `   ${signes.toLocaleString("fr-FR").padStart(11)}\n`,
    );
  }
  const reste = recits.reduce((a, t, i) => a + (t && !faits[i] ? t.length : 0), 0);
  process.stderr.write(
    `${"TOTAL".padEnd(12)} ${String(totalFaits).padStart(8)} / ${String(totalTout).padStart(6)}` +
      `   ${reste.toLocaleString("fr-FR").padStart(11)}\n`,
  );
}

/* ── ligne de commande ────────────────────────────────────────────────── */

const [commande, a, b, c] = process.argv.slice(2);
if (commande === "extraire") extraire(a === "*" ? null : Number(a), Number(b || 0), Number(c || 40));
else if (commande === "fusionner") fusionner();
else if (commande === "etat") etat();
else process.stderr.write("usage : extraire <gravité|*> <saut> <combien> | fusionner | etat\n");
