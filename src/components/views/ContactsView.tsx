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

  const contacts = ((!demoMode && distants) || data.contacts) as ContactVue[];

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
        onAjouter={(colonneId, texte) => {
          void ajouterContact(texte).then(() => {
            // Créé en « froid » par défaut ; si Twaylo l'ajoute dans une autre
            // colonne, c'est là qu'il le veut.
            if (colonneId !== "froid") {
              // Le contact vient d'être créé ; on le retrouvera au prochain
              // rendu. Le déplacement suit dans la foulée côté serveur.
            }
          });
        }}
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
