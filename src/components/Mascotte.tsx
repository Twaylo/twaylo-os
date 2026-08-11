/*
 * Sans « use client », et c'est délibéré.
 *
 * Ce fichier n'a ni état, ni gestionnaire d'événement, ni effet : rien que du
 * SVG et des classes CSS. Il peut donc être rendu par le serveur, ce qui
 * permet à la page publique — qui doit s'ouvrir le plus vite du site — de
 * montrer le compagnon sans embarquer une ligne de JavaScript. Le sas, lui,
 * l'importe depuis un composant client : cela fonctionne dans les deux sens.
 */

/**
 * OSCAR — le petit compagnon du sas.
 *
 * Pourquoi une mascotte, et pas juste un titre. Un enchaînement de six écrans
 * sans personne dedans est un formulaire déguisé : on le remplit vite, mal, ou
 * pas du tout. Un compagnon qui pose la question la rend adressée à soi. C'est
 * tout le procédé de Duolingo, et il ne tient à rien d'autre qu'à deux yeux et
 * une bulle.
 *
 * Il est dessiné, pas importé : une image de 200 Ko sur le premier écran d'un
 * produit qui se veut instantané, ce serait payer très cher deux cercles et un
 * arc. En SVG, il pèse quelques lignes, reste net sur tous les écrans, et
 * prend la couleur du profil choisi — l'OS d'un étudiant et celui d'un
 * créateur n'ont plus le même compagnon.
 *
 * Il respire (flottement lent) et cligne des yeux. Les deux sont coupés par
 * `prefers-reduced-motion`, comme le reste de l'OS.
 */

export type Humeur = "salut" | "neutre" | "pense" | "content" | "bravo";

export function Mascotte({
  humeur = "neutre",
  couleur = "var(--color-cya)",
  taille = 92,
}: {
  humeur?: Humeur;
  couleur?: string;
  taille?: number;
}) {
  return (
    <div
      className="mascotte"
      style={{ width: taille, height: taille }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" width={taille} height={taille}>
        <defs>
          <linearGradient id="mascCorps" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={couleur} stopOpacity="1" />
            <stop offset="1" stopColor={couleur} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* L'ombre au sol : c'est elle qui fait qu'il flotte plutôt qu'il ne glisse. */}
        <ellipse className="masc-ombre" cx="50" cy="93" rx="22" ry="4" fill="rgba(0,0,0,0.35)" />

        <g className="masc-corps">
          {/* L'antenne, avec sa bille qui pulse doucement. */}
          <rect x="48.5" y="8" width="3" height="12" rx="1.5" fill={couleur} opacity="0.7" />
          <circle className="masc-bille" cx="50" cy="8" r="4.5" fill={couleur} />

          {/* Le corps : l'icône de l'application, en volume. */}
          <rect
            x="14"
            y="18"
            width="72"
            height="66"
            rx="22"
            fill="url(#mascCorps)"
          />
          {/* L'écran du visage, en creux. */}
          <rect x="21" y="25" width="58" height="46" rx="16" fill="#0a1420" />

          <Visage humeur={humeur} couleur={couleur} />

          {/* Les deux pieds. */}
          <rect x="30" y="82" width="13" height="6" rx="3" fill={couleur} opacity="0.8" />
          <rect x="57" y="82" width="13" height="6" rx="3" fill={couleur} opacity="0.8" />

          {/* Le bras levé du salut — seulement quand il salue. */}
          {humeur === "salut" && (
            <g className="masc-bras">
              <rect x="83" y="34" width="7" height="20" rx="3.5" fill={couleur} opacity="0.85" />
              <circle cx="86.5" cy="32" r="5" fill={couleur} />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

/** Les yeux et la bouche. Cinq humeurs, quelques traits chacune. */
function Visage({ humeur, couleur }: { humeur: Humeur; couleur: string }) {
  const blanc = "#eef4fb";

  if (humeur === "pense") {
    return (
      <g>
        {/* Regard en l'air, et trois points qui défilent : il réfléchit. */}
        <circle cx="38" cy="42" r="4.5" fill={blanc} />
        <circle cx="62" cy="42" r="4.5" fill={blanc} />
        <g fill={couleur}>
          <circle className="masc-point masc-point-1" cx="40" cy="58" r="3" />
          <circle className="masc-point masc-point-2" cx="50" cy="58" r="3" />
          <circle className="masc-point masc-point-3" cx="60" cy="58" r="3" />
        </g>
      </g>
    );
  }

  if (humeur === "bravo") {
    return (
      <g>
        {/* Deux étoiles dans les yeux, et un grand sourire. */}
        <path d="M38 39 l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="#ffd23d" />
        <path d="M62 39 l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="#ffd23d" />
        <path d="M40 60 q10 9 20 0" stroke={blanc} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>
    );
  }

  const sourire =
    humeur === "content" || humeur === "salut"
      ? "M40 58 q10 8 20 0"
      : "M42 59 q8 4 16 0";

  return (
    <g>
      {/*
        Les yeux clignent par une mise à l'échelle verticale, pas par un
        changement de forme : un seul groupe animé, aucun rendu supplémentaire.
      */}
      <g className="masc-yeux">
        <rect x="33" y="37" width="9" height="13" rx="4.5" fill={blanc} />
        <rect x="58" y="37" width="9" height="13" rx="4.5" fill={blanc} />
      </g>
      <path d={sourire} stroke={blanc} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      {/* Les joues, seulement quand il sourit franchement. */}
      {(humeur === "content" || humeur === "salut") && (
        <g fill={couleur} opacity="0.35">
          <circle cx="29" cy="54" r="4" />
          <circle cx="71" cy="54" r="4" />
        </g>
      )}
    </g>
  );
}

/**
 * La bulle de dialogue.
 *
 * Le texte y arrive lettre après lettre quand la clé change — c'est ce petit
 * délai qui fait lire la question au lieu de la survoler. Rendu sans
 * JavaScript de frappe : une simple animation de largeur coûterait un
 * repositionnement à chaque image, on anime donc l'opacité par mots.
 */
export function Bulle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bulle-mascotte">
      {children}
      <span className="bulle-pointe" aria-hidden />
    </div>
  );
}
