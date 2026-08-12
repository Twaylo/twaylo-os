<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Communication avec Twaylo — à retenir

Twaylo n'est pas technique. Quand une action est nécessaire de son côté :
UNE seule marche à suivre, la plus directe possible — le lien exact à
cliquer, pas de navigation dans des menus — et jamais plusieurs options en
parallèle. Tout ce qui peut être vérifié ou fait depuis la session doit
l'être AVANT de le solliciter ; on ne lui demande un geste qu'en dernier
recours, et un seul à la fois.

# Mise en ligne — demande permanente de Twaylo

Chaque changement terminé part EN LIGNE tout de suite, sans attendre :
une fois le build vert et le commit poussé sur la branche de travail,
avancer aussi `main` dessus (`git push origin <branche>:main`,
fast-forward) — Vercel déploie `main` automatiquement sur
twaylo-os.vercel.app. Ne jamais laisser du travail fini en attente sur
une branche.

# Twaylo OS : un outil perso, plus un produit

Décision de Twaylo, prise après plusieurs semaines d'usage réel. Twaylo OS
n'est PAS commercialisé et ne le sera pas : c'est son outil à lui. Sa seule
entreprise, c'est Momentum — se disperser sur cinq projets, c'est n'en réussir
aucun. Le sas d'accueil, les comptes multiples et la page publique restent en
place et fonctionnels ; on ne les développe simplement plus, et on ne propose
plus de travail « produit » (prix, acquisition, indexation, onboarding
grand public) sans qu'il le redemande.

**Ce qui remplace ça : la TO-DO LIST.** Tout l'OS est bâti autour d'elle —
c'est elle qui fait avancer le reste. La page d'accueil ne montre qu'elle, en
pleine largeur, plus « aujourd'hui je vais » au-dessus et trois cartes de
soutien en dessous (progression, quêtes, habitudes). Toute idée d'amélioration
se juge à cette aune : est-ce que ça sert la todo ? Continuer à gamifier,
animer, regrouper, mettre des icônes.
