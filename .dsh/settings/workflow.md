# Méthode de travail — CarePlan

## Principe : petits incréments vérifiables

Le projet est développé **au compte-goutte**, une brique à la fois. Un incrément doit
être assez petit pour être relu d'un coup d'œil et validé avant de passer au suivant.

Chaque incrément se termine par :

```bash
pnpm verify    # typecheck + lint + build + verify:css
```

**Tant que `pnpm verify` n'est pas vert, on ne commence pas l'incrément suivant.**

## Déroulé d'un incrément

1. **Annoncer** ce qui va être fait, en une phrase, et pourquoi.
2. **Implémenter** le minimum nécessaire. Pas de fonctionnalité « au cas où ».
3. **Vérifier** avec `pnpm verify`.
4. **Rendre compte** : ce qui a été fait, ce qui a été vérifié, ce qui reste.
5. **Attendre l'arbitrage** avant de poursuivre sur le sujet suivant.

## Ce qu'il ne faut jamais faire

- Introduire une dépendance sans la justifier et la faire valider.
- Modifier `nuxt.config.ts` sur le pipeline CSS : voir `docs/pieges.md` §1 à §6, ces
  réglages ont été obtenus par diagnostic et sont fragiles.
- Supprimer le témoin de scan `p-[13.5px]` de `app/pages/styleguide.vue`.
- Créer un cache d'outillage dans le dépôt.
- Passer en revue de code un incrément dont `pnpm verify` échoue.
- Écrire une fonctionnalité qui dépend d'une API dont le contrat n'est pas encore
  figé : figer le contrat d'abord.

## Ordre de construction prévu

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Fondation Nuxt + Tailwind + SCSS + design system + outillage | ✅ |
| 2 | Schéma Drizzle, migrations, base locale | ✅ |
| 3 | Authentification, rôles, garde-fous serveur | ✅ |
| 4 | Entités `aidants` et `beneficiaires` (CRUD) | ✅ |
| 5 | Planning : vues jour et semaine | ✅ |
| 6 | Grille horaire : déplacement des créneaux (glisser-déposer) | ✅ |
| 7 | Création, édition et suppression de créneaux (modale) | ✅ |
| 8 | Récapitulatif mensuel des heures réalisées | ✅ |
| 9 | Actions rapides de statut sur les cartes | ✅ |
| 10 | Exports : CSV CESU du mois, CSV de la semaine, messages aux familles | ✅ |
| 11 | Kilomètres déclarés par jour (aucun montant) | ✅ |
| 12 | Déploiement Vercel et variables d'environnement | à faire |
| 13 | Cypress : scénarios écrits, **à lancer sur un poste** (pas de navigateur dans l'environnement d'exécution) | à faire |

**Décidé** : la « vue mois » évoquée à l'étape 5 ne sera pas une grille de trente colonnes.
Le récapitulatif mensuel (étape 8, `docs/decisions.md` §6) porte la lecture par mois, sous
forme de totaux et d'un détail par journée, plus l'export CESU (étape 10). Une grille de
trente colonnes ne se lit pas sur un téléphone, et personne ne déclare trente jours d'un
coup d'œil.

## Compte rendu attendu

À la fin de chaque incrément, trois points seulement :

1. **Ce qui a été fait** — fichiers créés ou modifiés.
2. **Ce qui a été vérifié** — la commande lancée et son résultat réel.
3. **Ce qui reste ouvert** — décisions en attente, dette assumée, risque identifié.

Ne pas annoncer un résultat non mesuré. Si une vérification n'a pas été faite, le
dire explicitement plutôt que de la supposer acquise.

## Gestion des erreurs de diagnostic

Une hypothèse doit être **prouvée par une mesure** avant d'être inscrite dans la
documentation du projet. Un contre-exemple mesuré invalidant une hypothèse est une
information utile : il doit être signalé et la documentation corrigée, pas contourné
en silence.
