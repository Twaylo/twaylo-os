import { USER_ID, supabaseAdmin } from "./supabase";

/**
 * La ligne « sentinelle » — le fourre-tout des réglages.
 *
 * Aucune migration n'est possible (le jeton d'accès Supabase a été révoqué),
 * donc tout ce qui n'a pas de colonne vit ici : les définitions d'habitudes,
 * les skills, les blocages, l'ordre d'affichage des tâches, les modèles de
 * journée type, les cases des Oubliés, la personnalisation de l'OS et le jeton
 * YouTube. Une seule ligne de `daily_logs`, au jour 2000-01-01, jamais
 * confondue avec une vraie journée.
 *
 * Ce module existe parce que SIX chemins y écrivent. Chacun avait sa propre
 * routine « je relis, je fusionne, j'écris » — et trois d'entre elles
 * s'arrêtaient là. Or relire avant de fusionner ne protège que d'un écrivain
 * distrait, pas de deux écrivains simultanés : deux lectures prises avant la
 * première écriture, et la seconde ressuscite ce que la première venait de
 * changer. Concrètement, modifier sa journée type pendant que l'OS enregistre
 * l'ordre des tâches pouvait faire disparaître les habitudes.
 *
 * Un seul écrivain, donc, et il vérifie.
 */

export const JOUR_SENTINELLE = "2000-01-01";

/** Le contenu brut de la sentinelle, ou un objet vide si elle n'existe pas. */
export async function lireSentinelle(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin()
    .from("daily_logs")
    .select("habitudes")
    .eq("user_id", USER_ID)
    .eq("jour", JOUR_SENTINELLE)
    .maybeSingle();

  if (error) throw error;
  return (data?.habitudes ?? {}) as Record<string, unknown>;
}

/**
 * Fusionne un correctif dans la sentinelle, et s'assure qu'il a tenu.
 *
 * Aucun verrou n'étant possible, on vérifie après coup : on relit, et si nos
 * clés ne portent pas nos valeurs, c'est qu'une autre écriture nous a
 * emportés — on refusionne alors sur la version fraîche. La séquence
 * converge : chacun se réinsère par-dessus la liste gagnante au lieu de la
 * remplacer.
 */
export async function majSentinelle(patch: Record<string, unknown>): Promise<void> {
  const db = supabaseAdmin();
  const cles = Object.keys(patch);

  for (let essai = 0; essai < 3; essai++) {
    const actuel = await lireSentinelle();

    const { error } = await db.from("daily_logs").upsert(
      {
        user_id: USER_ID,
        jour: JOUR_SENTINELLE,
        habitudes: { ...actuel, ...patch },
      },
      { onConflict: "user_id,jour" },
    );
    if (error) throw error;

    const relu = await lireSentinelle();
    // La comparaison porte sur la forme sérialisée : ces valeurs sont du JSON
    // simple, et l'égalité de référence ne dirait rien après un aller-retour.
    const tenu = cles.every((c) => JSON.stringify(relu[c]) === JSON.stringify(patch[c]));
    if (tenu) return;
  }

  console.error("[sentinelle] écriture emportée trois fois par une autre — abandon");
}
