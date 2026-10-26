"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * LA LISTE QUI S'ÉCARTE, au lieu de sauter.
 *
 * Une tâche ajoutée en tête, une tâche supprimée, une tâche passée d'une liste
 * à l'autre, une coche venue de l'autre écran : à chaque fois, toutes les
 * lignes suivantes changeaient de place D'UN COUP. C'est ce saut, répété des
 * dizaines de fois par jour, qui donne une impression de raideur.
 *
 * La technique s'appelle FLIP : on mesure où chaque ligne ÉTAIT, où elle EST
 * après la mise à jour, et on la fait partir de l'ancienne place pour glisser
 * jusqu'à la nouvelle — en horizontal aussi, pour une tâche qui change de
 * colonne. Une ligne qui n'existait pas apparaît en fondu. Le tout avant la
 * première peinture : on ne voit jamais la ligne à sa nouvelle place avant
 * qu'elle y glisse.
 *
 * Les lignes se repèrent par `data-cle`. Rien ne bouge pendant un glissement
 * (`actif` faux) : le moteur de glisser-déposer anime déjà les voisines, et
 * deux animations sur les mêmes lignes se contrarieraient.
 */
/**
 * La place d'un élément dans la page, SANS ses transformations.
 *
 * `getBoundingClientRect` compte les animations en cours : relevées pendant le
 * fondu d'entrée des lignes (qui les décale de quelques pixels), les places
 * « d'avant » étaient fausses, et l'ajout suivant faisait glisser toute la
 * liste de 8 px pour rien. La chaîne des `offsetTop` ignore les
 * transformations : c'est la place réelle, celle de la mise en page.
 */
function placeDe(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export function useFlipListe(
  conteneur: RefObject<HTMLElement | null>,
  /** Une empreinte de la liste : l'ordre des clés, et leur colonne. */
  empreinte: string,
  actif: boolean,
): void {
  const avant = useRef(new Map<string, { x: number; y: number }>());
  const premier = useRef(true);

  useLayoutEffect(() => {
    const racine = conteneur.current;
    if (!racine) return;
    const origine = placeDe(racine);
    const elements = [...racine.querySelectorAll<HTMLElement>("[data-cle]")];
    // Des positions RELATIVES au conteneur : ce qui bouge au-dessus de la
    // liste, ou un défilement de la page, ne doit pas la faire glisser.
    const apres = new Map(
      elements.map((el) => {
        const p = placeDe(el);
        return [el.dataset.cle ?? "", { x: p.x - origine.x, y: p.y - origine.y }];
      }),
    );

    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!premier.current && actif && !reduit) {
      for (const el of elements) {
        const cle = el.dataset.cle ?? "";
        const fin = apres.get(cle);
        const debut = avant.current.get(cle);
        if (!fin) continue;
        if (!debut) {
          el.animate(
            [
              { opacity: 0, transform: "translateY(-6px) scale(0.985)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 320, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
          );
          continue;
        }
        const dx = debut.x - fin.x;
        const dy = debut.y - fin.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 380,
          easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        });
      }
    }
    premier.current = false;
    avant.current = apres;
  }, [conteneur, empreinte, actif]);
}
