"use client";

import { CONTACT_TYPE_LABEL, RELATION_META, RELATION_ORDER } from "@/lib/labels";
import { useOs } from "@/lib/os-context";
import { Chip } from "@/components/ui";
import { Kanban, type ColonneKanban } from "@/components/Kanban";
import { ViewHeader } from "@/components/views/ViewHeader";
import type { Contact } from "@/lib/types";

type ContactVue = Contact & { id?: string };

/**
 * Le CRM « réseau » : contacts rangés par chaleur de relation.
 *
 * Glisser une carte d'une colonne à l'autre change la chaleur — c'est la
 * seule chose qui bouge vraiment dans un réseau. Palmito passe de tiède à
 * chaud le jour où il répond.
 */
export function ContactsView() {
  const {
    data,
    contacts: distants,
    ajouterContact,
    supprimerContact,
    deplacerContact,
    demoMode,
  } = useOs();

  /*
   * Hors démo, on n'affiche QUE ce qui vient de la base — quitte à ne rien
   * afficher le temps qu'elle réponde.
   *
   * Le repli sur le jeu d'amorçage semblait aimable, mais ces contacts-là
   * n'ont pas d'identifiant : ils s'affichaient impossibles à déplacer et
   * impossibles à supprimer, et le restaient définitivement si la base n'était
   * pas joignable. Une liste vide qui se remplit vaut mieux qu'une liste
   * fantôme sur laquelle rien ne marche.
   */
  const contacts = (demoMode ? data.contacts : (distants ?? [])) as ContactVue[];

  const colonnes: ColonneKanban<ContactVue>[] = RELATION_ORDER.map((relation) => ({
    id: relation,
    nom: RELATION_META[relation].label,
    couleur: RELATION_META[relation].color,
    items: contacts.filter((c) => c.relation === relation),
  }));

  return (
    <>
      <ViewHeader
        title="Contacts · Le réseau"
        subtitle={`${contacts.length} ${contacts.length > 1 ? "personnes" : "personne"} · glisse une carte pour changer sa chaleur`}
      />

      <Kanban
        colonnes={colonnes}
        cleDe={(c) => c.id}
        onDeplacer={deplacerContact}
        onSupprimer={supprimerContact}
        // Le contact est créé DANS la colonne où Twaylo a tapé. L'ancienne
        // version le mettait toujours en « froid » et prétendait le déplacer
        // ensuite — le corps de la promesse ne contenait qu'un commentaire.
        onAjouter={(colonneId, texte) => ajouterContact(texte, "collab", colonneId)}
        placeholderAjout="Nom…"
        hauteurMin={280}
        rendre={(c) => (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13.5px] font-extrabold">{c.nom}</div>
              <Chip
                label={CONTACT_TYPE_LABEL[c.type]}
                color={RELATION_META[c.relation].color}
                subtle
              />
            </div>
            {c.role && <div className="mt-1 text-[11.5px] text-white/50">{c.role}</div>}
            {c.prochaineAction ? (
              <div className="mt-[6px] flex items-start gap-[6px]">
                <span
                  className="mt-[5px] h-[5px] w-[5px] flex-none rounded-full"
                  style={{ background: RELATION_META[c.relation].color }}
                />
                <span className="text-[11.5px] leading-[1.35] text-white/65">
                  {c.prochaineAction}
                </span>
              </div>
            ) : (
              <div className="mt-[6px] text-[11.5px] text-white/25">
                Pas de prochaine action
              </div>
            )}
          </>
        )}
      />
    </>
  );
}
