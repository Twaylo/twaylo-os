import { lireSentinelle, majSentinelle } from "./sentinelle";
import { CUSTOM_DEFAUT, bornerCustom, type CustomConfig } from "./custom";

/**
 * L'accès base des réglages de personnalisation, côté serveur uniquement.
 *
 * Même logement que les skills et les journées types : la ligne sentinelle de
 * daily_logs (le jeton Supabase étant révoqué, pas de nouvelle table).
 */

export async function lireCustom(): Promise<CustomConfig> {
  const custom = (await lireSentinelle()).custom as Partial<CustomConfig> | undefined;
  if (!custom || typeof custom !== "object") return CUSTOM_DEFAUT;
  return bornerCustom(custom);
}

/**
 * Par l'écrivain vérifié de la sentinelle.
 *
 * Cette fonction relisait puis écrasait de son côté. Cela protège d'un
 * écrivain distrait, pas de deux écritures qui se croisent : changer une
 * couleur pendant que l'OS enregistre une habitude ou l'ordre des tâches
 * pouvait faire disparaître l'autre réglage.
 */
export async function ecrireCustom(config: CustomConfig): Promise<void> {
  await majSentinelle({ custom: bornerCustom(config) });
}
