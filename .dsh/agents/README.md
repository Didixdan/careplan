# Rôles d'agents — CarePlan

Ces rôles décrivent des **périmètres de délégation**, pas des personnes. Un même
agent peut les tenir successivement. Le choix du modèle associé est décrit dans
`.dsh/settings/model-routing.md`.

## `scaffolder` — production de code répétitif

**Modèle conseillé :** `flash`.

**Périmètre :** créer des composants, pages et partials qui reproduisent un motif
déjà validé dans le dépôt.

**Entrées obligatoires du prompt :**
1. le fichier existant à imiter ;
2. les classes SCSS à réutiliser ;
3. le rappel mobile-first ;
4. l'obligation de lancer `pnpm verify`.

**Interdictions :** toucher à `nuxt.config.ts`, au pipeline CSS, ou introduire une
dépendance.

## `reviewer` — relecture critique

**Modèle conseillé :** `pro`.

**Périmètre :** relire un incrément terminé et chercher ce qui ne va pas.

**Grille de relecture :**
- le style est-il bien dans un partial SCSS en `@apply`, et non dans un `<style>` ?
- la mise en page est-elle mobile-first, sans `max-width` en media query ?
- les couleurs viennent-elles des tokens sémantiques ?
- les zones de frappe font-elles au moins 44 px ?
- l'autorisation est-elle vérifiée **côté serveur** ?
- `pnpm verify` passe-t-il réellement ?

**Livrable :** une liste de problèmes classés par gravité, chaque point accompagné du
fichier et de la ligne concernés. Pas de réécriture spontanée.

## `migrations` — base de données

**Modèle conseillé :** `pro`, sans exception.

**Périmètre :** schéma Drizzle, migrations, index, contraintes.

**Règles :**
- toute migration est réversible ou accompagnée d'un plan de retour ;
- une migration est testée sur une base vide **et** sur une base peuplée ;
- le schéma reste dans le dépôt : aucun changement manuel en console ;
- les clés étrangères et les contraintes d'unicité sont déclarées en base, pas
  seulement dans le code applicatif.

## `securite` — rôles et isolation des données

**Modèle conseillé :** `pro`, sans exception.

**Périmètre :** authentification, politiques de rôles, vérification qu'un aidant ne
peut jamais atteindre les données d'un autre.

**Règle de fond :** la vérification vit dans la route Nitro. Le filtrage côté client
n'est qu'un confort d'affichage.

**Test minimal exigé :** pour chaque route exposée, vérifier qu'un appel avec le
compte d'un aidant ne renvoie rien des données d'un autre aidant, y compris en
modifiant l'identifiant dans l'URL.

## `diagnostic` — panne dont la cause est inconnue

**Modèle conseillé :** `pro`.

**Périmètre :** trouver la cause racine, pas appliquer un correctif au hasard.

**Règle :** toute hypothèse doit être **prouvée par une mesure** avant d'être
inscrite dans la documentation. Un contre-exemple mesuré invalide l'hypothèse et doit
être signalé, pas contourné.

**Historique utile :** le diagnostic du pipeline CSS de l'étape 1 a d'abord produit
deux fausses pistes (`.gitignore`, puis position du `@source`) parce que le test
utilisait un nom de classe que Tailwind ne génère jamais. La vraie cause était le
plugin Vite `@tailwindcss/vite`. Voir `docs/pieges.md` §1 et §7.
