import { NextResponse } from "next/server";
import { NIVEAUX, type Niveau } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  basculerTache,
  basculerTacheGelee,
  changerNiveauTache,
  creerTache,
  ecrireOrdreTaches,
  lireOrdreTaches,
  renommerTache,
  supprimerTache,
  supprimerTachesFaites,
  supprimerToutesTaches,
  versTaches,
} from "@/lib/db";

/** Crée une tâche. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let titre: unknown;
  let categorie: unknown;
  let niveau: unknown;
  try {
    ({ titre, categorie, niveau } = await req.json());
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  if (typeof titre !== "string" || titre.trim().length === 0) {
    return NextResponse.json({ error: "Titre manquant." }, { status: 400 });
  }

  // `Object.hasOwn` et non `in` : ce dernier accepterait « toString », hérité
  // du prototype, et NIVEAUX[niveau] serait alors indéfini.
  const estNiveau = (v: unknown): v is Niveau =>
    typeof v === "string" && Object.hasOwn(NIVEAUX, v);

  try {
    const ligne = await creerTache(
      titre.trim(),
      typeof categorie === "string" ? categorie : undefined,
      estNiveau(niveau) ? niveau : "secondaire",
    );
    return NextResponse.json({ persiste: true, tache: versTaches([ligne])[0] });
  } catch (err) {
    console.error("[tasks] création impossible :", err);
    return NextResponse.json({ error: "Création impossible." }, { status: 500 });
  }
}

/**
 * Modifie une tâche : la cocher, la renommer, ou réordonner la liste entière.
 * Les trois passent par le même verbe parce qu'ils décrivent tous une
 * modification partielle de l'existant.
 */
export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  let corps: {
    id?: unknown;
    faite?: unknown;
    titre?: unknown;
    ordre?: unknown;
    niveau?: unknown;
    gelee?: unknown;
  };
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  try {
    /*
     * Réordonnancement : une liste d'identifiants, sans id unique.
     *
     * Fusion plutôt que remplacement. L'écran qui envoie cette liste ne
     * connaît que SES tâches, telles qu'il les voyait : une tâche créée
     * entre-temps ailleurs (le Brain Telegram, un autre onglet) en est
     * absente, et l'écrire telle quelle effaçait sa place — `trierSelon` la
     * renvoyait alors tout en bas. On réinsère donc les identifiants connus
     * du serveur mais absents de l'envoi, à leur rang d'origine.
     *
     * Les `tmp-…` sont écartés : ce sont des lignes que la base ne connaît pas.
     */
    if (Array.isArray(corps.ordre)) {
      const ids = corps.ordre.filter(
        (x): x is string => typeof x === "string" && !x.startsWith("tmp-"),
      );
      const anciens = await lireOrdreTaches();
      const envoyes = new Set(ids);
      const fusion = [...ids];
      anciens.forEach((id, rang) => {
        if (!envoyes.has(id)) fusion.splice(Math.min(rang, fusion.length), 0, id);
      });
      await ecrireOrdreTaches([...new Set(fusion)].slice(0, 300));
      return NextResponse.json({ persiste: true });
    }

    if (typeof corps.id !== "string") {
      return NextResponse.json({ error: "Paramètre `id` manquant." }, { status: 400 });
    }

    /*
     * TOUS les champs fournis sont appliqués, pas seulement le premier.
     *
     * La version précédente rendait la main dès qu'elle en reconnaissait un :
     * un appel portant à la fois un niveau et un titre — ce que fait le
     * rattrapage des gestes joués avant confirmation d'une tâche — perdait
     * silencieusement le renommage, qui réapparaissait à l'ancien nom au
     * rechargement.
     */
    /*
     * TOUT est validé AVANT la première écriture.
     *
     * Le titre vide était refusé après que le changement de niveau eut déjà
     * été enregistré : l'appelant recevait une erreur pour une requête à
     * moitié appliquée, et ne pouvait pas savoir ce qui était passé.
     */
    const titreDemande =
      typeof corps.titre === "string" ? corps.titre.trim() : undefined;
    if (titreDemande !== undefined && titreDemande.length === 0) {
      return NextResponse.json({ error: "Titre vide." }, { status: 400 });
    }

    let applique = false;

    if (typeof corps.niveau === "string" && Object.hasOwn(NIVEAUX, corps.niveau)) {
      await changerNiveauTache(corps.id, corps.niveau as Niveau);
      applique = true;
    }

    if (titreDemande) {
      await renommerTache(corps.id, titreDemande.slice(0, 200));
      applique = true;
    }

    if (typeof corps.faite === "boolean") {
      await basculerTache(corps.id, corps.faite);
      applique = true;
    }

    /*
     * Le gel — la tâche qui revient tous les jours.
     *
     * Il ne vit pas dans la table `tasks` mais sur la sentinelle (aucune
     * migration possible), d'où un chemin à part : rien à écrire sur la ligne
     * de la tâche, juste un identifiant à ajouter ou à retirer d'une liste.
     */
    if (typeof corps.gelee === "boolean") {
      await basculerTacheGelee(corps.id, corps.gelee);
      applique = true;
    }

    if (applique) return NextResponse.json({ persiste: true });
    return NextResponse.json({ error: "Rien à modifier." }, { status: 400 });
  } catch (err) {
    console.error("[tasks] mise à jour impossible :", err);
    return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  }
}

/** Supprime une tâche. */
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ persiste: false }, { status: 200 });
  }

  const params = new URL(req.url).searchParams;
  const id = params.get("id");

  // Sans `id`, on efface en masse — le « passer au jour suivant ».
  //   ?faites=1 → seulement les tâches cochées (on reporte le reste au lendemain)
  //   sinon     → toute la todo
  if (!id) {
    const seulementFaites = params.get("faites") === "1";
    try {
      if (seulementFaites) await supprimerTachesFaites();
      else await supprimerToutesTaches();
      return NextResponse.json({ persiste: true, vide: true });
    } catch (err) {
      console.error("[tasks] vidage impossible :", err);
      return NextResponse.json({ error: "Vidage impossible." }, { status: 500 });
    }
  }

  try {
    await supprimerTache(id);
    return NextResponse.json({ persiste: true });
  } catch (err) {
    console.error("[tasks] suppression impossible :", err);
    return NextResponse.json({ error: "Suppression impossible." }, { status: 500 });
  }
}
