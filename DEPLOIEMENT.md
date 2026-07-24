# Que l'OS ne s'éteigne jamais — le mettre sur Vercel

Tant que l'OS tourne sur ton PC (`npm run dev`), il meurt dès que le PC dort ou
que la session se ferme. Pour qu'il tourne **24h/24**, indépendamment de ta
machine, on le pose sur **Vercel** : hébergement gratuit à ton échelle, allumé
en permanence, accessible de partout. Ta base Supabase est déjà dans le cloud —
elle ne bouge pas.

Compte ~20 minutes, une seule fois.

---

## Étape 1 — Créer le compte et importer le projet

1. Va sur **vercel.com** → **Sign Up** → choisis **Continue with GitHub** (le
   compte où vit déjà `twaylo-os`).
2. Une fois connecté : **Add New… → Project**.
3. Trouve **`twaylo-os`** dans la liste → **Import**.
4. Ne touche à rien dans « Framework Preset » (Next.js est détecté tout seul).
   **Ne clique pas encore sur Deploy** — d'abord les variables, étape 2.

## Étape 2 — Recopier les variables d'environnement

Sur la page d'import, section **Environment Variables**. Prends chaque valeur
depuis ton fichier `.env.local` et recopie-la. **Ne les colle nulle part
ailleurs qu'ici.**

La liste complète, dans l'ordre. Astuce : Vercel accepte un **copier-coller de
plusieurs lignes d'un coup** dans le champ « Key » — tu peux coller tout le
contenu de `.env.local` et il découpe tout seul.

**Indispensables** (sans elles, rien ne marche) :

| Nom | Où la prendre |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` |
| `AUTH_SECRET` | `.env.local` |
| `DASHBOARD_PASSWORD` | **tape-en un NOUVEAU ici** — l'OS devient public, c'est la seule serrure |
| `USER_ID` | `twaylo` |
| `NEXT_PUBLIC_USER_TIMEZONE` | `Europe/Paris` |

**Pour que le Brain, YouTube et l'agenda marchent aussi** :

| Nom | Où la prendre |
|---|---|
| `ANTHROPIC_API_KEY` | `.env.local` |
| `GOOGLE_CLIENT_ID` | `.env.local` |
| `GOOGLE_CLIENT_SECRET` | `.env.local` |
| `GOOGLE_ICAL_URL` | `.env.local` |
| `GOOGLE_REDIRECT_URI` | **n'existe pas en local — à créer**, voir étape 4 |
| `API_SECRET` | `.env.local` |
| `CRON_SECRET` | `.env.local` |

**Seulement si tu utilises le bot Telegram** :

| Nom | Où la prendre |
|---|---|
| `TELEGRAM_WEBHOOK_SECRET` | `.env.local` |
| `TELEGRAM_USER_ID` | `.env.local` |

## Étape 3 — Déployer

Clique **Deploy**. Attends 1–2 minutes. Vercel te donne une adresse en
`https://twaylo-os-xxxx.vercel.app`. **C'est ton OS, allumé pour toujours.**
Mets-la en favori sur ton Mac et ton téléphone.

Sur iPhone : Safari → Partager → **Sur l'écran d'accueil**. Il s'ouvre en plein
écran, comme une application.

## Étape 4 — Reconnecter YouTube à la nouvelle adresse

La connexion YouTube ne marchera pas encore : Google ne connaît que
`localhost`. Deux petites choses :

1. **Sur Vercel** → ton projet → Settings → Environment Variables → change
   `GOOGLE_REDIRECT_URI` en :
   ```
   https://TON-ADRESSE.vercel.app/api/youtube/callback
   ```
   (remplace `TON-ADRESSE` par ta vraie adresse Vercel), puis **Redeploy**.

2. **Sur console.cloud.google.com** → ton projet Twaylo OS → **Clients** →
   `Twaylo OS` → dans **URI de redirection autorisés**, **+ Ajouter un URI** et
   colle la même adresse :
   ```
   https://TON-ADRESSE.vercel.app/api/youtube/callback
   ```
   (garde aussi celle en `localhost`, pour continuer à tester chez toi.)

Ensuite, sur ton OS déployé : onglet Revenus → Connecter YouTube Studio. C'est
reparti.

## Étape 5 (optionnel) — Chaque modif se redéploie toute seule

Comme le projet est relié à GitHub, chaque fois qu'on pousse une amélioration,
Vercel la met en ligne automatiquement en 1–2 minutes. Rien à refaire.

---

### Deux choses à savoir

- **Le frein anti-force-brute compte en mémoire.** Sur Vercel, plusieurs
  copies du serveur peuvent tourner en parallèle, chacune avec son propre
  compteur — le frein est donc plus faible qu'en local. Tant que l'adresse
  reste privée ça va ; si tu la rends publique un jour, on branchera un vrai
  compteur partagé (Upstash, deux clics sur Vercel). C'est noté dans le code.
- **Ton PC peut alors s'éteindre.** Une fois sur Vercel, tu n'as plus besoin de
  `npm run dev` ni que ton PC reste allumé. L'OS vit tout seul.
