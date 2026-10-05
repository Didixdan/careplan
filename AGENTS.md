# CarePlan — règles du projet

Application web de **gestion de planning pour auxiliaires de vie rémunérées en CESU**.

Ce fichier est **court par choix** : il ne contient que ce qu'on ne peut pas ne pas
savoir. Le détail est dans `docs/`, et le comportement est garanti par des tests, pas
par de la prose.

| Où | Quoi |
| --- | --- |
| [`docs/decisions.md`](docs/decisions.md) | Contexte, rôles, stack tranchée, arborescence, palette, vues de planning |
| [`docs/pieges.md`](docs/pieges.md) | **Les 17 pièges vérifiés** qui ont réellement cassé le projet, et comment `verify:css` les rattrape |
| [`README.md`](README.md) | Démarrage, commandes, structure, état d'avancement |

---

## Les six règles non négociables

1. **Le code est en anglais, l'interface est en français.** Identifiants, fichiers,
   types, composables et routes d'API sont anglais : `assistant`, `appointment`,
   `beneficiary`, `moveAppointment` (`shift` reste proscrit — le domaine dit *créneau*).
   Les libellés, messages et textes d'écran restent français : « Aidant », « Créneau »,
   « Semaine ». La base est en anglais elle aussi (`users`, `appointments`,
   `status = planned`) : le français ne vit qu'à l'affichage, jamais dans un identifiant.

2. **Tailwind passe par PostCSS**, jamais par `@tailwindcss/vite` — ce dernier ignore
   le SCSS et laisse les `@apply` littéraux dans le CSS **sans faire échouer le build**.
   Voir [`docs/pieges.md`](docs/pieges.md) §1.

3. **Ne jamais exposer d'objet `Date`.** Les dates de planning sont des chaînes
   civiles `'YYYY-MM-DD'`, les heures des chaînes `'HH:MM'`. Un `Date` porte un fuseau :
   un créneau du 1er du mois s'afficherait le 31 chez l'utilisateur.

4. **Contraste ≥ 4,5:1** pour tout texte, dans les deux thèmes. Les fonds de badge sont
   **opaques et définis par mode** : une opacité se compose avec ce qu'il y a dessous,
   et le contraste devient dépendant du thème par accident.

5. **La couleur signifie, elle ne décore pas.** Le rail **droit** porte l'**aidant principal**,
   le rail **gauche** le **bénéficiaire**, le badge porte le **statut** — jamais deux fois la
   même information par la couleur. La base stocke un identifiant (`assistant-3`), jamais un
   code hexadécimal.

6. **Toute panne doit être visible dans le code, pas dans la tête de quelqu'un.**
   Avant d'écrire une règle en prose, se demander si un test peut la porter.

---

## Avant de terminer une étape

```bash
pnpm verify          # types (application + Cypress) + tests + lint + code mort + build + CSS
```

`verify` enchaîne sept contrôles, et **doit sortir en 0**. Ne jamais empiler un
changement sur un `verify` rouge.

Les scénarios de bout en bout (`pnpm e2e:all`) ne sont pas dedans : ils demandent un serveur qui
tourne, et une base à eux. Ils couvrent ce qu'aucun test de fonction ne voit — Échap, le focus,
le pointeur, 360 px, le presse-papiers — **créent puis suppriment leurs propres créneaux**, et
**ne supposent aucune plage libre** : ils demandent au serveur la première qu'il accepte.

| Contrôle | Ce qu'il attrape que rien d'autre ne voit |
| --- | --- |
| `pnpm test` | Passage de minuit, dates civiles, couleurs, cas limites des mocks |
| `pnpm verify:css` | Scan Tailwind à l'arrêt, police en repli, contraste, **classe SCSS morte** |
| `pnpm lint:code-mort` | Export ou fichier inutilisé (knip) |

**Un fait testable doit être testé plutôt que documenté** : la prose ne casse pas
quand elle devient fausse. C'est la raison d'être de `docs/` : il ne reste en prose
que ce qui ne se teste pas.

---

## Contraintes de structure, mesurées

- **`app/utils/` et `app/composables/` doivent rester PLAT.** Nuxt n'auto-importe que
  le premier niveau : un sous-dossier casse silencieusement tous les appels.
- **Les composants vivent dans un dossier par bloc applicatif** (`ui/`, `planning/`,
  `layout/`) : Nuxt préfixe le nom du composant par le dossier, donc
  `planning/Appointment.vue` devient `<PlanningAppointment />`. Le nom est auto-documenté, et
  une classe déclarée sans consommateur fait échouer `verify:css`.
- **Ne pas réintroduire `app/error.vue`** : Nuxt 4 ne le rend pas au premier chargement
  serveur ([#34757](https://github.com/nuxt/nuxt/issues/34757)). La 404 est rendue par
  `app/pages/[...missing].vue`. Voir [`docs/pieges.md`](docs/pieges.md) §11.

---

## Organisation des règles

| Chemin | Contenu |
| --- | --- |
| `AGENTS.md` | Ce fichier : les non négociables, et rien d'autre |
| `docs/decisions.md` | Contexte, stack, arborescence, charte, vues |
| `docs/pieges.md` | Les pièges vérifiés |
| `.dsh/settings/` | Prompts d'agents : routage de modèle, découpage des étapes |
| `.dsh/agents/README.md` | Rôles d'agents et périmètres |
| `.dsh/skills/caveman.md` | Compétence chargeable : mode de réponse compressé (frontmatter YAML obligatoire) |
