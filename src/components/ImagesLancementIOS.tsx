/**
 * Les images de lancement natives d'iOS.
 *
 * iOS n'a qu'une façon de savoir quoi afficher pendant qu'il ouvre une
 * application posée sur l'écran d'accueil : une balise `apple-touch-startup-image`
 * dont la requête média correspond EXACTEMENT à l'écran de l'appareil. Pas de
 * correspondance, pas d'image — il peint du blanc. Et une image à la mauvaise
 * résolution n'est pas redimensionnée, elle est ignorée.
 *
 * D'où une entrée par modèle, et non une image « assez grande pour tous ».
 *
 * Les dimensions sont en points CSS (ce que voit la page), la résolution en
 * pixels réels (ce que réclame l'image) : un iPhone 15 mesure 393 × 852 points
 * pour 1179 × 2556 pixels. Les deux sont donc nécessaires.
 *
 * Portrait seulement, assumé. Le manifeste demande déjà le portrait, et
 * doubler la liste pour un lancement en paysage — rare, et qui ne coûte qu'un
 * fond blanc d'une demi-seconde — n'en vaut pas le poids dans l'en-tête.
 */

/** [largeur en points, hauteur en points, densité] */
const IPHONES: [number, number, number][] = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 15 / 14 Pro Max
  [428, 926, 3], // 14 Plus, 13 / 12 Pro Max
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 / 7 / 6s Plus
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // 13 mini, 12 mini, 11 Pro, XS, X
  [375, 667, 2], // SE 2ᵉ/3ᵉ, 8, 7, 6s
  [320, 568, 2], // SE 1ʳᵉ
];

export function ImagesLancementIOS() {
  return (
    <>
      {IPHONES.map(([points, hauteurPoints, densite]) => {
        const l = points * densite;
        const h = hauteurPoints * densite;
        return (
          <link
            key={`${points}x${hauteurPoints}@${densite}`}
            rel="apple-touch-startup-image"
            media={`(device-width: ${points}px) and (device-height: ${hauteurPoints}px) and (-webkit-device-pixel-ratio: ${densite}) and (orientation: portrait)`}
            href={`/splash?l=${l}&h=${h}`}
          />
        );
      })}
    </>
  );
}
