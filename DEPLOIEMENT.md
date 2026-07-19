# Rendre l'OS accessible partout

Aujourd'hui l'OS tourne sur ton PC, en `localhost`. Trois conséquences : il
meurt quand tu fermes ton laptop, il n'existe pas depuis ton MacBook ni ton
téléphone, et il n'existera pas depuis la Bolivie.

Deux façons de régler ça. La première dépanne, la seconde résout.

---

## Option A — Sur ton réseau, tout de suite (5 minutes)

Ça marche tant que le PC est allumé et que tu es sur le même Wi-Fi.

**1. Lance le serveur en écoute réseau**

```bash
npm run dev:reseau
```

Sans le `-H 0.0.0.0` que ce script ajoute, Next n'écoute que sur lui-même et
rien d'autre sur le réseau ne peut l'atteindre.

**2. Ouvre le port dans le pare-feu Windows**

PowerShell **en administrateur**, une seule fois :

```powershell
New-NetFirewallRule -DisplayName "Twaylo OS" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**3. Depuis le MacBook ou le téléphone**

```
http://192.168.1.10:3000
```

Cette adresse change si ta box redistribue les IP. Pour la retrouver :
`ipconfig` sur le PC, ligne « Adresse IPv4 ».

### Ce que cette option ne donne pas

- Rien ne marche si le PC est éteint, en veille, ou sur un autre réseau
- Pas de HTTPS, donc **le micro du Brain ne marchera pas** sur le MacBook ni
  sur le téléphone : les navigateurs refusent l'accès au micro hors HTTPS,
  sauf sur `localhost`
- Rien depuis l'extérieur de chez toi

---

## Option B — Vercel (20 minutes, une fois pour toutes)

C'est la vraie réponse. HTTPS, accessible de partout, indépendant de ton PC,
gratuit à ton échelle. Le micro fonctionne. La base Supabase, elle, ne bouge
pas : elle est déjà dans le cloud.

**1. Pousse le dépôt** — c'est déjà fait, tout est sur
`github.com/Twaylo/twaylo-os`.

**2. Sur vercel.com** → *Add New Project* → importe `twaylo-os`. Le framework
est détecté tout seul.

**3. Recopie les variables d'environnement**

Prends-les depuis ton `.env.local`. **Ne les colle nulle part ailleurs** — ni
dans un chat, ni dans un fichier suivi par git.

Indispensables :

| Variable | D'où elle vient |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ton `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | ton `.env.local` |
| `AUTH_SECRET` | ton `.env.local` |
| `DASHBOARD_PASSWORD` | **choisis-en un nouveau, aléatoire** |
| `USER_ID` | `twaylo` |

Optionnelles, selon ce que tu veux voir marcher :

| Variable | Active quoi |
|---|---|
| `ANTHROPIC_API_KEY` | l'onglet Brain |
| `GOOGLE_ICAL_URL` | la carte Semaine |
| `API_SECRET` | l'accès par script |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`, `TELEGRAM_WEBHOOK_SECRET` | la capture par Telegram |

**4. Deploy.** Tu obtiens une URL en `.vercel.app`. Ajoute-la en favori sur le
Mac et sur le téléphone.

**5. Sur iPhone** : Safari → Partager → *Sur l'écran d'accueil*. L'OS s'ouvre
alors en plein écran, sans barre d'adresse, comme une application.

### Une chose à savoir avant de déployer

Le frein anti-force-brute de la page de connexion compte les tentatives **en
mémoire**. Vercel peut faire tourner plusieurs instances : chacune aurait son
propre compteur, ce qui affaiblit le frein sans l'annuler. Ça reste
largement mieux que rien, mais si l'URL devient publique, il faudra passer ce
compteur sur Redis (Upstash s'intègre en deux clics sur Vercel).

C'est signalé en commentaire dans `src/app/api/auth/login/route.ts`.
