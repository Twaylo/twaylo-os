"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { localDateKey } from "./local-date";
import { readJSON, writeJSON } from "./storage";
import {
  decoderMeta,
  decoderOp,
  encoderMeta,
  encoderOp,
  etapeDepuisDB,
  blocDepuisUrgence,
  patchColonne,
  type ColonneKanban,
  type EtapeOp,
  type IdBloc,
  type IdObjectif,
  type MetaOp,
  type MetaTache,
  type Op,
  type TacheP90,
} from "./p90";

/**
 * L'ÉTAT DU COCKPIT, côté navigateur.
 *
 * Il remplace un contexte de 2 863 lignes qui portait treize onglets. Ici
 * trois listes — les tâches, les OP, les objectifs — et les gestes qui les
 * modifient. Rien d'autre.
 *
 * Trois principes, tous appris à la dure sur la version précédente :
 *
 * 1. LE GESTE D'ABORD. L'écran répond immédiatement, l'écriture part ensuite.
 *    Sur une 4G de terrain, attendre la base avant de cocher une case donne
 *    une interface qui colle.
 *
 * 2. UN ÉCHEC NE DISPARAÎT JAMAIS EN SILENCE. Quand l'écriture échoue, l'état
 *    local revient en arrière ET un message le dit. La version précédente
 *    supprimait la tâche qu'elle venait d'ajouter : on tapait « post snap »,
 *    la ligne s'affichait, puis s'évaporait sans un mot.
 *
 * 3. LA DERNIÈRE LISTE CONNUE EST REPEINTE TOUT DE SUITE, depuis le stockage
 *    local, avant même la première réponse du serveur — sinon l'écran reste
 *    vide le temps qu'une fonction serverless sorte de veille, plusieurs
 *    secondes au premier chargement de la journée.
 *
 * 4. L'ÉCRAN SE RELIT TOUT SEUL. Twaylo travaille sur deux appareils : il
 *    coche sur le Mac, il regarde son téléphone. Tant que la liste n'était
 *    lue qu'une fois, au chargement, le second écran montrait l'état d'il y a
 *    une heure et il fallait rafraîchir à la main pour voir la vérité. La
 *    base est donc relue en boucle — court quand ça bouge, long quand ça
 *    dort, et immédiatement au retour sur l'écran.
 */

const CLE_CACHE = "twaylo-p90-cache";

/**
 * Ce qu'une lecture de la base a rapporté.
 *
 * `differe` mérite son nom : la réponse est bien arrivée, mais un geste local
 * l'a précédée de peu — on l'écarte, et on relit tout de suite après plutôt
 * que d'attendre le battement suivant.
 */
type Verdict = "change" | "inchange" | "differe" | "echec";

/* ------------------------------------------------------------------ */
/* Les formes affichées                                                */
/* ------------------------------------------------------------------ */

/** Une tâche telle que l'écran la manipule : meta décodée, statut déplié. */
export type TacheVue = TacheP90 & {
  statut: string;
  gelee: boolean;
  creeLe?: string;
  faiteLe?: string;
};

export type ObjectifVue = {
  cle: IdObjectif;
  /** La valeur atteinte, telle que saisie (texte libre : « 412 000 »). */
  valeur: string;
  jalons: { texte: string; fait: boolean }[];
};

/** Ce que le réseau renvoie, avant décodage. */
type TacheReseau = {
  id: string;
  titre: string;
  statut: string;
  urgence: string;
  categorie: string | null;
  gelee?: boolean;
  creeLe?: string;
  faiteLe?: string;
};

type OpReseau = { id: string; nom: string; etape: string; montant: number | null; note: string | null };
type ObjectifReseau = { cle: string; valeur: string; jalons: { texte: string; fait: boolean }[] };

type EtatReseau = {
  connecte: boolean;
  taches?: TacheReseau[];
  ops?: OpReseau[];
  objectifs?: ObjectifReseau[];
};

function versTacheVue(t: TacheReseau): TacheVue {
  return {
    id: t.id,
    titre: t.titre,
    statut: t.statut,
    faite: t.statut === "faite",
    enCours: t.statut === "en_cours",
    bloc: blocDepuisUrgence(t.urgence),
    meta: decoderMeta(t.categorie),
    gelee: Boolean(t.gelee),
    creeLe: t.creeLe,
    faiteLe: t.faiteLe,
  };
}

function versOp(o: OpReseau): Op {
  const meta = decoderOp(o.note);
  return {
    id: o.id,
    marque: o.nom,
    brut: typeof o.montant === "number" ? o.montant : 0,
    etape: etapeDepuisDB(o.etape, meta.facture, meta.paye),
    meta,
  };
}

/* ------------------------------------------------------------------ */
/* Le contexte                                                         */
/* ------------------------------------------------------------------ */

type Cockpit = {
  /** Le jour local, qui change à minuit sans recharger la page. */
  aujourdhui: string;
  taches: TacheVue[];
  ops: Op[];
  objectifs: ObjectifVue[];
  /** Faux tant que la base n'a pas répondu : interdit d'en tirer un calcul. */
  pret: boolean;
  /** Le dernier geste qui a échoué, à afficher tel quel. */
  echec: string | null;
  oublierEchec: () => void;
  etatReseau: "inconnu" | "connecte" | "hors_ligne";

  ajouterTache: (titre: string, meta?: Partial<MetaTache>, bloc?: IdBloc) => Promise<boolean>;
  modifierTache: (
    id: string,
    patch: { titre?: string; meta?: MetaTache; bloc?: IdBloc; statut?: string },
  ) => Promise<boolean>;
  basculerFaite: (id: string) => Promise<boolean>;
  deplacerColonne: (id: string, colonne: ColonneKanban) => Promise<boolean>;
  reordonner: (ordre: string[], bloc?: { id: string; bloc: IdBloc }) => Promise<boolean>;
  supprimerTache: (id: string) => Promise<boolean>;
  basculerGel: (id: string) => Promise<boolean>;
  cloturer: () => Promise<boolean>;

  ajouterOp: (nom: string) => Promise<boolean>;
  modifierOp: (
    id: string,
    patch: { nom?: string; brut?: number; etape?: EtapeOp; meta?: MetaOp },
  ) => Promise<boolean>;
  supprimerOp: (id: string) => Promise<boolean>;

  modifierObjectif: (cle: IdObjectif, patch: { valeur?: string; jalons?: ObjectifVue["jalons"] }) => Promise<boolean>;

  /** Relit tout depuis la base — après une reprise d'oublié, par exemple. */
  recharger: () => Promise<void>;

  /** L'instant de la dernière lecture réussie (ms), 0 avant la première. */
  derniereLecture: number;
  /**
   * Compté à chaque fois qu'une lecture rapporte un changement venu D'AILLEURS
   * — de l'autre appareil, jamais du geste qu'on vient de faire. Le bandeau
   * s'en sert pour le dire d'un clin d'œil.
   */
  sursauts: number;
  /**
   * Suspend la relecture automatique le temps d'un geste, par nom de verrou.
   * À poser pendant un glisser-déposer : la liste ne doit pas changer sous le
   * doigt.
   */
  verrouSync: (nom: string, actif: boolean) => void;
};

const CockpitContext = createContext<Cockpit | null>(null);

export function useCockpit(): Cockpit {
  const ctx = useContext(CockpitContext);
  if (!ctx) throw new Error("useCockpit hors de <CockpitProvider>");
  return ctx;
}

export function CockpitProvider({ children }: { children: ReactNode }) {
  const [aujourdhui, setAujourdhui] = useState(() => localDateKey());
  const [taches, setTaches] = useState<TacheVue[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [objectifs, setObjectifs] = useState<ObjectifVue[]>([]);
  const [pret, setPret] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const [etatReseau, setEtatReseau] = useState<"inconnu" | "connecte" | "hors_ligne">("inconnu");
  const [derniereLecture, setDerniereLecture] = useState(0);
  const [sursauts, setSursauts] = useState(0);

  const oublierEchec = useCallback(() => setEchec(null), []);

  /*
   * DE QUOI SAVOIR SI UNE RÉPONSE A LE DROIT DE S'APPLIQUER.
   *
   * Une réponse serveur partie AVANT un geste ne doit pas écraser ce geste :
   * cocher une case pendant que la liste se recharge ferait réapparaître la
   * case décochée une seconde plus tard — le geste « ne marche pas », alors
   * qu'il a bien été enregistré.
   *
   * CE QUI ÉTAIT LÀ AVANT : un simple drapeau « touché », levé au premier
   * geste et plus jamais rabaissé. Il protégeait le geste, mais il coupait du
   * même coup toute relecture pour le reste de la session — une seule case
   * cochée le matin figeait l'écran jusqu'au rafraîchissement suivant. C'est
   * exactement ce qui empêchait la todo de se mettre à jour toute seule.
   *
   * À la place, deux mesures et une question précise : « une écriture a-t-elle
   * eu lieu DEPUIS QUE CETTE REQUÊTE EST PARTIE ? » Sinon, la réponse est
   * fraîche et s'applique.
   */
  /** Écritures en cours. */
  const enVol = useRef(0);
  /** L'instant de la dernière écriture, début comme fin. */
  const dernierEcrit = useRef(0);
  /**
   * A-t-on écrit depuis la dernière liste appliquée ?
   *
   * C'est ce qui permet de dire si un changement vient d'AILLEURS ou de soi,
   * et de ne faire clignoter le bandeau que dans le premier cas. Une fenêtre
   * de temps (« moins de cinq secondes, c'est nous ») ne marchait pas : entre
   * le geste et la lecture qui le rapporte, il s'écoule une lecture écartée
   * PLUS un battement, soit facilement plus que la fenêtre — et la pastille
   * annonçait « À JOUR » pour une case qu'on venait de cocher soi-même.
   */
  const ecritDepuisLecture = useRef(false);
  /** L'empreinte de la dernière liste reçue : de quoi obtenir un 304. */
  const empreinte = useRef("");
  /** Le JSON de la dernière liste reçue : a-t-elle vraiment changé ? */
  const derniereCharge = useRef("");
  /** Les gestes qui suspendent la relecture, par nom. */
  const verrous = useRef(new Set<string>());

  /**
   * Suspendre la relecture le temps d'un geste, et la reprendre après.
   *
   * Un verrou porte un nom : posé deux fois il ne compte qu'une fois, et un
   * composant démonté en plein geste ne laisse pas la relecture coupée pour
   * toujours.
   *
   * Le cas qui l'impose, c'est le glisser-déposer. La liste se réordonne sous
   * le doigt à chaque frame ; une liste descendue de la base au milieu de ça
   * remplacerait les lignes en cours de déplacement, et le doigt tiendrait un
   * nœud qui n'existe plus.
   */
  const verrouSync = useCallback((nom: string, actif: boolean) => {
    if (actif) verrous.current.add(nom);
    else verrous.current.delete(nom);
  }, []);

  /* ---------- Le jour courant, qui avance tout seul ---------- */
  useEffect(() => {
    const verifier = () => {
      const jour = localDateKey();
      setAujourdhui((prec) => (prec === jour ? prec : jour));
    };
    // Une minute : assez fin pour que minuit se voie, assez rare pour ne rien
    // coûter. Et au retour sur l'onglet, où un téléphone a pu dormir 10 heures.
    const horloge = window.setInterval(verifier, 60_000);
    document.addEventListener("visibilitychange", verifier);
    return () => {
      window.clearInterval(horloge);
      document.removeEventListener("visibilitychange", verifier);
    };
  }, []);

  /* ---------- Repeindre depuis le cache, avant toute requête ---------- */

  /*
   * Dans une micro-tâche, et pas dans le corps de l'effet.
   *
   * Deux raisons, et elles vont dans le même sens. D'abord la règle
   * `react-hooks/set-state-in-effect` : un `setState` synchrone dans un effet
   * déclenche une cascade de rendus, et le compilateur React le refuse.
   * Ensuite la lecture du stockage local ne peut pas se faire pendant le rendu
   * — le serveur n'y a pas accès, et React rejetterait l'hydratation en
   * voyant deux arbres différents.
   *
   * Une micro-tâche s'exécute AVANT la première peinture : l'écran ne
   * clignote pas, la dernière liste connue est là tout de suite.
   */
  useEffect(() => {
    let annule = false;
    queueMicrotask(() => {
      if (annule) return;
      const cache = readJSON<EtatReseau | null>(CLE_CACHE, null);
      if (!cache) return;
      if (cache.taches) setTaches(cache.taches.map(versTacheVue));
      if (cache.ops) setOps(cache.ops.map(versOp));
      if (cache.objectifs) setObjectifs(cache.objectifs.map(versObjectifVue));
    });
    return () => {
      annule = true;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* LA LECTURE, ET LE BATTEMENT QUI LA REJOUE                           */
  /* ------------------------------------------------------------------ */

  const charger = useCallback(async (): Promise<Verdict> => {
    // L'heure de départ de la requête : c'est à elle qu'on comparera la
    // dernière écriture pour savoir si la réponse est encore d'actualité.
    const debut = Date.now();
    try {
      const res = await fetch("/api/p90", {
        cache: "no-store",
        /*
         * L'empreinte de ce qu'on a déjà.
         *
         * Le serveur répond 304 — rien du tout — si la liste n'a pas changé.
         * C'est ce qui rend la relecture en boucle acceptable : sur le forfait
         * du téléphone, relire dix kilo-octets de JSON identique toutes les
         * dix secondes ferait des mégaoctets par heure d'écran allumé.
         */
        headers: empreinte.current ? { "if-none-match": empreinte.current } : undefined,
      });

      if (res.status === 304) {
        setEtatReseau("connecte");
        setDerniereLecture(Date.now());
        setPret(true);
        return "inchange";
      }

      /*
       * 401 : la session a expiré. On va à la porte, tout de suite.
       *
       * C'est un cas que la relecture vivante fait apparaître : la page vit
       * désormais des jours sans être rechargée, et c'est donc ELLE qui
       * rencontre l'expiration au bout d'une semaine. Sans ce renvoi, l'écran
       * resterait indéfiniment sur « HORS LIGNE » avec la liste de la semaine
       * dernière — alors que la seule chose à faire est de retaper le mot de
       * passe, et qu'on peut l'y mener sans rien lui demander.
       */
      if (res.status === 401) {
        window.location.href = "/login";
        return "echec";
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      /*
       * Le texte brut, et pas directement l'objet.
       *
       * Il sert deux fois : à décoder, et à répondre à « est-ce que ça a
       * changé ? » par une comparaison de chaînes. C'est la ceinture du 304 :
       * si un navigateur, un proxy d'entreprise ou un mode économiseur de
       * données mangeait la requête conditionnelle, l'écran ne se repeindrait
       * toujours pas pour rien.
       */
      const brut = await res.text();
      const data = JSON.parse(brut) as EtatReseau;
      setEtatReseau(data.connecte ? "connecte" : "hors_ligne");
      if (!data.connecte) return "echec";

      /*
       * Un geste a eu lieu depuis le départ de la requête : on jette.
       *
       * Et on ne retient NI l'empreinte NI le cache. Retenir l'empreinte
       * d'une réponse écartée ferait répondre 304 à la lecture suivante : le
       * changement venu de l'autre écran, qui voyageait dans cette réponse,
       * n'arriverait jamais.
       */
      if (enVol.current > 0 || dernierEcrit.current >= debut) return "differe";

      // La toute première liste de la session : elle n'a rien à quoi être
      // comparée, et son arrivée n'est pas un changement — c'est le
      // chargement. Sans cette distinction, la pastille annonçait « À JOUR »
      // à chaque ouverture de l'OS, pour une liste que personne n'avait
      // touchée.
      const premiere = derniereCharge.current === "";
      const nouveau = brut !== derniereCharge.current;
      empreinte.current = res.headers.get("etag") ?? "";
      derniereCharge.current = brut;
      writeJSON(CLE_CACHE, data);

      if (nouveau) {
        if (data.taches) setTaches(data.taches.map(versTacheVue));
        if (data.ops) setOps(data.ops.map(versOp));
        if (data.objectifs) setObjectifs(data.objectifs.map(versObjectifVue));
      }
      setDerniereLecture(Date.now());
      // `pret` passe à vrai même sans changement : la base a répondu, les
      // calculs de l'écran peuvent se faire.
      setPret(true);

      /*
       * Le sursaut ne compte que ce qui vient D'AILLEURS.
       *
       * Après une écriture, la lecture suivante rapporte forcément du nouveau
       * — le geste qu'on vient de faire. L'annoncer ferait clignoter le bandeau
       * à chaque case cochée, et le signal ne voudrait plus rien dire.
       *
       * On est donc prudent dans ce sens-là : si une écriture a eu lieu depuis
       * la dernière liste appliquée, le changement lui est attribué, même s'il
       * portait aussi quelque chose de l'autre écran. Jamais de faux signal,
       * quitte à en taire un vrai une fois.
       */
      const notre = ecritDepuisLecture.current;
      ecritDepuisLecture.current = false;
      if (nouveau && !notre && !premiere) setSursauts((n) => n + 1);
      return nouveau ? "change" : "inchange";
    } catch (err) {
      console.error("[p90] chargement impossible :", err);
      setEtatReseau("hors_ligne");
      return "echec";
    }
  }, []);

  /*
   * LE BATTEMENT.
   *
   * Pourquoi un battement et non une liaison ouverte en permanence : une
   * poussée du serveur (SSE, websocket) donnerait la seconde près, mais elle
   * tient une fonction serverless ouverte en continu, et iOS la coupe dès que
   * l'application passe en arrière-plan — au retour il faudrait de toute
   * façon tout relire. Un battement court quand ça bouge, long quand ça dort,
   * plus une relecture immédiate au retour sur l'écran, donne le même
   * résultat vu de l'écran sans rien de tout cela.
   *
   * Trois cadences, parce qu'un rythme unique est soit trop lent quand on
   * travaille, soit trop bavard quand l'onglet est oublié devant un café :
   *   — 4 s dans la minute qui suit un changement : on coche en série, et
   *     l'autre écran doit suivre tout de suite ;
   *   — 10 s en temps normal ;
   *   — 30 s après cinq minutes sans rien.
   *
   * ÉCRAN CACHÉ : aucune requête, pas une seule. Un téléphone dans la poche ne
   * consomme rien, et son réveil déclenche de toute façon une relecture.
   */
  useEffect(() => {
    let annule = false;
    let minuteur = 0;
    let enCours = false;
    let dernierChangement = Date.now();
    let dernierDepart = 0;

    const prochain = () => {
      if (annule) return;
      const calme = Date.now() - dernierChangement;
      const delai = calme < 60_000 ? 4_000 : calme < 300_000 ? 10_000 : 30_000;
      minuteur = window.setTimeout(() => void battre(), delai);
    };

    const battre = async () => {
      // Jamais deux lectures en vol : un réveil tombé pendant une lecture est
      // sans objet, celle qui est en cours est déjà aussi fraîche.
      if (annule || enCours) return;
      if (document.visibilityState === "hidden" || verrous.current.size > 0) {
        prochain();
        return;
      }
      enCours = true;
      dernierDepart = Date.now();
      let verdict: Verdict = "echec";
      try {
        verdict = await charger();
      } finally {
        enCours = false;
      }
      // Une réponse écartée vaut un changement : on repasse vite.
      if (verdict === "change" || verdict === "differe") dernierChangement = Date.now();
      prochain();
    };

    /*
     * LE RETOUR SUR L'ÉCRAN : on relit sans attendre.
     *
     * C'est le cas qui obligeait à rafraîchir à la main. Un téléphone qui dort
     * gèle ses minuteries : au réveil, la liste affichée pouvait avoir dix
     * heures. Quatre évènements disent « l'écran revient », selon le
     * navigateur et le mode — onglet, application posée sur l'écran d'accueil,
     * retour arrière iOS. On écoute les quatre plutôt que de parier sur un.
     */
    const reveil = (evt?: Event) => {
      if (annule || document.visibilityState === "hidden") return;
      /*
       * `pageshow` au chargement normal : il n'y a rien à rattraper, la
       * première lecture vient de partir. Seule la restauration depuis le cache
       * de navigation (`persisted`) mérite une relecture — c'est le retour
       * arrière d'iOS, qui rend une page figée telle qu'elle était.
       */
      if (evt && "persisted" in evt && evt.persisted === false) return;
      // Deux évènements de retour se suivent souvent (visibilité PUIS focus) :
      // une seule lecture suffit.
      if (Date.now() - dernierDepart < 1_000) return;
      window.clearTimeout(minuteur);
      dernierChangement = Date.now();
      void battre();
    };

    // La première lecture part tout de suite, dans une micro-tâche : un
    // `setState` synchrone dans un corps d'effet est une cascade de rendus.
    queueMicrotask(() => void battre());

    document.addEventListener("visibilitychange", reveil);
    window.addEventListener("focus", reveil);
    window.addEventListener("online", reveil);
    window.addEventListener("pageshow", reveil);
    return () => {
      annule = true;
      window.clearTimeout(minuteur);
      document.removeEventListener("visibilitychange", reveil);
      window.removeEventListener("focus", reveil);
      window.removeEventListener("online", reveil);
      window.removeEventListener("pageshow", reveil);
    };
  }, [charger]);

  /** Relecture complète, à la demande : l'empreinte est oubliée exprès. */
  const recharger = useCallback(async () => {
    empreinte.current = "";
    await charger();
  }, [charger]);

  /* ------------------------------------------------------------------ */
  /* L'écriture : optimiste, et jamais muette                            */
  /* ------------------------------------------------------------------ */

  /**
   * Envoie une écriture et dit si elle a tenu.
   *
   * Le `persiste: false` du serveur (base non configurée) compte comme un
   * échec : l'écran ne doit pas montrer comme enregistré ce qui n'existe que
   * dans l'onglet ouvert.
   */
  const envoyer = useCallback(
    async (
      chemin: string,
      methode: "POST" | "PATCH" | "DELETE",
      corps?: unknown,
    ): Promise<Record<string, unknown> | null> => {
      /*
       * L'écriture se signale, avant et après.
       *
       * C'est ce qui protège le geste de la relecture automatique : toute
       * réponse de lecture partie avant cet instant sera écartée.
       */
      enVol.current += 1;
      dernierEcrit.current = Date.now();
      ecritDepuisLecture.current = true;
      try {
        const res = await fetch(chemin, {
          method: methode,
          ...(corps === undefined
            ? {}
            : { headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Record<string, unknown>;
        if (data.persiste === false) throw new Error("non persisté");
        setEtatReseau("connecte");
        return data;
      } catch (err) {
        console.error(`[p90] ${methode} ${chemin} impossible :`, err);
        return null;
      } finally {
        enVol.current -= 1;
        dernierEcrit.current = Date.now();
      }
    },
    [],
  );

  const ajouterTache = useCallback(
    async (titre: string, meta?: Partial<MetaTache>, bloc?: IdBloc) => {
      const propre = titre.trim();
      if (!propre) return false;

      const complete: MetaTache = {
        responsables: [],
        impact: 2,
        bloque: false,
        ...meta,
      };

      /*
       * Une ligne provisoire s'affiche tout de suite, avec un identifiant
       * temporaire reconnaissable. Elle est remplacée par la vraie dès la
       * réponse — et RETIRÉE avec un message si l'écriture échoue, au lieu de
       * rester là à faire croire qu'elle est enregistrée.
       */
      const cleTemp = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const provisoire: TacheVue = {
        id: cleTemp,
        titre: propre,
        statut: "ouverte",
        faite: false,
        enCours: false,
        bloc: bloc ?? "operations",
        meta: complete,
        gelee: false,
        creeLe: localDateKey(),
      };
      setTaches((prec) => [provisoire, ...prec]);

      const data = await envoyer("/api/p90/taches", "POST", {
        titre: propre,
        meta: encoderMeta(complete),
        bloc: bloc,
      });

      if (!data?.tache) {
        setTaches((prec) => prec.filter((t) => t.id !== cleTemp));
        setEchec(`« ${propre} » n'a pas pu être enregistrée. Le texte est conservé, réessaie.`);
        return false;
      }

      const vraie = versTacheVue(data.tache as TacheReseau);
      setTaches((prec) => prec.map((t) => (t.id === cleTemp ? vraie : t)));
      return true;
    },
    [envoyer],
  );

  const modifierTache = useCallback(
    async (
      id: string,
      patch: { titre?: string; meta?: MetaTache; bloc?: IdBloc; statut?: string },
    ) => {
      const avant = taches;
      setTaches((prec) =>
        prec.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                ...(patch.titre !== undefined ? { titre: patch.titre } : {}),
                ...(patch.meta !== undefined ? { meta: patch.meta } : {}),
                ...(patch.bloc !== undefined ? { bloc: patch.bloc } : {}),
                ...(patch.statut !== undefined
                  ? {
                      statut: patch.statut,
                      faite: patch.statut === "faite",
                      enCours: patch.statut === "en_cours",
                      faiteLe: patch.statut === "faite" ? localDateKey() : undefined,
                    }
                  : {}),
              },
        ),
      );

      const data = await envoyer("/api/p90/taches", "PATCH", {
        id,
        ...(patch.titre !== undefined ? { titre: patch.titre } : {}),
        ...(patch.meta !== undefined ? { meta: encoderMeta(patch.meta) } : {}),
        ...(patch.bloc !== undefined ? { bloc: patch.bloc } : {}),
        ...(patch.statut !== undefined ? { statut: patch.statut } : {}),
      });

      if (!data) {
        setTaches(avant);
        setEchec("La modification n'a pas pu être enregistrée. Rien n'a changé en base.");
        return false;
      }
      return true;
    },
    [envoyer, taches],
  );

  const basculerFaite = useCallback(
    async (id: string) => {
      const t = taches.find((x) => x.id === id);
      if (!t) return false;
      return modifierTache(id, { statut: t.faite ? "ouverte" : "faite" });
    },
    [modifierTache, taches],
  );

  /**
   * Déplacer une carte du Kanban : UNE écriture pour deux champs.
   *
   * La colonne « Bloqué » n'est pas un statut (la contrainte de la table n'en
   * accepte que quatre, tous pris) mais un drapeau dans la meta. Passer une
   * carte de « Bloqué » à « En cours » change donc les deux — et en deux appels
   * séparés, le second pouvait échouer en laissant la carte dans un état qui
   * n'existe nulle part.
   */
  const deplacerColonne = useCallback(
    async (id: string, colonne: ColonneKanban) => {
      const t = taches.find((x) => x.id === id);
      if (!t) return false;
      const { statut, bloque } = patchColonne(colonne);
      if (t.statut === statut && t.meta.bloque === bloque) return true;
      return modifierTache(id, { statut, meta: { ...t.meta, bloque } });
    },
    [modifierTache, taches],
  );

  /**
   * Un dépôt de glisser-déposer : l'ordre complet, et le bloc s'il a changé.
   *
   * Les deux partent dans la même séquence et l'état local est posé une seule
   * fois : sinon la ligne sautait de place pendant la fraction de seconde où
   * l'ordre était écrit mais pas encore le bloc.
   */
  const reordonner = useCallback(
    async (ordre: string[], bloc?: { id: string; bloc: IdBloc }) => {
      const avant = taches;

      const rang = new Map(ordre.map((x, i) => [x, i]));
      setTaches((prec) => {
        const suivantes = prec.map((t) =>
          bloc && t.id === bloc.id ? { ...t, bloc: bloc.bloc } : t,
        );
        return [...suivantes].sort(
          (a, b) =>
            (rang.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rang.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
      });

      const ecritures: Promise<unknown>[] = [envoyer("/api/p90/taches", "PATCH", { ordre })];
      if (bloc) {
        ecritures.push(envoyer("/api/p90/taches", "PATCH", { id: bloc.id, bloc: bloc.bloc }));
      }
      const resultats = await Promise.all(ecritures);

      if (resultats.some((r) => r === null)) {
        setTaches(avant);
        setEchec("Le déplacement n'a pas pu être enregistré. La liste revient comme elle était.");
        return false;
      }
      return true;
    },
    [envoyer, taches],
  );

  /**
   * Supprimer = archiver. La tâche part aux Oubliés, d'où un geste la ramène.
   *
   * C'est volontaire et c'est le filet : sur une liste de vingt lignes, un clic
   * de travers ne doit pas détruire ce qui était écrit.
   */
  const supprimerTache = useCallback(
    async (id: string) => {
      const avant = taches;
      setTaches((prec) => prec.filter((t) => t.id !== id));

      const data = await envoyer(`/api/p90/taches?id=${encodeURIComponent(id)}`, "DELETE");
      if (!data) {
        setTaches(avant);
        setEchec("La suppression n'a pas pu être enregistrée. La tâche est toujours là.");
        return false;
      }
      return true;
    },
    [envoyer, taches],
  );

  const basculerGel = useCallback(
    async (id: string) => {
      const avant = taches;
      const t = taches.find((x) => x.id === id);
      if (!t) return false;
      setTaches((prec) => prec.map((x) => (x.id === id ? { ...x, gelee: !x.gelee } : x)));

      const data = await envoyer("/api/p90/taches", "PATCH", { id, gelee: !t.gelee });
      if (!data) {
        setTaches(avant);
        setEchec("Le gel n'a pas pu être enregistré.");
        return false;
      }
      return true;
    },
    [envoyer, taches],
  );

  /**
   * La clôture : les tâches cochées s'en vont, les gelées restent décochées.
   *
   * L'ordre compte. Décocher les gelées AVANT l'effacement : l'effacement
   * porte sur « tout ce qui est coché », et une gelée cochée partirait avec le
   * reste — c'est-à-dire que « poster sur Snap » disparaîtrait justement le
   * soir où il a été fait.
   */
  const cloturer = useCallback(async () => {
    /*
     * Sous verrou du début à la fin, et ce n'est pas par précaution.
     *
     * La clôture est une SUITE d'écritures : dégeler chaque gelée, puis
     * effacer tout ce qui est coché. Entre deux, la base est dans un état
     * intermédiaire que personne ne doit voir — une relecture tombée au milieu
     * repeindrait l'écran avec les gelées déjà décochées et les cochées encore
     * là, c'est-à-dire la liste de personne.
     */
    verrous.current.add("cloture");
    try {
      const aDegeler = taches.filter((t) => t.faite && t.gelee);
      const partantes = taches.filter((t) => t.faite && !t.gelee).map((t) => t.id);
      if (aDegeler.length === 0 && partantes.length === 0) return true;

      const avant = taches;
      setTaches((prec) =>
        prec
          .filter((t) => !(t.faite && !t.gelee))
          .map((t) => (t.faite && t.gelee ? { ...t, faite: false, statut: "ouverte", faiteLe: undefined } : t)),
      );

      for (const t of aDegeler) {
        const data = await envoyer("/api/p90/taches", "PATCH", { id: t.id, statut: "ouverte" });
        if (!data) {
          setTaches(avant);
          setEchec("Le dégel n'a pas pu être enregistré : rien n'a été supprimé.");
          return false;
        }
      }

      if (partantes.length > 0) {
        const data = await envoyer("/api/p90/taches?faites=1", "DELETE");
        if (!data) {
          setTaches(avant);
          setEchec("La clôture n'a pas pu être enregistrée.");
          return false;
        }
      }
      return true;
    } finally {
      verrous.current.delete("cloture");
    }
  }, [envoyer, taches]);

  /* ---------- Les OP ---------- */

  const ajouterOp = useCallback(
    async (nom: string) => {
      const propre = nom.trim();
      if (!propre) return false;
      const data = await envoyer("/api/p90/ops", "POST", { nom: propre });
      if (!data?.op) {
        setEchec(`L'OP « ${propre} » n'a pas pu être créée.`);
        return false;
      }
      setOps((prec) => [...prec, versOp(data.op as OpReseau)]);
      return true;
    },
    [envoyer],
  );

  const modifierOp = useCallback(
    async (id: string, patch: { nom?: string; brut?: number; etape?: EtapeOp; meta?: MetaOp }) => {
      const avant = ops;
      setOps((prec) =>
        prec.map((o) =>
          o.id !== id
            ? o
            : {
                ...o,
                ...(patch.nom !== undefined ? { marque: patch.nom } : {}),
                ...(patch.brut !== undefined ? { brut: patch.brut } : {}),
                ...(patch.etape !== undefined ? { etape: patch.etape } : {}),
                ...(patch.meta !== undefined ? { meta: patch.meta } : {}),
              },
        ),
      );

      /*
       * L'étape voyage avec la meta, toujours.
       *
       * « Facturé » est l'étape `livre` plus un drapeau dans le JSON : envoyer
       * l'étape sans la meta laisserait le drapeau d'avant, et l'OP
       * retomberait à « Livré » au rechargement suivant.
       */
      const metaFinale =
        patch.etape !== undefined
          ? { ...(patch.meta ?? ops.find((o) => o.id === id)?.meta ?? { facture: false, expandia: false, litige: false }), facture: patch.etape === "facture" || patch.etape === "paye" }
          : patch.meta;

      const data = await envoyer("/api/p90/ops", "PATCH", {
        id,
        ...(patch.nom !== undefined ? { nom: patch.nom } : {}),
        ...(patch.brut !== undefined ? { montant: patch.brut } : {}),
        ...(patch.etape !== undefined ? { etape: patch.etape } : {}),
        ...(metaFinale !== undefined ? { note: encoderOp(metaFinale) } : {}),
      });

      if (!data) {
        setOps(avant);
        setEchec("L'OP n'a pas pu être modifiée.");
        return false;
      }
      if (metaFinale !== undefined) {
        setOps((prec) => prec.map((o) => (o.id === id ? { ...o, meta: metaFinale } : o)));
      }
      return true;
    },
    [envoyer, ops],
  );

  const supprimerOp = useCallback(
    async (id: string) => {
      const avant = ops;
      setOps((prec) => prec.filter((o) => o.id !== id));
      const data = await envoyer(`/api/p90/ops?id=${encodeURIComponent(id)}`, "DELETE");
      if (!data) {
        setOps(avant);
        setEchec("L'OP n'a pas pu être supprimée.");
        return false;
      }
      return true;
    },
    [envoyer, ops],
  );

  /* ---------- Les objectifs ---------- */

  const modifierObjectif = useCallback(
    async (cle: IdObjectif, patch: { valeur?: string; jalons?: ObjectifVue["jalons"] }) => {
      const avant = objectifs;
      setObjectifs((prec) =>
        prec.map((o) =>
          o.cle !== cle
            ? o
            : {
                ...o,
                ...(patch.valeur !== undefined ? { valeur: patch.valeur } : {}),
                ...(patch.jalons !== undefined ? { jalons: patch.jalons } : {}),
              },
        ),
      );
      const data = await envoyer("/api/p90/objectifs", "PATCH", { cle, ...patch });
      if (!data) {
        setObjectifs(avant);
        setEchec("L'objectif n'a pas pu être modifié.");
        return false;
      }
      return true;
    },
    [envoyer, objectifs],
  );

  const valeur = useMemo<Cockpit>(
    () => ({
      aujourdhui,
      taches,
      ops,
      objectifs,
      pret,
      echec,
      oublierEchec,
      etatReseau,
      ajouterTache,
      modifierTache,
      basculerFaite,
      deplacerColonne,
      reordonner,
      supprimerTache,
      basculerGel,
      cloturer,
      ajouterOp,
      modifierOp,
      supprimerOp,
      modifierObjectif,
      recharger,
      derniereLecture,
      sursauts,
      verrouSync,
    }),
    [
      aujourdhui,
      taches,
      ops,
      objectifs,
      pret,
      echec,
      oublierEchec,
      etatReseau,
      ajouterTache,
      modifierTache,
      basculerFaite,
      deplacerColonne,
      reordonner,
      supprimerTache,
      basculerGel,
      cloturer,
      ajouterOp,
      modifierOp,
      supprimerOp,
      modifierObjectif,
      recharger,
      derniereLecture,
      sursauts,
      verrouSync,
    ],
  );

  return <CockpitContext.Provider value={valeur}>{children}</CockpitContext.Provider>;
}

/** Les cinq clés d'objectif acceptées, pour ne pas en inventer au décodage. */
const CLES_OBJECTIF = new Set<string>(["momentum", "twaylo", "terrain", "trigger", "tresorerie"]);

function versObjectifVue(o: ObjectifReseau): ObjectifVue {
  return {
    cle: (CLES_OBJECTIF.has(o.cle) ? o.cle : "momentum") as IdObjectif,
    valeur: typeof o.valeur === "string" ? o.valeur : "",
    jalons: Array.isArray(o.jalons) ? o.jalons : [],
  };
}
