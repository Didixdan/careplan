---
name: caveman
description: "Mode de réponse compressé : supprime le remplissage de la prose et conserve toute la précision technique. À charger sur demande explicite ou quand les tokens de sortie coûtent."
whenToUse: "L'utilisateur écrit « caveman », « mode caverne » ou demande des réponses plus courtes ; session longue où le contexte est serré."
---

# Compétence — Caveman

## Rôle

Compresser la **sortie de conversation** (environ 65 à 75 % de tokens en moins) sans
rien changer au travail : mêmes fichiers touchés, mêmes commandes lancées, mêmes
résultats annoncés. La concision ne sert jamais à aller plus vite.

## Ce qui disparaît

- formules d'ouverture, politesse, relances : « Bien sûr », « Je vais maintenant… »,
  « N'hésitez pas à… » ;
- rappel de la demande, annonce de ce qui va être fait, résumé de ce qui vient d'être
  fait quand le résultat est déjà sous les yeux ;
- transitions, adverbes de remplissage, répétitions ;
- réexplication d'une sortie de commande déjà affichée ;
- articles et verbes de liaison (niveau complet).

## Ce qui n'est jamais compressé

- code, commandes (`pnpm verify`, `make db-reset`), chemins, URL ;
- messages d'erreur, cités mot pour mot ;
- noms techniques, versions, options, chiffres, mesures, résultats de vérification ;
- avertissements, limites et dettes assumées ;
- le vocabulaire imposé du projet — `aidant`, `beneficiaire`, `creneau`, `heures`,
  `kilometrage` (`shift` proscrit). Français télégraphique, jamais français faux.

## Niveaux

| Niveau | Déclencheur | Effet |
| --- | --- | --- |
| Léger | « caveman léger » | Phrases complètes ; seul le remplissage part |
| Complet (défaut) | « caveman » | Fragments acceptés, articles supprimés, une idée par ligne |
| Ultra | « caveman ultra » | Maximum ; `→` pour la causalité, tableau plutôt que paragraphe |

Retour au mode normal : « stop caveman » ou « mode normal ».

Exemple, même contenu :

```
Avant  : « J'ai bien compris. Je vais maintenant corriger la largeur de la colonne
          du jour, puis je relancerai la vérification pour m'assurer que tout va bien. »
Après  : « PlanningColonneJour.vue : largeur min(78vw, 15rem) → défilement d'un jour
          par écran. pnpm verify → 0. »
```

## Clarté automatique

Le mode se suspend le temps du passage, puis reprend seul :

- opérations destructrices : `make db-reset`, `make clean-all`,
  `docker compose down -v`, `rm -rf` ;
- secrets : `.env`, mots de passe, clé `NUXT_SESSION_PASSWORD` ;
- séquences multi-étapes où l'ordre d'un fragment prêterait à confusion ;
- demande explicite d'explication détaillée ou pédagogique.

## Application à CarePlan

- Le compte rendu de fin d'incrément exigé par `.dsh/settings/workflow.md` reste dû —
  **fait / vérifié / reste ouvert** — en version compressée.
- Le résultat réel de `pnpm verify` est toujours annoncé (sortie 0 ou non). Jamais
  « ça devrait marcher » à la place d'une mesure.
- La compression ne porte que sur la **conversation** : `AGENTS.md`, `README.md`,
  `.dsh/` et les commentaires de code gardent leur rédaction normale et complète.
- Un doute sur le sens d'une consigne se lève en clair, quitte à sortir du mode.
