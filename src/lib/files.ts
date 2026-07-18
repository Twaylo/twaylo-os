"use client";

/**
 * Accès aux dossiers de la machine, via la File System Access API.
 *
 * Ce qu'il faut comprendre sur la limite : une page web ne peut PAS lire un
 * disque librement. Elle peut lire ce que l'utilisateur lui a explicitement
 * confié, dossier par dossier, après un clic. C'est une barrière de sécurité
 * du navigateur, pas un manque de l'implémentation.
 *
 * Ce que ça donne quand même : Twaylo désigne « Mes rushes » et « Mes
 * scripts » une seule fois, et l'OS peut ensuite les parcourir et les
 * fouiller à chaque session — l'autorisation survit au rechargement.
 *
 * Chrome et Edge uniquement. Firefox et Safari ne l'implémentent pas.
 */

export type FichierIndexe = {
  chemin: string;
  nom: string;
  extension: string;
  taille: number;
  modifie: number;
  /** Contenu, seulement pour les fichiers texte sous la limite. */
  contenu?: string;
};

export type Dossier = {
  id: string;
  nom: string;
  handle: FileSystemDirectoryHandle;
};

/** Extensions dont le contenu vaut la peine d'être lu et cherché. */
const TEXTE = new Set([
  "txt", "md", "markdown", "srt", "vtt", "csv", "json", "yaml", "yml",
  "js", "ts", "tsx", "jsx", "html", "css", "py", "sh", "sql", "xml",
  "rtf", "log", "ini", "conf", "env", "gitignore",
]);

/** Au-delà, on n'indexe que le nom : lire 40 Mo de texte fige l'onglet. */
const TAILLE_MAX_CONTENU = 512 * 1024;

/** Dossiers à ne jamais parcourir — ils feraient exploser l'index. */
const IGNORES = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".cache", "vendor", ".venv", "venv", "Library", "AppData",
]);

export function fileSystemDisponible(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/* ---------- Mémorisation des dossiers autorisés (IndexedDB) ---------- */

/*
 * Pourquoi IndexedDB et pas localStorage : un handle de dossier est un objet
 * structuré, pas une chaîne. localStorage ne stocke que du texte, il le
 * détruirait. IndexedDB le conserve tel quel, avec son autorisation.
 */

const DB = "twaylo-fs";
const STORE = "dossiers";

function ouvrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function lireDossiersMemorises(): Promise<Dossier[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await ouvrirDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as Dossier[]);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[fichiers] lecture des dossiers impossible :", err);
    return [];
  }
}

async function memoriserDossier(d: Dossier): Promise<void> {
  const db = await ouvrirDB();
  await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(d);
    req.onsuccess = () => resolve(null);
    req.onerror = () => reject(req.error);
  });
}

export async function oublierDossier(id: string): Promise<void> {
  const db = await ouvrirDB();
  await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve(null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * L'autorisation peut avoir été révoquée entre deux sessions.
 * `queryPermission` ne demande rien ; `requestPermission` a besoin d'un geste
 * de l'utilisateur, d'où l'appel depuis un clic.
 */
export async function autorisationOk(
  handle: FileSystemDirectoryHandle,
  demander = false,
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
  };
  const opts = { mode: "read" };
  if ((await h.queryPermission?.(opts)) === "granted") return true;
  if (!demander) return false;
  return (await h.requestPermission?.(opts)) === "granted";
}

/** Ouvre le sélecteur système. Doit être appelé depuis un clic. */
export async function choisirDossier(): Promise<Dossier | null> {
  if (!fileSystemDisponible()) return null;
  try {
    const picker = (window as unknown as {
      showDirectoryPicker: (o?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;

    const handle = await picker({ mode: "read" });
    const dossier: Dossier = { id: `${Date.now()}-${handle.name}`, nom: handle.name, handle };
    await memoriserDossier(dossier);
    return dossier;
  } catch (err) {
    // L'utilisateur qui ferme le sélecteur lève AbortError : ce n'est pas
    // une erreur, c'est un choix.
    if ((err as DOMException)?.name === "AbortError") return null;
    console.error("[fichiers] sélection impossible :", err);
    return null;
  }
}

/* ---------- Parcours et indexation ---------- */

function extensionDe(nom: string): string {
  const i = nom.lastIndexOf(".");
  return i === -1 ? "" : nom.slice(i + 1).toLowerCase();
}

/**
 * Parcourt récursivement un dossier.
 *
 * `maxFichiers` est un garde-fou : sans lui, pointer la racine du disque
 * bloquerait l'onglet pendant des minutes. On s'arrête et on le dit.
 */
export async function indexerDossier(
  handle: FileSystemDirectoryHandle,
  options: { maxFichiers?: number; maxProfondeur?: number; onProgress?: (n: number) => void } = {},
): Promise<{ fichiers: FichierIndexe[]; tronque: boolean }> {
  const { maxFichiers = 5000, maxProfondeur = 6, onProgress } = options;
  const fichiers: FichierIndexe[] = [];
  let tronque = false;

  async function parcourir(dir: FileSystemDirectoryHandle, prefixe: string, profondeur: number) {
    if (profondeur > maxProfondeur || fichiers.length >= maxFichiers) {
      if (fichiers.length >= maxFichiers) tronque = true;
      return;
    }

    for await (const [nom, entree] of (
      dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }
    ).entries()) {
      if (fichiers.length >= maxFichiers) {
        tronque = true;
        return;
      }
      if (nom.startsWith(".") || IGNORES.has(nom)) continue;

      const chemin = prefixe ? `${prefixe}/${nom}` : nom;

      if (entree.kind === "directory") {
        await parcourir(entree as FileSystemDirectoryHandle, chemin, profondeur + 1);
        continue;
      }

      try {
        const file = await (entree as FileSystemFileHandle).getFile();
        const extension = extensionDe(nom);
        const indexe: FichierIndexe = {
          chemin,
          nom,
          extension,
          taille: file.size,
          modifie: file.lastModified,
        };

        if (TEXTE.has(extension) && file.size <= TAILLE_MAX_CONTENU) {
          indexe.contenu = await file.text();
        }

        fichiers.push(indexe);
        if (fichiers.length % 200 === 0) onProgress?.(fichiers.length);
      } catch (err) {
        // Un fichier verrouillé par un autre programme ne doit pas arrêter
        // l'indexation entière.
        console.warn(`[fichiers] ${chemin} illisible :`, err);
      }
    }
  }

  await parcourir(handle, "", 0);
  onProgress?.(fichiers.length);
  return { fichiers, tronque };
}

/* ---------- Recherche ---------- */

export type Resultat = {
  fichier: FichierIndexe;
  /** Extrait autour de la première occurrence, pour les fichiers texte. */
  extrait?: string;
  /** Plus haut = plus pertinent. */
  score: number;
};

function sansAccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Cherche dans les noms ET dans le contenu.
 * Un mot dans le nom du fichier pèse plus lourd qu'un mot noyé dans le texte :
 * « salar.md » est plus pertinent que le mot « salar » page 12 d'un script.
 */
export function chercher(fichiers: FichierIndexe[], requete: string, limite = 60): Resultat[] {
  const q = sansAccent(requete.trim());
  if (!q) return [];
  const mots = q.split(/\s+/).filter(Boolean);

  const resultats: Resultat[] = [];

  for (const f of fichiers) {
    const nom = sansAccent(f.nom);
    const chemin = sansAccent(f.chemin);
    const contenu = f.contenu ? sansAccent(f.contenu) : "";

    let score = 0;
    let extrait: string | undefined;

    for (const mot of mots) {
      if (nom.includes(mot)) score += 10;
      else if (chemin.includes(mot)) score += 4;

      if (contenu) {
        const i = contenu.indexOf(mot);
        if (i !== -1) {
          score += 2;
          if (!extrait && f.contenu) {
            const debut = Math.max(0, i - 60);
            extrait =
              (debut > 0 ? "…" : "") +
              f.contenu.slice(debut, i + 120).replace(/\s+/g, " ").trim() +
              "…";
          }
        }
      }
    }

    // Tous les mots doivent avoir accroché quelque part.
    const motsTrouves = mots.filter(
      (m) => nom.includes(m) || chemin.includes(m) || contenu.includes(m),
    ).length;
    if (motsTrouves < mots.length) continue;

    if (score > 0) resultats.push({ fichier: f, extrait, score });
  }

  return resultats.sort((a, b) => b.score - a.score).slice(0, limite);
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  if (octets < 1024 * 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
  return `${(octets / 1024 / 1024 / 1024).toFixed(1)} Go`;
}
