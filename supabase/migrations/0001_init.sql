-- Twaylo OS — schéma initial (spec Partie 4).
--
-- V1 mono-utilisateur : user_id vaut 'twaylo' partout, mais la colonne existe
-- déjà pour que le passage multi-utilisateur ne demande pas de migration
-- destructive plus tard.
--
-- RLS est activé deny-all sur toutes les tables : aucune policy n'est créée,
-- donc la clé anon ne peut rien lire. Seule la service role (qui contourne RLS)
-- accède aux données, et elle ne quitte jamais le serveur.

-- L'extension vector est activée dans le schéma extensions (le défaut
-- Supabase), pas dans public. Sans la ligne search_path ci-dessous, le type
-- vector(1536) plus bas déclenche « type vector does not exist » : l'éditeur
-- SQL ne chercherait le type que dans public.
create extension if not exists vector with schema extensions;
set search_path = public, extensions;

-- Ce fichier est rejouable : le relancer après un échec partiel ne produit
-- pas d'erreur « already exists », il complète ce qui manque.

-- ---------------------------------------------------------------------------
-- captures — la boîte de réception. Tout ce que Twaylo dicte ou tape atterrit
-- ici d'abord, avant d'être routé vers la bonne table.
-- ---------------------------------------------------------------------------
create table if not exists captures (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null default 'twaylo',
  texte          text not null,
  type           text not null check (type in (
                   'tache','idee_video','contact','objectif','depense','note','journal')),
  priorite       text check (priorite in ('aujourdhui','semaine','mois','un_jour')),
  source         text not null default 'manuel'
                   check (source in ('voix','texte','web','manuel')),
  audio_url      text,
  classification jsonb not null default '{}'::jsonb,
  traite         boolean not null default false,
  routed_to      jsonb,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- videos — le pipeline de contenu, 6 étapes.
-- Créée avant `tasks`, qui la référence.
-- ---------------------------------------------------------------------------
create table if not exists videos (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default 'twaylo',
  titre      text not null,
  statut     text not null default 'idee'
               check (statut in ('idee','scenario','tournage','montage','pret','publie')),
  format     text not null default 'long'
               check (format in ('short','long','reel_ig','tiktok','live')),
  hook       text,
  date_cible date,
  publie_le  date,
  vues       bigint,
  lien       text,
  priorite   integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- contacts — le CRM réseau (onglet Contacts).
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null default 'twaylo',
  nom              text not null,
  type             text not null check (type in (
                     'collab','sponsor','investisseur','fournisseur','equipe','audience')),
  relation         text not null default 'froid'
                     check (relation in ('chaud','tiede','froid','actif')),
  role             text,
  email            text,
  telephone        text,
  lien             text,
  prochaine_action text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — `cle` alimente la carte Tâches clés, la plus importante de l'OS.
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null default 'twaylo',
  titre        text not null,
  statut       text not null default 'ouverte'
                 check (statut in ('ouverte','en_cours','faite','abandonnee')),
  urgence      text not null default 'semaine'
                 check (urgence in ('aujourdhui','semaine','mois','un_jour')),
  cle          boolean not null default false,
  categorie    text,
  echeance     date,
  notes        text,
  video_id     uuid references videos(id) on delete set null,
  contact_id   uuid references contacts(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- deals — les sponsors chiffrés (onglet Sponsors). Absent de la spec d'origine :
-- ajouté parce que le CRM a été scindé en réseau + business.
-- ---------------------------------------------------------------------------
create table if not exists deals (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default 'twaylo',
  nom        text not null,
  etape      text not null default 'prospect'
               check (etape in ('prospect','negociation','signe','livre')),
  montant    numeric(12,2),
  devise     text not null default 'EUR',
  note       text,
  contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- goals — jamais d'auto-effacement : Twaylo coche ou supprime à la main.
-- ---------------------------------------------------------------------------
create table if not exists goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default 'twaylo',
  objectif   text not null,
  portee     text not null check (portee in ('semaine','mois','trimestre','annee')),
  statut     text not null default 'en_cours'
               check (statut in ('en_cours','atteint','abandonne')),
  categorie  text,
  cible      text,
  echeance   date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_logs — une ligne par jour. `jour` est ancré sur le fuseau de Twaylo,
-- pas sur UTC (spec Partie 10, bug 2) : c'est le serveur qui doit s'adapter,
-- via le helper localDateKey().
-- ---------------------------------------------------------------------------
create table if not exists daily_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'twaylo',
  jour          date not null,
  humeur        text,
  habitudes     jsonb not null default '{}'::jsonb,
  score         integer,
  journal_texte text,
  gagne         text,
  a_ameliorer   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, jour)
);

-- ---------------------------------------------------------------------------
-- revenue_snapshots — écrits par le cron quotidien. La page LIT le dernier
-- snapshot, elle n'appelle jamais l'API YouTube au chargement (spec Partie 8).
-- ---------------------------------------------------------------------------
create table if not exists revenue_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null default 'twaylo',
  periode          text not null,
  date             date not null,
  revenu_estime    numeric(12,2),
  rpm              numeric(10,2),
  vues_monetisees  bigint,
  prevision_mois   numeric(12,2),
  objectif_mois    numeric(12,2),
  sources          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (user_id, periode, date)
);

-- ---------------------------------------------------------------------------
-- memory_chunks — la mémoire vectorielle (étape 6).
-- 1536 dimensions = OpenAI text-embedding-3-small.
-- ---------------------------------------------------------------------------
create table if not exists memory_chunks (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default 'twaylo',
  source_type text not null,
  source_id   uuid,
  texte       text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);

create table if not exists audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null default 'twaylo',
  action        text not null,
  resource_type text not null,
  resource_id   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

-- ivfflat en cosinus, comme le prévoit la spec. À noter : ivfflat n'est
-- efficace qu'une fois la table peuplée — il faudra le reconstruire quand la
-- mémoire aura quelques milliers de lignes.
create index if not exists memory_chunks_embedding_idx
  on memory_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists captures_inbox_idx    on captures (user_id, traite, created_at desc);
create index if not exists tasks_open_idx        on tasks (user_id, statut, urgence, cle);
create index if not exists videos_pipeline_idx   on videos (user_id, statut, priorite desc);
create index if not exists contacts_relation_idx on contacts (user_id, relation);
create index if not exists deals_etape_idx       on deals (user_id, etape);
create index if not exists goals_portee_idx      on goals (user_id, portee, statut);
create index if not exists daily_logs_jour_idx   on daily_logs (user_id, jour desc);
create index if not exists revenue_date_idx      on revenue_snapshots (user_id, date desc);
create index if not exists audit_log_recent_idx  on audit_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS : deny-all. Aucune policy = aucun accès, sauf service role.
-- ---------------------------------------------------------------------------
alter table captures          enable row level security;
alter table tasks             enable row level security;
alter table videos            enable row level security;
alter table contacts          enable row level security;
alter table deals             enable row level security;
alter table goals             enable row level security;
alter table daily_logs        enable row level security;
alter table revenue_snapshots enable row level security;
alter table memory_chunks     enable row level security;
alter table audit_log         enable row level security;

-- Tient updated_at à jour sur daily_logs.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists daily_logs_touch on daily_logs;
create trigger daily_logs_touch
  before update on daily_logs
  for each row execute function touch_updated_at();
