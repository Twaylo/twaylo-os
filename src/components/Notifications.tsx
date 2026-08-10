"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Le réglage des notifications iPhone.
 *
 * Le point qui piège tout le monde : sur iPhone, les notifications web
 * n'existent QUE pour une application posée sur l'écran d'accueil. Dans un
 * onglet Safari ordinaire, l'API est absente — pas refusée, absente. Un
 * bouton « activer » qui ne ferait rien serait incompréhensible ; on affiche
 * donc la marche à suivre à la place.
 */

type Etat =
  | "chargement"
  | "aInstaller" // iPhone, mais pas encore sur l'écran d'accueil
  | "indisponible" // navigateur qui ne sait pas faire
  | "refuse" // refusé une fois : seul iOS peut revenir dessus
  | "inactif"
  | "actif";

/**
 * La clé publique voyage en base64url ; `subscribe` veut des octets.
 *
 * Le tampon est déclaré explicitement `ArrayBuffer` : un `Uint8Array` peut en
 * théorie s'appuyer sur un `SharedArrayBuffer`, que l'API de notification
 * refuse.
 */
function versOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

function surEcranDAccueil(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS n'implémente pas `display-mode` : il a sa propre propriété.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function Notifications() {
  const [etat, setEtat] = useState<Etat>("chargement");
  const [travail, setTravail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /*
   * L'état est CALCULÉ ici et POSÉ dans le `.then` de l'effet.
   *
   * Ce découpage n'est pas cosmétique : les deux premiers cas se décident
   * sans aucune attente, et les écrire directement reviendrait à appeler
   * setState pendant le corps de l'effet — une cascade de rendus, que la
   * règle `set-state-in-effect` interdit dans ce projet.
   */
  const calculerEtat = useCallback(async (): Promise<Etat> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
      return iphone && !surEcranDAccueil() ? "aInstaller" : "indisponible";
    }
    if (Notification.permission === "denied") return "refuse";
    const registration = await navigator.serviceWorker.ready;
    const abo = await registration.pushManager.getSubscription();
    return abo ? "actif" : "inactif";
  }, []);

  useEffect(() => {
    let vivant = true;
    calculerEtat()
      .then((e) => {
        if (vivant) setEtat(e);
      })
      .catch((err) => {
        console.error("[push] état illisible :", err);
        if (vivant) setEtat("indisponible");
      });
    return () => {
      vivant = false;
    };
  }, [calculerEtat]);

  const activer = useCallback(async () => {
    setTravail(true);
    setMessage(null);
    try {
      // L'autorisation DOIT être demandée depuis un vrai geste : demandée au
      // chargement, iOS la refuse sans rien afficher.
      const accord = await Notification.requestPermission();
      if (accord !== "granted") {
        setEtat(accord === "denied" ? "refuse" : "inactif");
        return;
      }

      const reponse = await fetch("/api/push");
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const { clePublique } = (await reponse.json()) as { clePublique: string };

      const registration = await navigator.serviceWorker.ready;
      const abo = await registration.pushManager.subscribe({
        // Obligatoire : on s'engage à afficher quelque chose à chaque message.
        userVisibleOnly: true,
        applicationServerKey: versOctets(clePublique),
      });

      const enregistre = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(abo.toJSON()),
      });
      if (!enregistre.ok) throw new Error(`HTTP ${enregistre.status}`);

      setEtat("actif");
      setMessage("Activées. Touche « Tester » pour en recevoir une tout de suite.");
    } catch (err) {
      console.error("[push] activation impossible :", err);
      setMessage("Activation impossible. Réessaie dans un instant.");
    } finally {
      setTravail(false);
    }
  }, []);

  const desactiver = useCallback(async () => {
    setTravail(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const abo = await registration.pushManager.getSubscription();
      if (abo) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: abo.endpoint }),
        });
        await abo.unsubscribe();
      }
      setEtat("inactif");
    } catch (err) {
      console.error("[push] désactivation impossible :", err);
      setMessage("Impossible de les couper. Réessaie.");
    } finally {
      setTravail(false);
    }
  }, []);

  const tester = useCallback(async () => {
    setTravail(true);
    setMessage(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; appareils?: number };
      setMessage(
        d.ok
          ? "Envoyée. Elle arrive dans quelques secondes."
          : "Aucun appareil n'a reçu. Coupe puis réactive les notifications.",
      );
    } catch (err) {
      console.error("[push] test impossible :", err);
      setMessage("Le serveur n'a pas répondu.");
    } finally {
      setTravail(false);
    }
  }, []);

  if (etat === "chargement") return null;

  const bloc = (contenu: React.ReactNode) => (
    <div className="mt-[11px] border-t pt-[11px]" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <div className="text-[10px] font-bold tracking-[0.06em] text-white/30">NOTIFICATIONS</div>
      {contenu}
      {message && (
        <div className="mt-[6px] text-[10.5px] font-semibold leading-[1.4] text-white/45">
          {message}
        </div>
      )}
    </div>
  );

  if (etat === "aInstaller") {
    return bloc(
      <div className="mt-[5px] text-[11px] font-semibold leading-[1.45] text-white/50">
        Sur iPhone, elles n&apos;existent que si l&apos;OS est sur ton écran d&apos;accueil.
        Bouton Partager, puis « Sur l&apos;écran d&apos;accueil ».
      </div>,
    );
  }

  if (etat === "indisponible") {
    return bloc(
      <div className="mt-[5px] text-[11px] font-semibold leading-[1.45] text-white/50">
        Ce navigateur ne sait pas les recevoir.
      </div>,
    );
  }

  if (etat === "refuse") {
    return bloc(
      <div className="mt-[5px] text-[11px] font-semibold leading-[1.45] text-white/50">
        Refusées. Réglages iPhone → Twaylo OS → Notifications, puis reviens ici.
      </div>,
    );
  }

  return bloc(
    <div className="mt-[7px] flex gap-[7px]">
      <button
        type="button"
        onClick={etat === "actif" ? desactiver : activer}
        disabled={travail}
        className="min-h-[44px] flex-1 cursor-pointer rounded-[9px] px-[10px] py-[7px] text-[11.5px] font-extrabold transition-all hover:brightness-125 disabled:opacity-50 lg:min-h-0"
        style={
          etat === "actif"
            ? {
                color: "var(--color-mag-soft)",
                background: "rgba(255,61,139,0.12)",
                border: "1px solid rgba(255,61,139,0.25)",
              }
            : {
                color: "var(--color-ver-soft)",
                background: "rgba(61,220,132,0.12)",
                border: "1px solid rgba(61,220,132,0.28)",
              }
        }
      >
        {travail ? "…" : etat === "actif" ? "Couper" : "Activer"}
      </button>
      {etat === "actif" && (
        <button
          type="button"
          onClick={tester}
          disabled={travail}
          className="min-h-[44px] flex-none cursor-pointer rounded-[9px] px-[12px] py-[7px] text-[11.5px] font-extrabold transition-all hover:brightness-125 disabled:opacity-50 lg:min-h-0"
          style={{
            color: "var(--color-cya-soft)",
            background: "rgba(34,211,238,0.1)",
            border: "1px solid rgba(34,211,238,0.25)",
          }}
        >
          Tester
        </button>
      )}
    </div>,
  );
}
