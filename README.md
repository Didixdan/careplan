# CarePlan

Application web de **gestion de planning pour auxiliaires de vie rémunérées en CESU**.

- Planning visuel par aidant et par bénéficiaire
- Suivi des heures réalisées et récapitulatif mensuel pour la déclaration CESU
- Frais kilométriques
- Multi-utilisateurs avec rôles : administrateur, aidant, consultation

## Stack

| Brique | Choix |
| --- | --- |
| Framework | Nuxt 4 (`app/`), Vue 3, TypeScript strict |
| Style | Tailwind 4 via PostCSS + SCSS (`@apply` prioritaire), mobile-first |
| Typographie | Anton (titres), Instrument Sans (corps), Space Grotesk (chiffres) — auto-hébergées |
| Couleurs | Registre clinique : bleu médical, neutres froids, statuts vert/ambre/rouge |
| Base de données | Postgres (Neon, provisionné depuis Vercel) + Drizzle ORM — branchée en local, Neon à venir |
| Authentification | `nuxt-auth-utils` (sessions cookies chiffrées, hachage scrypt) — branchée |
| Déploiement | Vercel |
| Tests | Vitest (fonctions de domaine) + garde-fous maison (`verify:css`, knip) |

## Démarrage

**`package.json` est la source de vérité** des commandes. Le Makefile n'est qu'un
raccourci : il n'exécute rien qui ne soit aussi disponible en `pnpm`.

```bash
make start        # .env + dépendances + Postgres + application
```

`Ctrl-C` arrête l'application ; la base reste démarrée. Les seules autres cibles Make
sont `make` (aide), `make stop`, `make verify` et `make status`.

```bash
# Équivalents directs, sans passer par Make
corepack enable
pnpm install
pnpm dev                 # http://localhost:3000 — nécessite la base (voir ci-dessous)
```

Les vues lisent les créneaux en base via `/api/appointments`. Pour un premier lancement :
`pnpm db:up && pnpm db:migrate && pnpm db:seed`.

### La base locale, si besoin

```bash
cp .env.example .env     # une seule fois
pnpm db:up               # Postgres 17 dans Docker
pnpm db:wait             # attend que la base soit réellement prête
```

| Commande | Effet |
| --- | --- |
| `pnpm db:up` | Démarre Postgres en arrière-plan |
| `pnpm db:down` | Arrête le conteneur, **conserve les données** |
| `pnpm db:reset` | Arrête **et supprime** les données, puis redémarre |
| `pnpm db:logs` | Suit les journaux de la base |
| `pnpm db:psql` | Ouvre une session `psql` dans le conteneur |
| `pnpm db:wait` | Attend l'état `healthy` (sort en 1 après 60 s) |
| `pnpm db:generate` | Génère la migration SQL depuis `server/db/schema.ts` |
| `pnpm db:migrate` | Applique les migrations en attente |
| `pnpm db:seed` | Peuple la semaine courante avec les fixtures |

Seule la base est conteneurisée : l'application tourne nativement, ce qui préserve le
rechargement à chaud. Si un Postgres tourne déjà sur le port 5432, régler
`POSTGRES_PORT=5433` dans `.env`. Le mot de passe ne doit contenir ni `@`, ni `:`, ni
`/`, ni `?`, ni `#`, ni espace, sinon `DATABASE_URL` devient invalide.

Si `corepack` échoue avec `EPERM … mkdir`, exporter un emplacement accessible en
écriture. Le Makefile le détecte et bascule automatiquement :

```bash
export COREPACK_HOME=/tmp/careplan-toolcache/corepack
```

## Vérification

```bash
pnpm verify              # types (application + Cypress) + tests + lint + code mort + build + CSS
pnpm e2e:all             # tests de bout en bout, sur une base dédiée (voir plus bas)
```

À lancer avant chaque fin d'étape : **`verify` doit sortir en 0**. Ce projet comporte des
pannes de style qui n'émettent **aucune erreur de build** — `verify:css` est le seul
filet qui les attrape. Contrôles isolés :

| Commande | Rôle |
| --- | --- |
| `pnpm test` | Tests unitaires des fonctions de domaine |
| `pnpm test:watch` | Les mêmes, en continu |
| `pnpm typecheck:e2e` | Types des scénarios Cypress (ils ne sont pas dans le build) |
| `pnpm verify:css` | CSS réellement produit (nécessite un `pnpm build` préalable) |
| `pnpm lint:code-mort` | Exports et fichiers inutilisés (knip) |
| `pnpm report:comments` | Densité de commentaires par fichier |

### Tests de bout en bout (Cypress)

Ils couvrent ce qu'aucun test de fonction ne voit : la modale qui se ferme sur Échap, le focus
qui ne s'échappe pas, un glisser-déposer au pointeur, la barre de navigation à 360 px, et le
presse-papiers. **`pnpm e2e` n'est pas dans `verify`** : il exige un serveur qui tourne.

Les scénarios **écrivent pour de vrai** (créneaux, kilomètres, statuts) et suppriment ce qu'ils
ont créé. Ils tournent donc sur une base **dédiée**, jamais sur celle de travail : un créneau
rescapé y occuperait la plage qu'un scénario veut prendre, et la création échouerait en `409`.
La commande qui fait tout :

```bash
pnpm e2e:all      # base des tests remise à neuf + serveur (3001) + scénarios
```

En deux terminaux, quand on veut rejouer les scénarios sans réinstaller la base :

```bash
pnpm e2e:db       # recrée la base des tests : schéma (migrations) + jeu de données
pnpm e2e:serve    # sert l'application sur CETTE base, http://localhost:3001
pnpm e2e          # les scénarios visent 3001 par défaut (CYPRESS_BASE_URL pour forcer)
```

La base des tests vit dans le **même conteneur** Postgres que celle de travail : seul son nom
change (`careplan` → `careplan_e2e`), et rien ne touche au volume ni au jeu de données de dev.
`E2E_DB` et `E2E_PORT` surchargent le nom et le port, `E2E_DATABASE_URL` l'adresse complète.

Les scénarios ne supposent **aucune plage libre** : ils demandent au serveur la première heure
qu'il accepte (`cy.createFreeAppointment`), la règle de chevauchement restant écrite une seule
fois, côté serveur.

## Documentation

| Fichier | Contenu |
| --- | --- |
| [AGENTS.md](AGENTS.md) | **Les non négociables**, et rien d'autre |
| [docs/decisions.md](docs/decisions.md) | Contexte, rôles, stack, arborescence, charte, vues |
| [docs/pieges.md](docs/pieges.md) | Les 17 pièges vérifiés et comment ils sont rattrapés |
| [.dsh/settings/](.dsh/settings/) | Prompts d'agents : choix du modèle, méthode de travail |
| [.dsh/skills/caveman.md](.dsh/skills/caveman.md) | Compétence chargeable : réponses compressées |
| [.dsh/agents/](.dsh/agents/) | Rôles de délégation |

## Structure

```
app/
  app.vue                    racine : pose le thème, monte la coquille
  components/
    ui/                      UiButton, UiBadge, UiCard, UiCopyButton, UiModal, UiSkeleton,
                             UiEmptyState, UiErrorPage, UiPersonIcon
    planning/                PlanningAppointment, PlanningAppointmentForm, PlanningCopyWeekForm,
                             PlanningTagPicker, PlanningStatusActions, PlanningTimeGrid,
                             PlanningTimedAppointment, PlanningWeekGrid
    layout/                  LayoutShell (nav basse mobile, colonne en desktop)
  composables/               theme.ts, planning.ts, loading.ts, drag.ts, status.ts, mileage.ts
  pages/                     index (jour), week, month (récapitulatif), assistants,
                             beneficiaries, tags (vocabulaire), login, styleguide, [...missing]
  utils/                     date, duration, colors, grid, conflicts, gesture, status, tags,
                             summary, appointments, money, csv, export, message, mileage,
                             error — PLAT (auto-import)
  assets/scss/               design system (abstracts, base, components, layouts)
shared/types/                contrat du domaine + types de session (auth.d.ts)
server/db/schema.ts          schéma Drizzle (9 tables, base en anglais)
server/db/fixtures.ts        données de référence (seed + tests)
server/db/seed.ts            peuplement de la base locale
server/services/             logique applicative (un service par entité)
server/api/appointments/     lecture jour / semaine / mois filtrée par rôle, listes de
                             référence, récapitulatif, création, déplacement, édition,
                             statut, suppression, copie d'une semaine sur une autre
server/api/tags/             catalogue des tags : lecture (aidants + admin), écriture (admin)
server/api/mileage/          kilomètres déclarés : lecture du jour, écriture (ou effacement)
server/api/exports/          exports CSV : récapitulatif CESU du mois, semaine par aidant
server/api/auth/             connexion / déconnexion
server/utils/password.ts     hachage scrypt (partagé seed + auth)
app/middleware/              garde d'authentification (redirection /login)
app/pages/login.vue          page de connexion
docs/                        décisions et pièges
test/                        tests unitaires
cypress/e2e/                 scénarios de bout en bout (vrai navigateur)
scripts/verify-css.mjs       garde-fou anti-régression CSS
scripts/comment-report.mjs   densité de commentaires
scripts/db-wait.sh           attente de la base locale
docker-compose.yml           Postgres 17 pour le développement local
```

## Écrans

| Route | Vue |
| --- | --- |
| `/` | **Jour** — grille horaire (07h–22h) : créneaux créés, modifiés, déplacés (glisser-déposer), marqués réalisés/annulés en un clic et supprimés depuis l'écran, **kilomètres du jour déclarés par aidant** |
| `/week` | **Semaine** — sept blocs de jour empilés (1, 2 puis 3 par ligne), chacun borné à quatre heures et défilant pour lui-même ; déplacement entre jours, mêmes actions rapides de statut, **copie complète d'une semaine sur celle qui est affichée** (remplacement confirmé, annulés signalés), **exports de la semaine** (CSV par aidant, message par famille) |
| `/month` | **Mois** — récapitulatif : heures à déclarer par aidant, **solde prévisionnel** (heures restant à planifier et montant prévisionnel, au taux de chaque bénéficiaire), volume autorisé par bénéficiaire, détail des journées, **export CESU en CSV** |
| `/styleguide` | Écran de contrôle du design system (couleurs, polices, contrastes) |
| `/login` | Page de connexion (identifiants + mot de passe) |
| `/assistants` | Gestion des aidants (admin) — liste, création, modification, suppression |
| `/beneficiaries` | Gestion des bénéficiaires (admin) — liste, création, modification, suppression |
| `/tags` | Gestion du **vocabulaire des actes** (admin) — renommer un tag (il se propage partout) ou le supprimer s'il n'est porté par aucun créneau |
| autre | **404** — page rendue par la route attrape-tout, code HTTP 404 conservé |

## État du projet

**Fait — étapes 1 à 11** : fondation, design system en registre clinique, cellule de
créneau, thème sombre persistant, vues jour et semaine, tests et garde-fous
automatiques, page d'erreur, **schéma Drizzle + accès base local** (7 tables, en
anglais), **authentification + rôles** (`admin` / `assistant` / `viewer`) avec
filtrage serveur, **CRUD aidants et bénéficiaires** (réservé à l'admin),
**grille horaire + déplacement des créneaux par glisser-déposer** (pas de 15 min,
chevauchement par aidant interdit, filtre par aidant pour l'admin),
**création, édition et suppression de créneaux** dans une **modale** ouverte depuis les
deux vues (créneau de nuit accepté, permissions vérifiées côté serveur),
**récapitulatif mensuel** des heures réalisées (réalisé / prévisionnel / annulé, volume
autorisé par bénéficiaire, détail des journées), **actions rapides de statut** sur les
cartes (réalisé / annulé, ou remise en planifié) sans passer par la modale,
**exports** : CSV CESU du mois par aidant (heures × taux, « À saisir » si le taux
manque, colonne « Km »), CSV de la semaine par aidant, et message prêt à coller pour
chaque famille, **kilomètres déclarés une fois par jour** par l'aidant (aucun montant
calculé : c'est un relevé), **copie complète d'une semaine sur une autre** depuis la vue
semaine (remplacement de la semaine cible après confirmation, statuts remis en
prévisionnel, annulés signalés, périmètre borné au rôle).

Les vues lisent les créneaux en base via `/api/appointments`, filtrées selon le rôle.
`?fail=1` force l'échec de lecture. Comptes de dev (mot de passe `careplan`) :
`admin@careplan.local`, `camille@careplan.local` (aidant),
`famille.dupont@careplan.local` (lecture).

**À faire** :

1. Connexion Neon + configuration Vercel (preset, variables, intégration Postgres).
