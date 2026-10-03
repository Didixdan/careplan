# Choix du modèle — CarePlan

Objectif : payer le bon prix pour le bon travail. Le mode `pro` est réservé à ce qui
engage l'architecture ou la correction métier ; le mode `flash` couvre la production
répétitive une fois les conventions figées.

## Basculer sur `pro`

- Conception ou modification du **schéma de données** (tables, relations, index,
  migrations).
- **Autorisation et authentification** : politique de rôles, garde-fous serveur,
  isolation des données entre aidants.
- Choix structurants : découpage Nitro, stratégie de cache, gestion des fuseaux
  horaires, format des exports CESU.
- **Logique métier non triviale** : détection de chevauchement de créneaux, calcul
  des heures majorées, récurrences, prorata de frais kilométriques.
- Diagnostic d'un bug dont la cause n'est pas encore identifiée.
- Revue critique d'un choix déjà fait (remise en question d'un partis pris).

## Basculer sur `flash`

- Génération de composants `.vue` qui suivent un motif déjà validé.
- Ajout de pages CRUD simples une fois le schéma et les routes en place.
- Partials SCSS reprenant un composant existant comme gabarit.
- Tests, documentation, renommage, formatage.
- Répétition d'une migration sur un autre écran déjà traité.

## Règle pratique

| Situation | Modèle |
| --- | --- |
| « Je découvre le problème » | `pro` |
| « Je connais le motif, je le réplique » | `flash` |
| « Ça touche la sécurité ou la base » | `pro`, sans exception |
| « C'est le 3ᵉ écran identique » | `flash` |

## Consigne de délégation

En mode `flash`, le prompt doit rappeler explicitement :

1. le fichier de référence à imiter ;
2. les classes SCSS à réutiliser ;
3. la contrainte mobile-first ;
4. l'obligation de lancer `pnpm verify`.

Sans ces quatre points, `flash` produit du code plausible mais hors conventions.

## Consigne d'escalade

Si `flash` produit deux fois de suite un résultat qui ne passe pas `pnpm verify`,
ne pas insister : repasser en `pro` et traiter le problème à la racine.
