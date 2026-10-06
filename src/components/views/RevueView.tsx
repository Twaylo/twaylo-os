"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCockpit } from "@/lib/p90-context";
import { Bouton, Carte, Surtitre, Vide } from "@/components/p90/ui";

/**
 * LA REVUE DE SEMAINE.
 *
 * Une fois par semaine, on arrête d'exécuter et on regarde ce qui s'est passé.
 * « Sceller » fige la semaine en lecture seule : la revue devient une archive,
 * pas un brouillon qu'on réécrit trois mois plus tard.
 *
 * Elle est rangée sur la ligne du LUNDI de sa semaine, dans `daily_logs` —
 * aucune table ne peut être ajoutée (le jeton Supabase a été révoqué), et une
 * revue appartient à une semaine, qui commence un lundi.
 *
 * Volontairement sobre : Twaylo ne s'en sert pas, il a demandé qu'on la garde.
 * Elle marche, elle ne coûte rien à l'écran, elle n'occupe plus 418 lignes.
 */

type Revue = {
  gains: string;
  contenuPublie: string;
  ceQuiADerape: string;
  bouclesOuvertes: string;
  personnesARelancer: string;
  patternSante: string;
  top3: string;
  scelle: boolean;
};

const VIDE: Revue = {
  gains: "",
  contenuPublie: "",
  ceQuiADerape: "",
  bouclesOuvertes: "",
  personnesARelancer: "",
  patternSante: "",
  top3: "",
  scelle: false,
};

const CHAMPS: { cle: keyof Omit<Revue, "scelle">; titre: string; aide: string }[] = [
  { cle: "gains", titre: "Ce que j'ai gagné", aide: "Ce qui a avancé, même petit." },
  { cle: "contenuPublie", titre: "Contenu publié", aide: "Vidéos sorties, formats testés." },
  { cle: "ceQuiADerape", titre: "Ce qui a dérapé", aide: "Sans se juger — juste le constat." },
  { cle: "bouclesOuvertes", titre: "Boucles ouvertes", aide: "Ce qui traîne et qu'il faut fermer." },
  { cle: "personnesARelancer", titre: "Personnes à relancer", aide: "Qui attend une réponse." },
  { cle: "patternSante", titre: "Corps et énergie", aide: "Sommeil, sport, ce que tu as senti." },
  { cle: "top3", titre: "Les 3 de la semaine prochaine", aide: "Ce qui comptera vraiment." },
];

/**
 * Le lundi de la semaine d'un jour local, et ses bornes affichées.
 *
 * Tout se calcule en UTC à partir du jour DÉJÀ exprimé dans le fuseau de
 * Twaylo : mélanger le fuseau du navigateur et le sien décalait la semaine —
 * donc la clé de rangement — d'un jour au passage de minuit.
 */
function semaineDe(jourLocal: string): { lundi: string; du: string; au: string; numero: number } {
  const d = new Date(`${jourLocal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const dimanche = new Date(d);
  dimanche.setUTCDate(d.getUTCDate() + 6);

  // Jeudi de la même semaine : c'est lui qui détermine l'année ISO.
  const jeudi = new Date(d);
  jeudi.setUTCDate(d.getUTCDate() + 3);
  const debutAnnee = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((jeudi.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7);

  const fmt = (x: Date) =>
    x.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  return { lundi: d.toISOString().slice(0, 10), du: fmt(d), au: fmt(dimanche), numero };
}

export function RevueView() {
  const { aujourdhui } = useCockpit();
  const { lundi, du, au, numero } = semaineDe(aujourdhui);

  const [revue, setRevue] = useState<Revue>(VIDE);
  /**
   * La semaine que l'état décrit, plutôt qu'un simple « chargé ».
   *
   * Avec un booléen, changer de semaine demandait un `setCharge(false)`
   * synchrone au début de l'effet — une cascade de rendus que le compilateur
   * React refuse. En rangeant le lundi lu, « chargé » se DÉDUIT : il suffit de
   * comparer. Aucun état à remettre à zéro, donc rien à écrire en entrant.
   */
  const [lundiCharge, setLundiCharge] = useState<string | null>(null);
  const charge = lundiCharge === lundi;
  /** Vrai dès la première frappe de Twaylo — pas au simple chargement. */
  const touche = useRef(false);

  useEffect(() => {
    let annule = false;
    touche.current = false;
    void fetch(`/api/revue?lundi=${lundi}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { revue?: Partial<Revue> }) => {
        if (annule) return;
        setRevue({ ...VIDE, ...(d.revue ?? {}) });
        setLundiCharge(lundi);
      })
      .catch((err) => {
        console.error("[revue] lecture impossible :", err);
        // Lu ou non, on ouvre les champs : une revue qu'on ne peut pas
        // afficher est au moins une revue qu'on peut écrire.
        if (!annule) setLundiCharge(lundi);
      });
    return () => {
      annule = true;
    };
  }, [lundi]);

  /*
   * L'enregistrement est différé d'une seconde après la dernière frappe.
   *
   * Sans ce délai, taper une phrase envoyait une requête par caractère ; et
   * sans le drapeau « touché », le simple affichage réécrivait en base ce
   * qu'on venait d'en lire.
   */
  const enregistrer = useCallback(
    (suivante: Revue) => {
      void fetch("/api/revue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lundi, revue: suivante }),
      }).catch((err) => console.error("[revue] écriture impossible :", err));
    },
    [lundi],
  );

  useEffect(() => {
    if (!charge || !touche.current) return;
    const t = setTimeout(() => enregistrer(revue), 1000);
    return () => clearTimeout(t);
  }, [revue, charge, enregistrer]);

  const modifier = (cle: keyof Omit<Revue, "scelle">, v: string) => {
    touche.current = true;
    setRevue((p) => ({ ...p, [cle]: v }));
  };

  const remplis = CHAMPS.filter((c) => revue[c.cle].trim()).length;

  return (
    <div className="entree-vue space-y-[13px]">
      <Carte accent="var(--color-vio)">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Surtitre couleur="var(--color-vio-soft)">Revue de la semaine {numero}</Surtitre>
            <div className="text-[11px] text-white/40">
              du {du} au {au}
            </div>
          </div>
          <div className="flex items-center gap-[9px]">
            <span className="nombres text-[11px] text-white/40">
              {remplis}/{CHAMPS.length}
            </span>
            <Bouton
              ton={revue.scelle ? "fin" : "plein"}
              onClick={() => {
                touche.current = true;
                setRevue((p) => ({ ...p, scelle: !p.scelle }));
              }}
            >
              {revue.scelle ? "Rouvrir" : "Sceller la semaine"}
            </Bouton>
          </div>
        </div>

        {!charge && <Vide>Lecture de la revue…</Vide>}

        {charge && (
          <div className="mt-[11px] grid grid-cols-1 gap-[9px] lg:grid-cols-2">
            {CHAMPS.map((c) => (
              <div key={c.cle} className="carte-haute p-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold">{c.titre}</span>
                  <span className="text-[10px] text-white/40 opacity-70">{c.aide}</span>
                </div>
                <textarea
                  value={revue[c.cle]}
                  readOnly={revue.scelle}
                  onChange={(e) => modifier(c.cle, e.target.value)}
                  className="mt-[7px] w-full resize-y rounded-[8px] px-[9px] py-[7px] text-[13px] leading-[1.5] outline-none transition-colors read-only:opacity-60 focus:border-[var(--p90-accent)]"
                  style={{
                    minHeight: 76,
                    background: "var(--p90-fond)",
                    border: "1px solid var(--p90-bord)",
                    color: "var(--p90-texte)",
                    transitionDuration: "var(--p90-vitesse)",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Carte>
    </div>
  );
}
