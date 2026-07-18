"use client";

import { useState } from "react";

import { CONTACT_TYPE_LABEL, RELATION_META, RELATION_ORDER } from "@/lib/labels";
import { useOs } from "@/lib/os-context";
import { Chip, ColumnHead, EmptyState } from "@/components/ui";
import { ViewHeader } from "@/components/views/ViewHeader";

/**
 * Le CRM « réseau » : contacts rangés par chaleur de relation
 * (spec Partie 6). Les sponsors et leurs montants vivent dans l'onglet Sponsors.
 */
export function ContactsView() {
  const { data, contacts: distants, ajouterContact, supprimerContact, demoMode } = useOs();
  const [nouveau, setNouveau] = useState("");
  const contacts = ((!demoMode && distants) || data.contacts) as (typeof data.contacts[number] & { id?: string })[];

  return (
    <>
      <ViewHeader
        title="Contacts · Le réseau"
        subtitle={`${contacts.length} ${contacts.length > 1 ? "personnes" : "personne"}`}
        action={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ajouterContact(nouveau);
              setNouveau("");
            }}
            className="flex items-center gap-2"
          >
            <input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="Nom d'un contact…"
              aria-label="Ajouter un contact"
              className="w-[200px] rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold text-white outline-none transition-colors focus:border-white/25"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              type="submit"
              disabled={nouveau.trim().length === 0}
              className="cursor-pointer rounded-[10px] border-none px-3 py-[7px] text-[12.5px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: "var(--grad)" }}
            >
              Ajouter
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {RELATION_ORDER.map((relation) => {
          const meta = RELATION_META[relation];
          const list = contacts.filter((c) => c.relation === relation);

          return (
            <div
              key={relation}
              className="subpanel min-h-[280px] rounded-[16px] px-3 py-[13px]"
            >
              <ColumnHead
                name={meta.label}
                count={list.length}
                color={meta.color}
                size={11}
              />

              {list.length === 0 ? (
                <EmptyState>Personne ici</EmptyState>
              ) : (
                <div className="mt-[11px] flex flex-col gap-[9px]">
                  {list.map((c) => (
                    <button
                      key={c.nom}
                      type="button"
                      className="cursor-pointer rounded-xl px-3 py-[11px] text-left transition-colors hover:brightness-125"
                      style={{
                        background: "rgba(255,255,255,0.045)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13.5px] font-extrabold">{c.nom}</div>
                        <Chip label={CONTACT_TYPE_LABEL[c.type]} color={meta.color} subtle />
                      </div>
                      {c.role && (
                        <div className="mt-1 text-[11.5px] text-white/50">{c.role}</div>
                      )}
                      {c.prochaineAction ? (
                        <div className="mt-[6px] flex items-start gap-[6px]">
                          <span
                            className="mt-[5px] h-[5px] w-[5px] flex-none rounded-full"
                            style={{ background: meta.color }}
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
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
