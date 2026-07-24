-- deals.echeance — la date à laquelle le deal doit être livré/bouclé.
--
-- Le montant existait déjà ; il manquait le « quand ». Sans date, un deal signé
-- ne se rappelle jamais à toi : c'est la deadline qui crée l'urgence, et c'est
-- elle que la carte affiche en virant du vert au rouge à mesure qu'elle
-- approche.
--
-- Type `date` et non `timestamptz` : une échéance de sponsor se compte en
-- jours, pas en heures, et une date nue évite toute glissade de fuseau entre
-- Paris et UTC.
--
-- Nullable : un prospect n'a pas encore de date, et forcer une valeur
-- inventée serait pire que l'absence.

alter table deals
  add column if not exists echeance date;

comment on column deals.echeance is
  'Date d''échéance du deal (livraison/bouclage). Nulle tant qu''elle n''est pas fixée.';
