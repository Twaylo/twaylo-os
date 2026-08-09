"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Le filet — ce qui empêche un onglet cassé d'emporter tout l'OS.
 *
 * Sans lui, la moindre erreur de rendu laissait un ÉCRAN BLANC : plus de
 * rail, plus d'onglets, plus rien à cliquer. C'est arrivé pour de vrai — une
 * réponse serveur d'une forme inattendue suffisait — et sur un téléphone où
 * l'OS tourne en mode application, un écran blanc veut dire forcer la
 * fermeture sans savoir ce qui s'est passé.
 *
 * Le filet est posé AUTOUR de la vue, pas autour de l'application : le rail
 * du haut survit, les autres onglets restent accessibles, et l'onglet fautif
 * affiche ce qui s'est passé avec un bouton pour réessayer. Une carte qui
 * tombe ne doit jamais coûter la journée.
 *
 * Une classe, parce que React ne sait attraper une erreur de rendu que comme
 * ça — il n'existe pas d'équivalent en composant de fonction.
 */

type Props = { children: ReactNode; nom: string };
type State = { erreur: Error | null };

export class Filet extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    // Jamais silencieux : la trace part dans la console pour qu'on puisse
    // remonter au vrai coupable.
    console.error(`[${this.props.nom}] rendu impossible :`, erreur, infos.componentStack);
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    return (
      <section className="panel" style={{ border: "1px solid rgba(255,61,139,0.3)" }}>
        <span className="panel-accent" style={{ background: "var(--color-mag)" }} aria-hidden />
        <div className="py-4 text-center">
          <div className="text-[28px]">🩹</div>
          <div className="mt-[8px] text-[15px] font-black">
            Cet onglet a buggé, le reste de l&apos;OS va bien.
          </div>
          <div className="mx-auto mt-[6px] max-w-[440px] text-[12px] font-semibold leading-[1.5] text-white/45">
            Rien n&apos;est perdu : tes données sont en base. Réessaie, ou passe à un
            autre onglet et reviens.
          </div>
          <div
            className="mx-auto mt-[12px] max-w-[440px] overflow-x-auto rounded-[9px] px-[10px] py-[7px] text-left font-mono text-[10.5px] text-white/35"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            {erreur.message || String(erreur)}
          </div>
          <button
            type="button"
            onClick={() => this.setState({ erreur: null })}
            className="mt-[13px] cursor-pointer rounded-[10px] px-[16px] py-[8px] text-[12.5px] font-extrabold transition-all hover:brightness-125"
            style={{ color: "#07121d", background: "var(--color-mag)" }}
          >
            Réessayer
          </button>
        </div>
      </section>
    );
  }
}
