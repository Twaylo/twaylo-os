-- ⚠️ NON APPLIQUÉE — à garder pour un prochain lot de migrations.
--
-- Écrite puis mise de côté : le jeton d'accès avait déjà été révoqué (à juste
-- titre) quand j'ai voulu la lancer. Plutôt que de renvoyer Twaylo dans le
-- tableau de bord Supabase, le code utilise la colonne `habitudes` existante
-- comme objet d'état quotidien — voir dailyState() dans src/lib/db.ts.
--
-- Le jour où d'autres migrations s'accumulent, appliquer celle-ci et déplacer
-- `une_chose` et `nutrition` de `habitudes` vers `notes` rendra les noms de
-- colonnes honnêtes.

-- daily_logs : un espace souple pour l'état quotidien.
--
-- Le schéma initial typait `habitudes` en jsonb mais n'offrait aucun endroit
-- pour le reste de ce qui vit à la journée : les repas, l'unique chose du
-- jour, et ce qui viendra ensuite. La spec de Miles prévoyait exactement ça
-- (« notes — will hold JSON for habits/nutrition/finance/goals »).
--
-- Plutôt que d'ajouter une colonne typée à chaque nouvelle carte — et donc
-- une migration à chaque fois — on garde un objet libre. Les colonnes typées
-- restent pour ce qu'on interroge vraiment en SQL.

alter table daily_logs
  add column if not exists notes jsonb not null default '{}'::jsonb;

comment on column daily_logs.notes is
  'État quotidien souple : nutrition.repas, une_chose, etc. Les données qu''on filtre en SQL méritent leur propre colonne.';
