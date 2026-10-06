"use client";

import { useCallback, useEffect, useState } from "react";
import { decoderMeta, nomObjectif } from "@/lib/p90";
import { useCockpit } from "@/lib/p90-context";
import { Bouton, Carte, Puce, Surtitre, Vide } from "@/components/p90/ui";

/**
 * LES OUBLIÉS — la sauvegarde.
 *
 * Tout ce qui est supprimé de la todo atterrit ici au lieu de disparaître.
 * C'est la seule raison d'être de cet écran : pouvoir se tromper. On y reprend
 * une tâche en un geste, ou on l'efface pour de bon — et cet effacement-là est
 * le seul qui détruise vraiment quelque chose dans tout l'OS.
 */

type Oubliee = { id: string; titre: string; categorie: string | null; jours: number };

export function OubliesView() {
  const { recharger } = useCockpit();
  const [liste, setListe] = useState<Oubliee[] | null>(null);
  const [confirme, setConfirme] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/oublies", { cache: "no-store" });
      const data = (await res.json()) as { oubliees?: Oubliee[] };
      setListe(data.oubliees ?? []);
    } catch (err) {
      console.error("[oublies] lecture impossible :", err);
      setListe([]);
    }
  }, []);

  useEffect(() => {
    // En micro-tâche : un `setState` synchrone dans un effet est une cascade
    // de rendus, que le compilateur React refuse.
    queueMicrotask(() => void charger());
  }, [charger]);

  const reprendre = async (id: string) => {
    setListe((p) => (p ?? []).filter((o) => o.id !== id));
    try {
      await fetch("/api/oublies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // La todo doit la revoir : on relit, plutôt que de deviner sa place.
      await recharger();
    } catch (err) {
      console.error("[oublies] reprise impossible :", err);
      await charger();
    }
  };

  const effacer = async (id: string) => {
    setConfirme(null);
    setListe((p) => (p ?? []).filter((o) => o.id !== id));
    try {
      await fetch(`/api/oublies?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      console.error("[oublies] suppression impossible :", err);
      await charger();
    }
  };

  return (
    <div className="entree-vue space-y-[13px]">
      <Carte>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Surtitre>Oubliés — la sauvegarde</Surtitre>
          <span className="nombres text-[11px] text-[var(--p90-texte-2)]">{liste?.length ?? 0}</span>
        </div>
        <div className="mt-[3px] text-[11px] text-[var(--p90-texte-2)]">
          Tout ce qui est supprimé de la todo arrive ici. Rien ne s&apos;y range tout seul.
        </div>

        {liste === null && <Vide>Lecture…</Vide>}
        {liste?.length === 0 && <Vide indice="C'est bon signe.">Rien d&apos;oublié</Vide>}

        <div className="mt-[11px] space-y-[5px]">
          {(liste ?? []).map((o) => {
            const meta = decoderMeta(o.categorie);
            return (
              <div key={o.id} className="carte-haute flex flex-wrap items-center gap-[7px] p-[9px]">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{o.titre}</span>
                {meta.objectif && <Puce>{nomObjectif(meta.objectif)}</Puce>}
                {meta.responsables.map((r) => (
                  <Puce key={r}>{r}</Puce>
                ))}
                <Puce titre="Depuis combien de jours elle dort ici">{o.jours} j</Puce>
                <Bouton onClick={() => void reprendre(o.id)}>Remettre dans la todo</Bouton>
                {confirme === o.id ? (
                  <>
                    <Bouton ton="danger" onClick={() => void effacer(o.id)}>
                      Effacer pour de bon
                    </Bouton>
                    <Bouton onClick={() => setConfirme(null)}>Annuler</Bouton>
                  </>
                ) : (
                  <Bouton ton="danger" onClick={() => setConfirme(o.id)}>
                    Effacer
                  </Bouton>
                )}
              </div>
            );
          })}
        </div>
      </Carte>
    </div>
  );
}
