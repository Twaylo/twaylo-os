import { NextResponse } from "next/server";

import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "@/lib/auth";
import { creerCompte, normaliserId } from "@/lib/comptes";
import { adresse, souslaLimite } from "@/lib/limite";
import { USER_ID, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Créer un OS : un nom, un mot de passe, et on est dedans.
 *
 * La session est ouverte dans la foulée. Demander de se reconnecter juste
 * après avoir choisi son mot de passe, c'est ajouter un mur là où l'on vient
 * d'ouvrir une porte.
 */
export async function POST(req: Request) {
  /*
   * Cinq créations par heure et par adresse.
   *
   * La liste des comptes vit dans UNE ligne, relue et réécrite par six chemins
   * différents. La faire grossir sans limite, c'est ralentir tout l'OS pour
   * tout le monde — une panne provoquée depuis une route ouverte.
   */
  if (!souslaLimite(`creer:${adresse(req)}`, 5, 3_600_000, 40)) {
    return NextResponse.json(
      { error: "Trop de créations d'affilée. Réessaie dans une heure." },
      { status: 429 },
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
