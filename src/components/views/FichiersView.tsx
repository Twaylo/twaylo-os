"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  autorisationOk,
  chercher,
  choisirDossier,
  fileSystemDisponible,
  formaterTaille,
  indexerDossier,
  lireDossiersMemorises,
  oublierDossier,
  type Dossier,
  type FichierIndexe,
} from "@/lib/files";
import { Panel } from "@/components/Panel";
import { ViewHeader } from "@/components/views/ViewHeader";
import { MicButton } from "@/components/ui";

/**
 * FICHIERS — l'OS fouille les dossiers que Twaylo lui a confiés.
 *
 * Limite assumée et affichée : le navigateur n'ouvre que ce qu'on lui
 * désigne. Ce n'est pas « tous les fichiers de l'ordinateur », c'est « tous
 * les fichiers des dossiers autorisés » — et l'écran le dit franchement
 * plutôt que de laisser croire à un accès total.
 */

type EtatDossier = Dossier & {
  autorise: boolean;
  fichiers: FichierIndexe[];
  tronque: boolean;
  indexation: boolean;
};

export function FichiersView() {
  const [dispo, setDispo] = useState<boolean | null>(null);
  const [dossiers, setDossiers] = useState<EtatDossier[]>([]);
  const [requete, setRequete] = useState("");
  const [progression, setProgression] = useState<number | null>(null);

  useEffect(() => {
    setDispo(fileSystemDisponible());
    lireDossiersMemorises().then(async (memorises) => {
      const etats = await Promise.all(
        memorises.map(async (d) => ({
          ...d,
          autorise: await autorisationOk(d.handle),
          fichiers: [] as FichierIndexe[],
          tronque: false,
          indexation: false,
        })),
      );
      setDossiers(etats);
    });
  }, []);

  const indexer = useCallback(async (id: string) => {
    setDossiers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, indexation: true } : d)),
    );

    const cible = (await lireDossiersMemorises()).find((d) => d.id === id);
    if (!cible) return;

    // L'autorisation doit être (re)demandée depuis le clic, pas au chargement.
    if (!(await autorisationOk(cible.handle, true))) {
      setDossiers((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, autorise: false, indexation: false } : d,
        ),
      );
      return;
    }

    try {
      const { fichiers, tronque } = await indexerDossier(cible.handle, {
        onProgress: setProgression,
      });
      setDossiers((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, autorise: true, fichiers, tronque, indexation: false }
            : d,
        ),
      );
    } catch (err) {
      console.error("[fichiers] indexation impossible :", err);
      setDossiers((prev) =>
        prev.map((d) => (d.id === id ? { ...d, indexation: false } : d)),
      );
    } finally {
      setProgression(null);
    }
  }, []);

  async function ajouter() {
    const d = await choisirDossier();
    if (!d) return;
    setDossiers((prev) => [
      ...prev,
      { ...d, autorise: true, fichiers: [], tronque: false, indexation: false },
    ]);
    void indexer(d.id);
  }

  async function retirer(id: string) {
    await oublierDossier(id);
    setDossiers((prev) => prev.filter((d) => d.id !== id));
  }

  const tousFichiers = useMemo(
    () => dossiers.flatMap((d) => d.fichiers),
    [dossiers],
  );

  const resultats = useMemo(
    () => chercher(tousFichiers, requete),
    [tousFichiers, requete],
  );

  const totalIndexe = tousFichiers.length;
  const avecContenu = tousFichiers.filter((f) => f.contenu).length;

  if (dispo === false) {
    return (
      <>
        <ViewHeader title="Fichiers" subtitle="Indisponible sur ce navigateur" />
        <Panel accent="var(--color-mag)" size="sm">
          <p className="text-[13px] leading-[1.6] text-white/70">
            Ton navigateur ne permet pas à une page d&apos;ouvrir un dossier.
            Seuls <strong>Chrome</strong> et <strong>Edge</strong> le font
            aujourd&apos;hui — Firefox et Safari ne l&apos;implémentent pas.
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <ViewHeader
        title="Fichiers"
        subtitle={
          totalIndexe > 0
            ? `${totalIndexe} fichiers indexés · ${avecContenu} cherchables au contenu`
            : "Aucun dossier autorisé"
        }
        action={
          <button
            type="button"
            onClick={ajouter}
            className="cursor-pointer rounded-[10px] border-none px-[14px] py-[8px] text-[13px] font-extrabold text-[#07121d] transition-all hover:brightness-110"
            style={{ background: "var(--grad)" }}
          >
            + Autoriser un dossier
          </button>
        }
      />

      {/* La limite, dite d'emblée plutôt que découverte à l'usage. */}
      <Panel accent="var(--color-ble)" size="sm" className="mb-[14px]">
        <p className="text-[12.5px] leading-[1.6] text-white/60">
          Une page web ne peut pas lire ton disque librement — c&apos;est une
          protection du navigateur, pas un manque de l&apos;app. Elle lit{" "}
          <strong className="text-white/85">
            uniquement les dossiers que tu lui confies
          </strong>
          . Autorise « Rushes », « Scripts », « Miniatures » une fois :
          l&apos;autorisation survit au rechargement.
        </p>
      </Panel>

      <div className="mb-[14px] flex flex-col gap-2">
        {dossiers.length === 0 && (
          <Panel accent="var(--color-vio)" size="sm">
            <div className="py-4 text-center">
              <div className="text-[13px] font-bold text-white/50">
                Aucun dossier autorisé pour l&apos;instant
              </div>
              <div className="mt-1 text-[11.5px] text-white/30">
                Commence par tes scripts ou tes notes de tournage.
              </div>
            </div>
          </Panel>
        )}

        {dossiers.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-3 rounded-[12px] px-4 py-[11px]"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <span
              className="h-[8px] w-[8px] flex-none rounded-full"
              style={{
                background: d.autorise ? "var(--color-ver)" : "var(--color-amb)",
              }}
            />
            <span className="text-[13.5px] font-extrabold">{d.nom}</span>
            <span className="font-mono text-[11px] text-white/40">
              {d.indexation
                ? `indexation… ${progression ?? 0}`
                : d.fichiers.length > 0
                  ? `${d.fichiers.length} fichiers${d.tronque ? " (tronqué)" : ""}`
                  : d.autorise
                    ? "pas encore indexé"
                    : "autorisation à renouveler"}
            </span>

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => indexer(d.id)}
                disabled={d.indexation}
                className="cursor-pointer rounded-[8px] px-3 py-[6px] text-[11px] font-extrabold transition-all hover:brightness-125 disabled:opacity-40"
                style={{
                  color: "var(--color-cya-soft)",
                  background: "rgba(34,211,238,0.1)",
                  border: "1px solid rgba(34,211,238,0.25)",
                }}
              >
                {d.fichiers.length > 0 ? "Réindexer" : "Indexer"}
              </button>
              <button
                type="button"
                onClick={() => retirer(d.id)}
                className="cursor-pointer rounded-[8px] px-3 py-[6px] text-[11px] font-extrabold transition-all hover:brightness-125"
                style={{
                  color: "var(--color-mag-soft)",
                  background: "rgba(255,61,139,0.1)",
                  border: "1px solid rgba(255,61,139,0.25)",
                }}
              >
                Retirer
              </button>
            </div>
          </div>
        ))}
      </div>

      {totalIndexe > 0 && (
        <>
          <div className="mb-[14px] flex items-center gap-2">
            <input
              value={requete}
              onChange={(e) => setRequete(e.target.value)}
              placeholder="Cherche un nom de fichier ou un mot dans le texte…"
              aria-label="Recherche dans les fichiers"
              className="min-w-0 flex-1 rounded-[12px] px-4 py-[11px] text-[14px] font-semibold text-white outline-none transition-colors focus:border-white/25"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <MicButton
              onTranscript={(t) => setRequete((p) => (p ? `${p} ${t}` : t))}
            />
          </div>

          {requete.trim() && (
            <Panel accent="var(--color-cya)" size="sm">
              <div className="mb-[10px] text-[10.5px] font-extrabold tracking-[0.12em] text-white/40">
                {resultats.length} RÉSULTAT{resultats.length > 1 ? "S" : ""}
              </div>

              {resultats.length === 0 ? (
                <div className="py-4 text-center text-[12.5px] text-white/30">
                  Rien trouvé dans les dossiers indexés.
                </div>
              ) : (
                <div className="flex flex-col gap-[6px]">
                  {resultats.map((r) => (
                    <div
                      key={r.fichier.chemin}
                      className="rounded-[10px] px-3 py-[9px]"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-bold">
                          {r.fichier.nom}
                        </span>
                        <span className="flex-none font-mono text-[10px] text-white/30">
                          {formaterTaille(r.fichier.taille)}
                        </span>
                      </div>
                      <div className="truncate font-mono text-[10.5px] text-white/35">
                        {r.fichier.chemin}
                      </div>
                      {r.extrait && (
                        <div className="mt-[5px] text-[11.5px] leading-[1.45] text-white/55">
                          {r.extrait}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
