import { USER_ID, supabaseAdmin } from "./supabase";
import { CUSTOM_DEFAUT, bornerCustom, type CustomConfig } from "./custom";

/**
 * L'accès base des réglages de personnalisation, côté serveur uniquement.
 *
 * Même logement que les skills et Momentum : la ligne sentinelle de
 * daily_logs (le jeton Supabase étant révoqué, pas de nouvelle table).
 * Module séparé de db.ts, comme momentum-db : un bloc autonome.
 */
const JOUR_SENTINELLE = "2000-01-01";

export async function lireCustom(): Promise<CustomConfig> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  const custom = (data?.habitudes as { custom?: Partial<CustomConfig> } | null)?.custom;
  if (!custom || typeof custom !== "object") return CUSTOM_DEFAUT;
  return bornerCustom(custom);
}

/** Relit puis fusionne : écrire le custom ne doit pas effacer le reste de la sentinelle. */
export async function ecrireCustom(config: CustomConfig): Promise<void> {
  const db = supabaseAdmin();

  const { data, error: erreurLecture } = await db
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (erreurLecture) throw erreurLecture;

  const { error } = await db.from("daily_logs").upsert(
    {
      user_id: USER_ID,
      jour: JOUR_SENTINELLE,
      habitudes: {
        ...((data?.habitudes ?? {}) as object),
        custom: bornerCustom(config),
      },
    },
    { onConflict: "user_id,jour" },
  );

  if (error) throw error;
}
