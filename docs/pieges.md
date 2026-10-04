# Pièges connus

Chaque point de ce fichier **a réellement cassé le projet** et a coûté du temps de
diagnostic. Ce ne sont pas des précautions théoriques.

La caractéristique commune de la plupart d'entre eux : **aucune commande n'échoue.**
`nuxt build` reste vert, la page se charge, et le style est cassé. C'est pour cela que
`scripts/verify-css.mjs` existe : il contrôle le CSS réellement produit, seul endroit
où ces pannes sont visibles.

---

## 1. Tailwind doit passer par PostCSS, jamais par `@tailwindcss/vite`

Le plugin Vite `@tailwindcss/vite` **ignore les fichiers SCSS**. Les directives
`@apply` ressortent **littéralement** dans le CSS livré, aucun utilitaire n'est
généré, et **le build reste vert**. Aucune erreur, aucun avertissement.

```ts
// nuxt.config.ts — configuration correcte
vite: {
  css: {
    postcss: { plugins: [tailwindcss()] },   // @tailwindcss/postcss
    preprocessorOptions: { scss: { loadPaths: [nodeModules] } },
  },
}
```

## 2. Un `postcss.config.mjs` à la racine n'est pas lu par Nuxt

Les plugins PostCSS doivent être déclarés dans `vite.css.postcss`. Un fichier
`postcss.config.mjs` à la racine reste silencieusement ignoré.

## 3. `@apply` n'est résolu que si l'import Tailwind est dans le même fichier

`app/assets/scss/main.scss` porte **à la fois** `@import 'tailwindcss'`, le bloc
`@theme` et les règles `@apply`. Séparer Tailwind et les `@apply` dans deux entrées
CSS distinctes casse la résolution.

## 4. Sass exige `@use` avant toute règle

Dans `main.scss`, `@use 'abstracts/…'` doit précéder `@import 'tailwindcss'` et le
bloc `@theme`. C'est pourquoi les partials sont chargés par `@import` et non `@use` :
un `@use` placé après `@theme` est rejeté.

**Dette assumée** : `@import` Sass est déprécié. Le migrer imposerait de déplacer la
configuration Tailwind dans un fichier `.css` séparé.

Conséquence : Sass émet un avertissement par `@import`, que Vite affiche en `ERROR`
(sans faire échouer le build). Désactivés par `silenceDeprecations: ['import']`.
`quietDeps` ne suffisait pas : il ne masque que les avertissements des dépendances,
pas ceux de nos propres fichiers.

## 5. Sass ne peut pas inliner une feuille `.css` de paquet npm

`@import '@fontsource/anton/latin-400.css'` dans un fichier SCSS ne produit **pas**
les `@font-face` : Sass conserve l'`@import` tel quel, et le navigateur échoue à le
résoudre (il ne connaît pas `node_modules`).

Les polices sont donc déclarées dans **`nuxt.config.ts`, clé `css`**, traitées par le
pipeline CSS de Vite. C'est le seul moyen d'obtenir l'émission des `.woff2` et la
réécriture des `url()`.

## 6. Sass doit pouvoir résoudre `tailwindcss`

Sans `loadPaths: [nodeModules]`, Sass échoue sur `@import 'tailwindcss'` avec
« Can't find stylesheet to import ».

## 7. Un nom de classe inventé n'est jamais généré par Tailwind

Tailwind ne génère que des **utilitaires valides**. Chercher `<div class="mon-marker">`
dans le CSS produit ne prouve rien : cette classe serait absente même si le scan
fonctionnait. Pour tester le scan, utiliser une **valeur arbitraire** réelle, par
exemple `p-[13.5px]`.

**Ne pas supprimer le `<span class="hidden p-[13.5px]">` de `app/pages/styleguide.vue`** :
c'est le seul signal fiable d'un scan à l'arrêt.

## 8. Tailwind élague les variables de thème non détectées

Tailwind n'émet une variable `@theme` que s'il la juge utilisée d'après les classes
scannées. Une couleur appliquée par `var(--color-…)` dans un **style inline construit
à l'exécution** échappe au scan, et sa variable est **supprimée du CSS**.

Constaté : sur les 8 couleurs d'aidant, seules 2 étaient émises. Aucun build cassé,
aucune erreur — juste des éléments sans couleur.

Correctif : les couleurs d'aidant vivent dans un bloc **`@theme static` séparé**, qui
force l'émission de toutes ses variables.

```css
@theme static {
  --color-assistant-1: oklch(45% 0.062 20);
  /* … */
}
```

## 9. `@apply` ne fonctionne pas sur nos propres classes

`@apply num` échoue avec « Cannot apply unknown utility class ». `.num` est une classe
du design system, pas un utilitaire Tailwind : seul un utilitaire généré est
applicable. Pour réutiliser un style du design system dans un partial, il faut un
**mixin** — c'est le cas de `chiffres-tabulaires`.

## 10. `vue-router` doit rester en version 5

Nuxt 4.5.2 dépend de `vue-router@^5.2.0`. En version 4, `nuxt typecheck` imprime des
erreurs Volar `ERR_PACKAGE_PATH_NOT_EXPORTED` (chemin `vue-router/volar/…` inexistant
en 4.x). Le typecheck sortait en 0 malgré tout, mais la sortie était du bruit permanent.

## 11. `error.vue` n'est pas rendu au premier chargement serveur

**Bug de Nuxt 4, vérifié sur ce projet** ([nuxt/nuxt#34757](https://github.com/nuxt/nuxt/issues/34757)) :
une erreur levée pendant le rendu serveur est sérialisée en **JSON** par Nitro, et
`app/error.vue` n'est jamais rendu. Une URL inconnue renvoyait donc du JSON.

C'est pourquoi la page 404 est un **composant rendu dans une route**
(`UiErrorPage`, utilisé par `app/pages/[...missing].vue`), avec
`setResponseStatus(404)` pour conserver le code HTTP. Le résultat est vérifiable :

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3000/inconnu
# → 404 text/html;charset=utf-8
```

## 12. `app/utils/` doit rester plat

Nuxt n'auto-importe que le **premier niveau** : `app/utils/date.ts` oui,
`app/utils/planning/date.ts` **non**. Un sous-dossier casse silencieusement tous les
appels. Même contrainte pour `app/composables/`. Mesuré, pas supposé.

## 13. Modèle de défilement de la vue semaine

**La vue semaine ne défile pas en horizontal.** Les sept jours sont empilés en grille — une
colonne sur téléphone, deux à partir de `md`, trois à partir de `lg`, donc 3/3/1 en desktop —
et **chaque jour défile pour lui-même** dans un cadre borné à quatre heures
(`.semaine__corps`, `max-height: 24rem` = 4 × 96 px). L'en-tête du jour (nom, numéro, total)
reste visible pendant que son cadre défile. La page, elle, ne défile qu'en vertical.

**Contrainte tenue : on ne peut jamais défiler en horizontal ET en vertical en même temps.**
Le défilement horizontal a simplement disparu : le modèle précédent (sept colonnes côte à
côte, une journée visible sur téléphone et trois à quatre sur un écran de bureau, les autres
atteintes en glissant de côté) a été remplacé parce qu'il était pénible à lire.

### Une zone bornée doit avoir quelque chose à faire défiler

C'est le piège qui a coûté le plus cher, et il reste actif. À 390 px de large, la première
version donnait à chaque colonne un `max-height` pour qu'elle défile : or le contenu d'une
colonne tenait entièrement dans la zone. Elle **existait sans rien à faire défiler**, captait
le geste vertical, et le doigt ne pouvait plus atteindre les jours suivants.

**`overscroll-behavior` ne redirige pas un geste, il l'arrête.** La seule correction fiable
est de **supprimer** le défilement inutile, pas de le chaîner.

D'où deux règles tenues par le code :

- **un jour sans passage ne rend aucun cadre défilant** : il affiche une ligne
  « Aucun passage » (`WeekGrid.vue`, `hasAppointments`) ;
- **un jour qui a des passages a toujours de quoi défiler** : la grille fait 1 440 px dans un
  cadre de 384 px.

Et `overscroll-behavior` reste à `auto` sur le cadre : en fin de journée, le geste doit
pouvoir continuer vers le jour suivant.

Pièges liés :

- `min-height: 0` est **indispensable** sur le cadre : dans une colonne flex, sans lui
  l'enfant refuse de rétrécir et la borne est ignorée.
- Le raccourci `overflow` de Tailwind s'écrit `overflow: auto hidden` — **sens x puis
  y**. Un contrôle qui ne chercherait que `overflow-x` conclurait à tort que le
  défilement a disparu.
- Le tri des créneaux est fait **dans le composant** : l'ordre d'arrivée dépendra de
  la requête SQL, qui ne garantit rien sans `ORDER BY`.

`verify:css` échoue si un `overflow-x: auto` ou une accroche `snap-x` réapparaît sur
`.semaine__grille`, si elle porte un `max-height`, ou si `.semaine__corps` perd sa borne
(24 rem), son `min-height: 0` ou son `overflow-y: auto` — ou passe son `overscroll-behavior`
à `contain`.

## 14. Un tap sur une surface de glisser-déposer exige un seuil

Un créneau se déplace par glisser-déposer, et sa fiche s'ouvre par un **tap**. Les deux
intentions partagent le même `pointerdown` : sans seuil, le glisser démarre au moindre
contact et **aucune fiche ne peut jamais s'ouvrir**. Ce n'est pas un détail d'ergonomie,
c'est une fonctionnalité inaccessible.

La règle vit dans `app/utils/gesture.ts` (`isDragGesture`), pas dans la gestion des
événements du composable : ainsi elle est testée (`gesture.spec.ts`), et le seuil
explique à lui seul pourquoi 6 px.

- Le seuil s'applique **par axe**, pas en distance euclidienne : un doigt qui tremble
  bouge des deux côtés à la fois, et une diagonale de 4 px sur chaque axe ne doit pas
  compter comme un déplacement.
- Tant que le seuil n'est pas franchi, **rien ne doit changer à l'écran** : ni l'aperçu,
  ni l'atténuation de la carte. Une carte qui pâlit dès l'appui annonce un déplacement
  qui n'aura peut-être pas lieu.
- Deux autres affordances sont **fermées** par la règle des 44 px
  (`docs/decisions.md` §10) : un bouton « supprimer » dans la carte, qui ne fait que
  24 px de haut pour un créneau d'un quart d'heure, et un bouton de coin, qui ne
  tiendrait pas dans la largeur. D'où la modale ouverte par le tap.
- L'équivalent clavier du tap est `tabindex="0"` + `role="button"` + Entrée/Espace. Il est
  posé sur **exactement les mêmes cartes que le tap** (`useCanEditAppointments`) : celles
  de quelqu'un qui a le droit d'écrire. Une carte focalisable qui n'ouvre rien est un arrêt
  de tabulation inerte, et un formulaire qu'on n'a pas le droit d'envoyer vaut moins qu'un
  formulaire absent.
- **Corollaire, appris en ajoutant les actions rapides de statut** : une carte de la grille
  est proportionnelle à sa durée, donc un créneau d'un quart d'heure mesure 24 px. Deux
  cibles de 44 px n'y tiennent pas : `overflow-hidden` les couperait, et les laisser
  déborder recouvrirait la carte suivante, dont les propres boutons deviendraient
  incliquables. D'où un **seuil mesuré** (`hasRoomForStatusActions`, 30 min) et un repli
  assumé vers la modale pour les créneaux plus courts. Un contrôle de 44 px ne « flotte »
  pas dans une grille proportionnelle : il faut décider où il vit, ou renoncer.
- **Le même piège vaut pour les gestes** : un bouton posé sur une surface de glisser doit
  couper `pointerdown` *et* `keydown`, sinon il déclenche aussi le glisser ou l'ouverture de
  la modale de la carte qui le porte.

**Non vérifié automatiquement** : le geste réel (tap et glisser) demande un navigateur,
absent de l'environnement de vérification. La règle, elle, est testée.

## 15. Une modale doit quatre choses à ses utilisateurs

`UiModal` n'est pas une décoration : un dialogue qui n'applique pas ces quatre règles est
une régression d'accessibilité, et **rien ne le signale** — ni le build, ni le typecheck.

1. **Piéger le focus.** Sinon `Tab` atteint la page restée derrière le voile : le focus
   actif sort de l'écran, et le clavier pilote des éléments invisibles. La boucle est
   explicite (`first`/`last` dans `Modal.vue`), avec Échap et le retour du focus à
   l'élément déclencheur — sans quoi, à la fermeture, le focus repart au début du document.
2. **Se rendre seulement quand elle est ouverte.** Le contenu est téléporté dans `<body>`
   et la modale est montée par un `v-if` : rien ne peut donc être téléporté pendant le rendu
   serveur, où `body` n'existe pas encore.
3. **Verrouiller le défilement de la page** (`body.style.overflow`), en restaurant la valeur
   précédente et non `''` : une autre modale, ou une future règle, pourrait l'avoir posée.
4. **Garder le bouton d'envoi DANS le `<form>`.** Il serait tentant de poser les actions
   dans un pied de modale hors du formulaire : la validation native (`required`) cesserait
   alors de bloquer l'envoi, silencieusement. Le pied vit donc dans le formulaire, qui
   fournit lui-même `.modale__corps` et `.modale__pied`.

Deux détails de style, appris en les écrivant :

- **Le voile ne peut pas être `bg-ink/40`.** En thème sombre, `--color-ink` devient clair :
  le voile s'éclaircirait au lieu d'assombrir la page. Il est noir, dans les deux thèmes.
- **`shadow-overlay` est fait pour elle.** La charte réserve l'ombre à ce qui flotte
  (`docs/decisions.md` §5) ; la modale est le seul endroit où cette ombre est légitime, et
  `verify:css` continue d'échouer si une ombre réapparaît sur `.card`.

**Non vérifié automatiquement** : le piège du focus, le verrouillage du défilement et la
fermeture sur Échap demandent un navigateur. C'est le prix de ne pas installer
`@nuxt/test-utils` (décision assumée dans `vitest.config.ts`).

## 16. Un CSV pour Excel ne s'écrit pas comme un CSV générique

Trois détails, et **aucun ne lève d'erreur** : le fichier s'ouvre, il est simplement faux.

- **BOM UTF-8 obligatoire** (`\uFEFF` en tête). Sans lui, Excel lit le fichier en ANSI et
  affiche « Ã‰lise Dupont » et « 12 Â h 30 ». Le BOM se vérifie donc en **octets**
  (`EF BB BF`) et non en texte : `Response.text()` le retire silencieusement — un test qui
  compare des chaînes ne verrait jamais sa disparition.
- **Point-virgule** comme séparateur. Avec la virgule, Excel en français empile tout dans une
  seule colonne.
- **Échappement** : un champ qui contient un `;`, un guillemet ou un saut de ligne doit être
  encadré de guillemets, eux-mêmes doublés. Un intitulé du type « Courses ; retour » coupe
  sinon la ligne en deux, et le fichier se décale d'une colonne à partir de là.

Le fichier étant produit par une fonction pure (`app/utils/csv.ts`), ces trois propriétés sont
testées sur la chaîne, et le fichier réellement servi est vérifié en bout de chaîne.

## 17. Un flottant qui s'additionne dérive

Les kilomètres sont stockés en flottant, parce que c'est ce qu'affiche un compteur. Mais
`12,1 + 12,2` vaut `24,299999999999997` : le total d'un mois part faux, et **personne ne le voit
à l'œil** sur une valeur en kilomètres. Le défaut se propage silencieusement jusqu'à l'export.

La règle est donc : **arrondir à deux décimales à l'écriture ET à l'affichage**. Pas seulement à
l'affichage — un total arrondi à l'écran mais stocké brut redevient faux dès qu'il est additionné
ailleurs, et deux écrans finiraient par afficher deux totaux différents.

`app/utils/mileage.ts` porte `roundKilometers`, `sumKilometers` les applique, et
`mileage.spec.ts` verrouille le cas qui a motivé l'arrondi. C'est le même raisonnement que pour
l'argent, où l'on stocke des centimes entiers : **une quantité ne se stocke pas dans le type qui
arrange le calcul, mais dans celui qui rend le total juste.**
