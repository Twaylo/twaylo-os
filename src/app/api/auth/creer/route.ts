import { NextResponse } from "next/server";

import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "@/lib/auth";
import { creerCompte, normaliserId } from "@/lib/comptes";
import { adresse, creerFrein } from "@/lib/frein";
import { USER_ID, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Un quota, pas un compteur d'échecs.
 *
 * Ici c'est la RÉUSSITE qui coûte : elle ajoute une ligne au registre et
 * consomme une empreinte PBKDF2. On décompte donc chaque appel, abouti ou
 * non. Trois OS par quart d'heure et par adresse, dix pour tout le monde :
 * largement au-dessus d'un usage humain, très en dessous de ce qu'il faut
 * pour faire grossir le registre ou saturer le processeur.
 */
const frein = creerFrein({ parIp: 3, global: 10 });

/**
 * Créer un OS : un nom, un mot de passe, et on est dedans.
 *
 * La session est ouverte dans la foulée. Demander de se reconnecter juste
 * après avoir choisi son mot de passe, c'est ajouter un mur là où l'on vient
 * d'ouvrir une porte.
 */
export async function POST(req: Request) {
  const ip = adresse(req);
  const attente = frein.bloque(ip);
  if (attente !== null) {
    console.warn(`[auth] création de compte freinée pour ${ip}`);
    return NextResponse.json(
      { error: "Trop de créations d'affilée. Réessaie dans quelques minutes." },
      { status: 429, headers: { "retry-after": String(attente) } },
    );
  }

  const secret = process.env.AUTH_SECRET;
  const motDePasseServeur = process.env.DASHBOARD_PASSWORD;
  if (!secret || !motDePasseServeur) {
    return NextResponse.json({ error: "Serveur mal configuré." }, { status: 503 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "La base n'est pas configurée." }, { status: 503 });
  }

  let nom: unknown;
  let motDePasse: unknown;
  try {
    ({ nom, motDePasse } = await req.json());
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (typeof nom !== "string" || typeof motDePasse !== "string") {
    return NextResponse.json({ error: "Nom et mot de passe attendus." }, { status: 400 });
  }

  // Décompté AVANT le travail coûteux : c'est l'appel qu'on borne, pas son
  // issue. Un attaquant ne doit pas pouvoir dépenser du PBKDF2 gratuitement
  // en enchaînant des noms déjà pris.
  frein.echec(ip);

  const id = normaliserId(nom);
  const souci = await creerCompte(id, motDePasse, USER_ID);
  if (souci) return NextResponse.json({ error: souci }, { status: 400 });

  /*
   * Le jeton porte le NOUVEAU compte.
   *
   * Le mot de passe du serveur entre toujours dans la signature — c'est lui
   * qui permet de révoquer d'un coup toutes les sessions en le changeant. Ce
   * qui distingue les comptes, c'est le champ porté par la charge utile, pas
   * la clé de signature.
   */
  const res = NextResponse.json({ ok: true, compte: id });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret, motDePasseServeur, undefined, id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
