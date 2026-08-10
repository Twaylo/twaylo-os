/**
 * L'écran de lancement, rendu côté serveur.
 *
 * Composant serveur volontairement : il fait partie du HTML livré, donc il est
 * peint AVANT que le moindre JavaScript ne s'exécute. C'est toute sa raison
 * d'être — il couvre précisément l'intervalle pendant lequel React n'existe
 * pas encore. Monté par React, il serait arrivé après le vide.
 *
 * Le logo est recopié ici plutôt qu'importé du composant `Logo` : celui-ci est
 * un composant client, l'importer entraînerait tout le contexte de l'OS dans
 * le lot et ferait dépendre l'écran de lancement de ce qu'il attend.
 */
export function EcranLancement() {
  return (
    <div className="ecran-lancement" id="ecran-lancement" aria-hidden>
      <div className="flex items-center gap-[11px]">
        <div className="logo-mark relative h-[46px] w-[46px] overflow-hidden rounded-[14px]">
          <svg width="46" height="46" viewBox="0 0 38 38" className="block">
            <defs>
              <linearGradient id="lancementGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff3d8b" />
                <stop offset="0.38" stopColor="#ffc63d" />
                <stop offset="0.7" stopColor="#3ddc84" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="36" height="36" rx="11" fill="rgba(255,255,255,0.05)" />
            <path d="M14 11 L28 19 L14 27 Z" fill="url(#lancementGrad)" />
          </svg>
        </div>
        <span className="text-[26px] font-black tracking-[-0.02em]" style={{ color: "#eef3f8" }}>
          twaylo
        </span>
      </div>

      <div className="lancement-piste" />
    </div>
  );
}
