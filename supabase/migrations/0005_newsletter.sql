-- ============================================================================
-- La liste de diffusion de Twaylo, alimentée par les Tway'tools.
--
-- Une TABLE, et pas une ligne JSON comme le registre des comptes : celui-ci
-- tient une poignée d'entrées, celle-là est destinée à en recevoir des
-- milliers d'un coup, le jour où une vidéo sort. Tout entasser dans une seule
-- ligne relue et réécrite à chaque inscription, ce serait fabriquer le
-- ralentissement au moment précis où il y a du monde.
--
-- Ce qu'on ne stocke PAS : le jeton de confirmation en clair. Seule son
-- empreinte SHA-256 est gardée, comme un mot de passe. Quelqu'un qui lirait
-- la base ne pourrait pas confirmer une adresse à la place de son
-- propriétaire, ni fabriquer un lien de désabonnement pour un tiers.
-- ============================================================================

create table if not exists newsletter (
  id           uuid primary key default gen_random_uuid(),

  -- Rangée en minuscules par le code, pour que « Twaylo@ » et « twaylo@ »
  -- soient la même personne. L'index unique plus bas s'appuie dessus.
  email        text not null,

  -- Le prénom, tel qu'il a été tapé. Il sert à s'adresser à quelqu'un par son
  -- nom dans un envoi, rien de plus — et il reste facultatif en base : une
  -- ligne importée d'ailleurs n'en aurait pas.
  prenom       text,

  statut       text not null default 'en_attente'
                 check (statut in ('en_attente', 'confirme', 'desabonne')),

  -- Empreinte du jeton, jamais le jeton. Sert à la confirmation puis, une
  -- fois confirmé, au lien de désabonnement présent dans chaque envoi.
  jeton        text,
  jeton_expire timestamptz,

  -- D'où vient l'inscription : « pirats-attack » aujourd'hui, un autre outil
  -- demain. Sans cette colonne, impossible de savoir ce qui recrute.
  source       text not null default 'inconnue',
  langue       text not null default 'fr' check (langue in ('fr', 'en')),

  created_at   timestamptz not null default now(),
  confirme_le  timestamptz,
  desabonne_le timestamptz
);

-- Une adresse, une seule ligne. Se réinscrire ne crée pas de doublon : le
-- code fait un « upsert » sur cette contrainte.
--
-- SUR LA COLONNE, PAS SUR « lower(email) », ET C'EST TOUT LE SUJET.
--
-- La première version indexait l'expression « lower(email) ». C'est le
-- réflexe — il rend « Twaylo@ » et « twaylo@ » équivalents — et il rendait
-- ici TOUTE inscription impossible : PostgreSQL exige que la cible d'un
-- « ON CONFLICT (email) » corresponde à un index portant exactement cette
-- colonne. Un index sur une expression ne correspond pas, et l'insertion
-- échouait avec l'erreur 42P10 — dès la première, pas seulement en cas de
-- doublon. Résultat : la porte s'ouvrait, et aucune adresse n'était gardée.
--
-- Rien n'est perdu au passage : le code range déjà l'adresse en minuscules
-- avant d'écrire (voir « normaliserEmail »), donc l'unicité sur la colonne
-- fait exactement le même travail.
create unique index if not exists newsletter_email_key on newsletter (email);

-- L'ancien index, devenu inutile : deux index pour la même garantie, dont un
-- qui ne sert plus à rien.
drop index if exists newsletter_email_unique;

-- Les deux lectures fréquentes : « combien de confirmés ? » et « à qui
-- appartient ce jeton ? ».
create index if not exists newsletter_statut on newsletter (statut);
create index if not exists newsletter_jeton on newsletter (jeton) where jeton is not null;

-- ============================================================================
-- Verrouillage.
--
-- Cette table contient des adresses e-mail : c'est la seule donnée
-- personnelle de tiers du projet. RLS est activé et AUCUNE politique n'est
-- créée — donc la clé publique (anon), celle qui part dans le navigateur, ne
-- peut ni la lire ni y écrire. Seule la clé de service, qui reste sur le
-- serveur, y accède.
-- ============================================================================
-- Ajoutée après coup : cette ligne rattrape les bases où la table existait
-- déjà sans le prénom. Sur une base neuve elle ne fait rien.
alter table newsletter add column if not exists prenom text;

alter table newsletter enable row level security;
