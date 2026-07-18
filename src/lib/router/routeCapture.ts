import type { Classification } from "./classifyCapture";
import { USER_ID, isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { localDateKey } from "@/lib/local-date";

/**
 * Écrit la capture brute puis la route vers sa table métier (spec Partie 5,
 * étapes 5 à 8).
 *
 * Une capture n'est jamais perdue : la ligne `captures` est écrite d'abord,
 * et le routage vers tasks/videos/contacts/goals vient après. Si le routage
 * échoue, la boîte de réception garde la trace et `traite` reste faux.
 */

export type RouteResult = {
  captureId: string | null;
  /** La table métier atteinte, ou null si la capture reste en boîte de réception. */
  routedTo: string | null;
  persiste: boolean;
};

export async function routeCapture(
  texte: string,
  classification: Classification,
  source: "voix" | "texte" | "web" | "manuel",
  audioUrl?: string,
): Promise<RouteResult> {
  if (!isSupabaseConfigured()) {
    return { captureId: null, routedTo: null, persiste: false };
  }

  const db = supabaseAdmin();

  // 1. La boîte de réception, toujours en premier.
  const { data: capture, error: captureError } = await db
    .from("captures")
    .insert({
      user_id: USER_ID,
      texte,
      type: classification.type,
      priorite: classification.urgence,
      source,
      audio_url: audioUrl ?? null,
      classification: { ...classification, jour_local: localDateKey() },
      traite: false,
    })
    .select("id")
    .single();

  if (captureError) throw captureError;
  const captureId = capture.id as string;

  // 2. Routage métier. Les types sans table dédiée (note, depense, journal)
  //    restent en boîte de réception — c'est un état valide, pas un échec.
  let routedTo: string | null = null;
  // L'identifiant de la ligne créée est mémorisé dans `captures.routed_to` :
  // le bouton « Clé » de Telegram peut alors corriger la tâche directement,
  // sans avoir à la retrouver par son titre.
  let routedId: string | null = null;

  try {
    switch (classification.type) {
      case "tache": {
        const { data, error } = await db
          .from("tasks")
          .insert({
            user_id: USER_ID,
            titre: classification.resume,
            urgence: classification.urgence,
            categorie: classification.tags[0] ?? null,
            notes: texte !== classification.resume ? texte : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        routedTo = "tasks";
        routedId = data.id;
        break;
      }

      case "idee_video": {
        const { data, error } = await db
          .from("videos")
          .insert({
            user_id: USER_ID,
            titre: classification.resume,
            statut: "idee",
            // Le format se décide au montage ; « long » est le défaut du schéma.
            hook: texte !== classification.resume ? texte : null,
          })
          .select("id")
          .single();
        if (error) throw error;
        routedTo = "videos";
        routedId = data.id;
        break;
      }

      case "contact": {
        const { data, error } = await db
          .from("contacts")
          .insert({
            user_id: USER_ID,
            nom: classification.resume,
            type: "collab",
            relation: "froid",
            prochaine_action: texte,
          })
          .select("id")
          .single();
        if (error) throw error;
        routedTo = "contacts";
        routedId = data.id;
        break;
      }

      case "objectif": {
        const { data, error } = await db
          .from("goals")
          .insert({
            user_id: USER_ID,
            objectif: classification.resume,
            portee:
              classification.urgence === "aujourdhui" ||
              classification.urgence === "semaine"
                ? "semaine"
                : classification.urgence === "mois"
                  ? "mois"
                  : "annee",
          })
          .select("id")
          .single();
        if (error) throw error;
        routedTo = "goals";
        routedId = data.id;
        break;
      }

      case "journal": {
        // Un jour = une ligne : on complète l'entrée du jour local plutôt que
        // d'en créer une seconde.
        const jour = localDateKey();
        const { data: existant } = await db
          .from("daily_logs")
          .select("journal_texte")
          .eq("user_id", USER_ID)
          .eq("jour", jour)
          .maybeSingle();

        const fusion = existant?.journal_texte
          ? `${existant.journal_texte}\n\n${texte}`
          : texte;

        const { error } = await db
          .from("daily_logs")
          .upsert(
            { user_id: USER_ID, jour, journal_texte: fusion },
            { onConflict: "user_id,jour" },
          );
        if (error) throw error;
        routedTo = "daily_logs";
        break;
      }

      default:
        // depense, note : restent en boîte de réception.
        break;
    }

    if (routedTo) {
      await db
        .from("captures")
        .update({ traite: true, routed_to: { table: routedTo, id: routedId } })
        .eq("id", captureId);
    }
  } catch (err) {
    // La capture est déjà sauvée ; on remonte l'échec du routage sans le
    // masquer (spec Partie 10, bug 3).
    console.error("[route] routage métier impossible :", err);
  }

  // 3. Journal d'audit.
  try {
    await db.from("audit_log").insert({
      user_id: USER_ID,
      action: "capture.create",
      resource_type: routedTo ?? "captures",
      resource_id: captureId,
      metadata: { source, moteur: classification.moteur, type: classification.type },
    });
  } catch (err) {
    console.error("[route] audit_log impossible :", err);
  }

  // TODO étape 6 : embedding OpenAI → memory_chunks (spec Partie 6).

  return { captureId, routedTo, persiste: true };
}
