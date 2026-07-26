-- deals.etape : ajouter « regle » (payé) après « livre ».
--
-- Un deal vit désormais : prospect → négociation → signé → livré → réglé. La
-- dernière étape, c'est l'argent réellement encaissé — distinct de « livré »,
-- où la presta est faite mais pas forcément payée.
--
-- La colonne portait une contrainte CHECK qui n'acceptait que quatre valeurs :
-- on la remplace pour en accepter cinq. `drop ... if exists` rend la migration
-- rejouable sans erreur.

alter table deals drop constraint if exists deals_etape_check;

alter table deals
  add constraint deals_etape_check
  check (etape in ('prospect', 'negociation', 'signe', 'livre', 'regle'));
