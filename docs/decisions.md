# Décisions et contrat

Ce fichier explique **pourquoi** le projet est fait ainsi, et ce qui ne se rouvre pas
sans raison explicite. Il ne répète pas les pièges techniques : ils sont dans
[`pieges.md`](./pieges.md).

---

## 1. Contexte fonctionnel

Application de **gestion de planning pour auxiliaires de vie rémunérées en CESU**,
utilisée par une petite équipe — un responsable et quelques aidants — pas par des
milliers d'utilisateurs. Toute décision privilégie la **simplicité exploitable** sur
la scalabilité.

| Rôle (valeur en base) | Droits |
| --- | --- |
| `admin` | Crée les aidants, voit et modifie **tous** les plannings, gère les bénéficiaires |
| `assistant` (aidant) | Voit et modifie **uniquement son propre** planning |
| `viewer` (lecture) | Bénéficiaire ou famille : consultation seule de ses propres créneaux |

Périmètre visé :

1. Planning visuel (jour / semaine) par aidant **et** par bénéficiaire.
2. Gestion des bénéficiaires (adresse, taux horaire, volume d'heures autorisé).
3. Suivi des heures réalisées → récapitulatif mensuel pour la déclaration CESU.
4. Frais kilométriques et déplacements.

**Vocabulaire** : le **code est en anglais** (identifiants, fichiers, types, routes
d'API) et l'**interface est en français**. `shift` reste proscrit : le domaine dit
*créneau*, et la route s'appelle `/api/appointments`. La base est en anglais elle
aussi ; le français ne vit qu'à l'affichage.

---

## 2. Stack : décisions tranchées

| Sujet | Décision |
| --- | --- |
| Framework | **Nuxt 4** (dossier `app/`), déploiement Vercel |
| Style | **Tailwind 4** + **SCSS** avec `@apply` prioritaire, **mobile-first** |
| Rendu | Web uniquement, pas d'application native |
| Base de données | **Postgres managé** (Neon provisionné depuis Vercel) |
| Accès aux données | **Drizzle ORM**, schéma versionné dans le dépôt |
| Authentification | `nuxt-auth-utils` (sessions cookies chiffrées, hachage scrypt) |
| Supabase | **Écarté** — pas de compte tiers supplémentaire |
| Emails | **Aucun** : l'admin crée les comptes et transmet les mots de passe |
| Autorisation | Vérifiée **côté serveur Nitro** à chaque requête, jamais seulement en base |

**Pourquoi Postgres managé et pas SQLite** : Vercel n'héberge aucune base de données
(son offre Postgres a été retirée en 2024) et le filesystem des fonctions serverless
est éphémère. La base doit être joignable par le réseau. Le schéma restant dans le
dépôt, migrer vers un autre Postgres se limite à un `pg_dump` / `pg_restore`.

### Modèle de données (base anglaise)

| Concept (fr) | Table (en) |
| --- | --- |
| utilisateur | `users` (email, hashed_password, role) |
| aidant | `assistants` (first_name, last_name, color, contracted_minutes) |
| bénéficiaire | `beneficiaries` (address, hourly_rate_cents, authorized_minutes_month) |
| créneau | `appointments` (date, start_time, end_time, status, beneficiary_id, primary_assistant_id) |
| co-aidants | `appointment_assistants` (appointment_id, assistant_id) |
| tag | `tags` (name, key) — le vocabulaire des actes |
| tags d'un créneau | `appointment_tags` (appointment_id, tag_id, position) |
| affectation | `assignments` (assistant_id, beneficiary_id) |

Un créneau a **un** bénéficiaire, **un** aidant principal (dont la couleur colore le
rail) et **zéro ou plusieurs** co-aidants. Les rôles sont `admin` / `assistant` /
`viewer` ; l'autorisation est vérifiée côté serveur à chaque requête : `/api/appointments`
filtre selon le rôle (l'aidant voit ses créneaux, le bénéficiaire les siens).

---

## 3. Arborescence

```
app/
  app.vue                    racine : pose le thème, monte la coquille
  components/
    ui/                      UiButton, UiBadge, UiCard, UiModal, UiSkeleton, UiEmptyState,
                             UiErrorPage, UiPersonIcon
    planning/                PlanningAppointment, PlanningAppointmentForm, PlanningTagPicker,
                             PlanningTimeGrid, PlanningTimedAppointment, PlanningWeekGrid
    layout/                  LayoutShell
  composables/               theme.ts, planning.ts, loading.ts, drag.ts
  pages/                     index (jour), week, month (récapitulatif), assistants,
                             beneficiaries, tags (vocabulaire), login, styleguide, [...missing]
  utils/                     date.ts, duration.ts, colors.ts, grid.ts, conflicts.ts,
                             gesture.ts, status.ts, summary.ts, appointments.ts, tags.ts,
                             error.ts
shared/types/                contrat du domaine + types de session (auth.d.ts)
server/
  db/                        schéma Drizzle, fixtures, seed
  services/                  logique applicative (un service par entité)
  api/appointments/          lecture filtrée par rôle (jour / semaine / mois), listes de
                             référence, récapitulatif, création, déplacement, édition,
                             suppression
  api/tags/                   catalogue des tags : lecture (aidants + admin), écriture (admin)
  api/auth/                  connexion / déconnexion
app/middleware/              garde d'authentification (redirection /login)
app/pages/login.vue          page de connexion
docs/                        ce fichier et pieges.md
test/                        tests unitaires (Vitest)
```

**Les composants sont rangés par bloc applicatif, et Nuxt préfixe le nom du composant
par celui du dossier.** `planning/Appointment.vue` devient `<PlanningAppointment />` : le nom
est auto-documenté et les collisions sont impossibles.

`NuxtLayout` / `app/layouts/` n'est **pas** utilisé : la coquille est un composant
ordinaire qui reçoit la page par son slot, ce qui rend le point d'insertion visible
dans `app.vue`.

Le préfixe `use` des composables est **conservé** bien que le nom de fichier ne le
porte pas (`theme.ts` → `useTheme()`). Dans Nuxt, `useXxx()` est ce qui distingue un
composable d'un simple utilitaire appelé depuis un template.

---

## 4. Typographie

| Fonte | Rôle | Pourquoi elle |
| --- | --- | --- |
| **Instrument Sans** | Corps, libellés, `h3`/`h4`, boutons | La fonte de travail ; accents français propres |
| **Anton** | `h1` et `h2` uniquement, **en capitales** | Donne le caractère ; capitales imposées par la fonte |
| **Space Grotesk** | Chiffres, heures, durées, totaux | Chiffres tabulaires, personnalité sans être un monospace |

**Ne pas ajouter de quatrième famille sans retirer la précédente** : ~105 Ko de
`.woff2` au total, déjà significatif sur un téléphone en 4G.

- Anton n'a **qu'une graisse** : la hiérarchie `h1`/`h2` passe uniquement par la
  taille. D'où le retour à Instrument Sans pour `h3`/`h4`, qui a une vraie graisse
  semibold — sans quoi la hiérarchie des titres serait plate.
- Les titres Anton sont **en capitales** par nécessité, pas par goût : ses minuscules
  accentuées françaises percutent les ascendantes.
- Les noms de familles sont `'Instrument Sans Variable'`, `'Anton'` et
  `'Space Grotesk Variable'`. Une faute de nom provoque un **repli silencieux**.
- `.num` = chiffres tabulaires. `.eyebrow` = petites capitales espacées, pour étiqueter
  un groupe sans ajouter un niveau de titre.

---

## 5. Couleurs : registre clinique

La palette est **froide et neutre**, comme celle d'un logiciel de soin. Deux tentatives
précédentes ont été écartées, et il vaut la peine de savoir pourquoi :

| Tentative | Pourquoi c'était faux |
| --- | --- |
| Teal cyan + ambre saturé | Le combo le plus fréquent des interfaces médicales générées |
| Teal oxydé + terre cuite + neutres beiges (teinte 78) | Registre « artisanal, cosy, marque lifestyle » : ça ne ressemble pas à un logiciel de gestion |

**Règle de fond : dans un logiciel de soin, la couleur SIGNIFIE, elle ne décore pas.**

- **Primaire** : bleu médical désaturé, `oklch(50% .075 245)` — **5,92:1** sur blanc.
- **Accent** : bleu-cyan froid, dans la même famille de teinte que le primaire. Il
  **marque** sans introduire une seconde famille de couleur.
- **Neutres** : froids, teinte 250. Un fond neutre ne teinte pas les données et laisse
  la couleur utile ressortir.
- **Sémantique** : vert `success` (réalisé, validé), ambre `warning` (à vérifier), rouge
  `danger` (annulé, absence). Le rouge est plus sourd que la normale
  (`oklch(41% .14 27)`) : un rouge vif donne l'impression d'une alarme.

### Deux codes couleur distincts, jamais confondus

| Élément | Porte | Où |
| --- | --- | --- |
| **Rail** à gauche du créneau | l'**AIDANT** | `--creneau-couleur`, `assistant-1` … `assistant-8` |
| **Badge** à droite du créneau | le **STATUT** | vert / ambre / rouge |

Un créneau n'affiche donc jamais deux fois la même information par la couleur, et
l'aidant est toujours écrit en toutes lettres à côté du rail.

### Couleurs d'aidant

Huit teintes `assistant-1` … `assistant-8`. **La base stockera l'identifiant (`assistant-3`),
jamais un code hexadécimal** : une couleur libre casserait le contraste garanti.

Les luminosités diffèrent légèrement d'une teinte à l'autre, à dessein : l'écart de
luminosité est le seul canal fiable pour distinguer deux couleurs en deutéranopie.

### Contraste : une contrainte, pas une recommandation

Seuil de **4,5:1** pour tout texte, dans les deux thèmes.

| Badge | Avant (clair) | Avant (sombre) | Après (clair / sombre) |
| --- | --- | --- | --- |
| `--success` | 2,91 ✗ | 3,89 ✗ | 7,60 / 11,44 |
| `--warning` | 8,97 | **1,07** ✗ | 10,69 / 10,69 |
| `--danger` | 3,80 ✗ | 3,08 ✗ | 7,60 / 11,56 |
| `--primary` | 7,86 | 7,86 | 9,85 / 12,51 |
| `--accent` | 8,67 | 8,67 | 10,40 / 12,76 |

**Cause racine des échecs** : les fonds de badge étaient des **opacités**
(`bg-success/15`). Une opacité se compose avec ce qu'il y a dessous, donc le contraste
dépendait du thème par accident alors que l'encre était fixe. Les fonds sont désormais
**opaques et définis par mode**.

Pour un badge **plein**, une encre foncée sur un remplissage `…-500` ne passe pas en
thème sombre : même à `L=10 %`, le contraste plafonne à 4,47. La recette est donc
identique dans les deux thèmes : **encre très claire (`…-100`) sur `…-700`**.

`verify:css` lit les couleurs **réellement compilées** des règles `.badge--*` et
`.dark .badge--*`. Contrôler une copie des valeurs ne testerait que la copie — cette
erreur a réellement laissé passer une régression.

### Rayons et ombres

`radius-tag` 2 px (badges), `radius-field` 6 px (champs, boutons), `radius-card` 10 px.
Un rayon unique partout est un tic visuel ; un rayon qui varie signale la taille.

`shadow-float` (menus, infobulles) et `shadow-overlay` (dialogues). **`.card` n'a aucune
ombre** : une carte est posée, pas suspendue. `verify:css` échoue si une ombre
réapparaît sur `.card`.

### Thème clair / sombre

Préférence stockée dans un **cookie** (`careplan-theme`, un an), et non `localStorage` :
`localStorage` n'est lisible que par le navigateur, donc le serveur enverrait toujours
la même classe et le thème sombre provoquerait un **flash blanc** à chaque chargement.
Avec un cookie, le serveur rend directement `<html class="dark">`.

- Composable : `app/composables/theme.ts` (`isDark`, `toggle`).
- La classe est posée dans `app/app.vue`, pas dans une page.
- Ne **jamais** réintroduire un `htmlAttrs.class` dans une page : deux sources de
  vérité pour la même classe produisent un rendu incohérent.

---

## 6. Vues de planning

**Vue jour** (`app/pages/index.vue`) : l'écran d'ouverture, consulté sur téléphone,
souvent debout. Trois chiffres de synthèse seulement (heures planifiées, passages,
bénéficiaires), puis les créneaux. **Le seul élément mis en avant est ce qui demande
une action** : un créneau « à vérifier » reçoit un fond teinté, les autres se contentent
de leur badge. Si tout est mis en avant, rien ne l'est.

**Vue semaine** (`app/pages/week.vue`) : les sept jours sont empilés en grille — une colonne
sur téléphone, deux à partir de `md`, trois à partir de `lg` (donc 3/3/1 en desktop, dimanche
seul en bas). Chaque jour garde son en-tête (nom, numéro, total) et un **cadre borné à quatre
heures de grille, qui défile pour lui-même** : plus aucun défilement horizontal, la page ne
défile qu'en vertical. Un jour sans passage affiche une ligne « Aucun passage », jamais un cadre
vide : une zone bornée sans contenu capterait le geste pour rien. Le modèle de défilement est
verrouillé par `verify:css` — voir [`pieges.md`](./pieges.md) §13.

**Grille horaire et déplacement** : les deux vues affichent une grille 07h–22h (pas de
15 min) où chaque créneau est posé à son heure. Un créneau se déplace par
glisser-déposer (durée conservée), avec :
- **pas de 15 min** (`roundTo15`) ;
- **chevauchement interdit par aidant** (principal ou co-aidant) — vérifié côté client
  pour l'aperçu, et côté serveur (`PUT /api/appointments/:id`) comme source de vérité ;
- **déplacement entre jours** en vue semaine — le dépôt se fait dans la partie VISIBLE du
  cadre d'un jour : une heure hors du cadre demande de le faire défiler d'abord ;
- **filtre par aidant** pour l'admin (sélecteur sur les deux vues) ;
- les créneaux passant minuit sont affichés dans un bloc « Nuit », non déplaçables.

Droits : l'admin déplace tout, l'aidant seulement ses créneaux, le `viewer` rien.

### Création, édition et suppression

Un **seul formulaire**, dans une **modale** (`UiModal` + `PlanningAppointmentForm`), pour
créer et pour modifier. La grille reste visible derrière le voile : on ne quitte pas le
planning, et rien ne vient s'insérer en haut de la grille — une première version posait le
formulaire de création au-dessus de la vue, ce qui repoussait la journée hors de l'écran.

Il est ouvert par le bouton « + » de l'en-tête (seule action de l'écran, donc seule à
porter la couleur primaire) ou par un **tap sur un créneau**, qui ouvre le même formulaire
pré-rempli. Les deux modes partagent les champs, la validation et le contrat d'API : deux
composants auraient divergé dès la première validation ajoutée.

- **Créneau de nuit accepté** (22:00 → 01:00) : la plage 07h–22h ne contraint que le
  déplacement, qui se fait dans la grille. Sans cela, une veille ne serait jamais
  saisissable. L'écran annonce « se termine le lendemain » pour que 22:00 → 01:00 ne
  ressemble pas à une faute de frappe.
- **Aidant** : l'admin choisit ; un aidant ne voit que son propre nom, et le serveur refuse
  tout autre aidant même si le corps de la requête est forgé.
- **Modifier ≠ déplacer** : la modification (`PATCH /api/appointments/:id`) change tout,
  **durée comprise**. Le déplacement (`PUT`) ne fait que translater dans la grille et
  refuse un changement de durée : mélanger les deux aurait permis à un arrondi de dépixel
  de corriger une durée sans que personne ne le demande.
- **Suppression** : dans le même formulaire, à l'écart du bouton d'enregistrement, et
  confirmée. Un bouton « supprimer » dans la carte serait impossible — 24 px de haut pour
  un créneau d'un quart d'heure, contre 44 px pour une cible utilisable (voir §10).
- **Tap ou glisser ?** Les deux intentions partagent le même `pointerdown` : c'est
  `app/utils/gesture.ts` qui tranche, sur un seuil de 6 px (voir
  [`pieges.md`](./pieges.md) §14).
- **Chevauchement** : une seule règle, `app/utils/conflicts.ts`, partagée par le serveur
  (source de vérité) et par l'aperçu du glisser-déposer. Elle compare des minutes
  **absolues depuis l'époque**, ce qui fait tomber le passage de minuit sans cas
  particulier : le serveur regarde J-1 … J+1, une comparaison « même date » laisserait
  passer une nuit à cheval sur deux jours.
- **Plages horaires** : contrôlées une fois, dans `checkTimeRange` (`app/utils/grid.ts`),
  qui renvoie un code testable plutôt qu'un message.
- **Tags** : un créneau porte **au moins un** tag et au plus dix (`MAX_TAGS`). La règle est
  pure (`checkTagNames`, `app/utils/tags.ts`), le message vit dans le service, et l'écran
  désactive « Enregistrer » tant qu'aucun tag n'est choisi — il n'annonce pas une action que
  le serveur refuserait.

### Tags : le vocabulaire des actes

L'ancien **intitulé libre** a disparu : le même acte s'écrivait « Aide à la toilette »,
« toilette », « aide toilette »… Le vocabulaire vit désormais dans une table `tags` partagée,
et le formulaire propose l'existant par **autocomplete** (`PlanningTagPicker`).

Ce que la prose ne peut pas dire — le reste est tenu par `test/tags.spec.ts`, qui verrouille les
règles de clé, d'ordre et de refus, et par `cypress/e2e/tags.cy.ts` pour l'écran :

- **Pourquoi un référentiel partagé** : un intitulé libre ne se réutilise pas, se réécrit à
  chaque saisie, et finit en variantes que rien ne rapproche. La table, elle, se dédoublonne par
  une **clé** : « Courses » et « courses » sont le même tag. Les accents ne sont **pas** repliés —
  l'extension `unaccent` n'est pas garantie sur Neon, et une seconde règle approximative créerait
  des doublons silencieux ; la règle est donc écrite une fois en JS et une fois dans la migration
  qui a converti les anciens intitulés.
- **Deux chemins d'écriture, deux comportements voulus** : le formulaire d'un créneau
  **réutilise** le tag existant et crée le manquant (sinon un aidant serait bloqué par un
  vocabulaire incomplet) ; l'écran de gestion **refuse** un doublon en 409 (une saisie
  volontairement dupliquée est une erreur qu'il vaut mieux voir).
- **Trois tags sur une carte, tous dans les exports** : une carte de grille est proportionnelle
  à sa durée, donc courte ; la limite est un choix d'écran, jamais une perte de donnée. La
  carte de liste, qui vit dans le flux, les montre tous.
- **Le titre d'une carte est le BÉNÉFICIAIRE** : plus d'intitulé à afficher, et c'est lui qu'on
  cherche des yeux dans une journée. L'aidant garde sa ligne, colorée par le rail.

Droits, dans une seule fonction (`useCanEditAppointments`, côté écran ; `assertMayEdit`,
côté serveur) : l'admin écrit tout ; l'aidant écrit ses créneaux (principal ou co-aidant),
et crée ou modifie **pour lui-même uniquement** ; le `viewer` ne peut que lire. Ses cartes
ne sont donc **pas activables** — ni au doigt, ni au clavier : une carte focalisable qui
n'ouvre rien est un arrêt de tabulation inerte, et un formulaire qu'on n'a pas le droit
d'envoyer est pire qu'un formulaire absent.

Les listes de référence du formulaire passent par `GET /api/appointments/options`, qui ne
transporte qu'un identifiant et un nom : `/api/beneficiaries` reste réservée à l'admin, car
elle expose l'adresse, le taux horaire et le volume d'heures autorisé. Le **catalogue des
tags** y voyage en entier : l'autocomplete filtre côté client, donc aucune requête par frappe.

**États de chargement** : les vues passent par `useLoading`, qui expose
`data`, `error`, `isLoading` et `refresh`. Une panne de lecture affiche un
message et un bouton « Réessayer », jamais un écran vide. C'est le seul point à
modifier pour brancher la base.

### Actions rapides de statut

Un passage terminé se marque **sur la carte**, en un clic, sans ouvrir la modale. Les deux
actions proposées dépendent de l'état courant, et rien d'autre :

| Statut actuel | Actions rapides |
| --- | --- |
| `planned` | **Réalisé**, **Annulé** |
| `to_validate` | **Planifié**, **Annulé** |
| `completed`, `cancelled` | **aucune** — états finaux : on passe par la modale, qui montre ce que l'on change |

La table vit dans `app/utils/status.ts` (`QUICK_TRANSITIONS`) et sert **aux deux côtés** :
l'interface n'affiche que ces transitions, et le serveur refuse les autres en 409. Une règle
écrite deux fois finirait par diverger — ici, la divergence serait un statut faux.

**Route dédiée** : `PATCH /api/appointments/:id/status`, corps `{ status }`. Envoyer le corps
complet de la modification depuis un DTO lu quelques secondes plus tôt risquerait d'écraser
un autre champ au passage. La modification complète (`PATCH /:id`) accepte, elle, **tous**
les statuts : c'est la porte de sortie des états finaux.

**Les boutons sont neutres**, jamais verts ni rouges : le badge porte déjà la couleur du
statut, et deux codes pour la même information se contrediraient (règle 5). Ce sont les
formes qui diffèrent — ✓ réalisé, ← remis en planifié, ✕ annulé — et chaque bouton porte un
libellé accessible du point de vue de l'action (« Marquer comme réalisé », pas « Réalisé »).

**Le seuil de la carte de grille est mesuré, pas choisi.** Une carte de grille est
proportionnelle à sa durée (1.6 px/min) : 24 px pour un quart d'heure, 48 px pour une
demi-heure. Deux cibles de 44 px (`docs/decisions.md` §10) ne rentrent pas dans 24 px, et
les laisser déborder recouvrirait la carte suivante, qui deviendrait incliquable. D'où
`hasRoomForStatusActions` : les actions sont rendues **à partir de 30 min**, ce qui couvre
tous les créneaux que l'application produit en pratique (le plus court du jeu de données
fait 30 min). Un créneau de 15 min garde le tap → modale. La carte de liste (blocs
« Nuit »), elle, vit dans le flux : elle les accueille toujours, sans seuil.

**Optimiste, avec verrou.** Le changement s'applique localement d'abord (même leçon que le
glisser-déposer : relire le serveur ferait clignoter la grille et remonter le défilement),
puis `PATCH`. Le créneau concerné est marqué « en vol » et ses boutons sont neutralisés :
sans ce verrou, un double-tap depuis « à vérifier » enchaînerait planifié puis réalisé, les
boutons changeant de place et d'action sous le doigt. En cas de refus du serveur, la
relecture rétablit l'état réel — comme pour un dépôt refusé.

**Pas de confirmation sur « Annulé »** : c'est une action rapide, et l'annulation se défait
par la modale. Un `confirm()` tuerait la rapidité demandée.

### Récapitulatif mensuel

L'écran `/month` répond à une seule question : **combien d'heures déclarer, à qui, et
reste-t-il du volume autorisé ?** Il est calculé par le serveur
(`/api/appointments/summary`), à partir de la **même** lecture que le planning : le récap
ne peut donc pas raconter autre chose que la grille, et le filtre par rôle est appliqué
une seule fois, à la source.

**Les quatre statuts se rangent en trois catégories** — la règle est une constante,
`DECLARED_STATUSES` dans `app/utils/summary.ts` :

| Statut | Catégorie |
| --- | --- |
| `completed` | **réalisé**, donc à déclarer |
| `to_validate` | **à vérifier** : durée ou réalité incertaine, donc **hors total** |
| `planned` | prévisionnel, affiché à part |
| `cancelled` | exclu partout |

Compter `planned` reviendrait à déclarer des passages qui n'ont pas eu lieu ; compter
`to_validate` reviendrait à déclarer une heure dont on n'est pas sûr. Il n'est pas caché pour
autant : il a son propre cumul, affiché à côté du total, et il devient déclarable une fois
vérifié — c'est-à-dire passé en « Réalisé » depuis la modale. C'est ce qui donne son sens au
bandeau « N créneaux à vérifier » de la vue jour.

**Un créneau appartient au mois de sa date de début.** Une veille du 31 à 22:00 → 01:00
est comptée en entier sur le mois du 31 : même convention que l'affichage (bloc « Nuit »
de la date de début), donc pas de prorata inventé.

**Deux axes, deux règles** : un binôme crédite **les deux aidants** (chacun déclare les
heures qu'il a faites) mais **une seule fois le bénéficiaire** (le volume autorisé n'est
pas une réserve consommée deux fois).

**Un total n'est affiché que s'il est complet — mais un aidant voit son périmètre, et le
périmètre de la famille.** Voir n'est pas totaliser :

| Rôle | Par aidant | Par bénéficiaire |
| --- | --- | --- |
| `admin` | tous — complet | tous — complet |
| `assistant` | **lui seul** : celle d'un collègue ignorerait ses autres bénéficiaires | **ses bénéficiaires** : ses heures à lui, plus le volume de la famille (`referenceDeclaredMinutes`, `referenceForecastMinutes`) |
| `viewer` | aucune section | **son bénéficiaire** : tous ses créneaux, tous aidants confondus, donc consommé et autorisé sont exacts |

La règle vit dans `totalsAllowed` (`server/services/appointments.ts`). Le cas de l'aidant est
le seul qui demande un détour : le **volume autorisé appartient au bénéficiaire**, donc son
« reste à planifier » ne peut pas se calculer sur ses seules heures — sinon il lirait
« reste 6 h 30 » alors qu'un collègue en a déjà fait 5, et qu'il ne reste que 1 h 30. Le
serveur renvoie donc, **pour ces bénéficiaires seulement**, les heures de tout le monde
(agrégées, jamais les passages de ses collègues), et la carte le dit : « Prévisionnel 6 h 30
(vos heures) · 90,00 € » à côté de « Après prévisionnel (tous aidants) : reste 1 h 30 ».

**Un total partiel présenté comme un total est pire qu'une section absente** : il a l'air d'un
chiffre à déclarer. C'est pourquoi les deux périmètres ne sont jamais mélangés dans la même
phrase — le suffixe « (vos heures) » ou « (tous aidants) » apparaît **quand le DTO dit que la
ligne n'est pas complète**, jamais selon le rôle deviné par l'écran.

**Le volume autorisé d'un bénéficiaire est la seule référence MENSUELLE** du modèle : le
ratio y est donc exact, et l'écran affiche une barre, le restant, ou le **dépassement**
chiffré en ton danger. Le contrat d'un aidant est **hebdomadaire** : il est affiché en
contexte, sans ratio — le convertir en mois demanderait un facteur, donc une politique.

**Solde prévisionnel du mois** : l'écran répond à « que reste-t-il à faire, et combien cela
coûtera-t-il ? », en quatre cases — prévu, heures prévisionnelles, montant prévisionnel, solde
(`forecastByBeneficiary` et `forecastSummary`, dans `app/utils/summary.ts`, verrouillés par
`test/summary.spec.ts`). Les trois règles qui ne se lisent pas dans le code :

- **Le solde se calcule APRÈS prévisionnel**, jamais sur le seul réalisé : le « Reste » d'une
  carte de bénéficiaire ne parle que de la déclaration. Les deux lignes se complètent, elles ne
  se répètent pas — c'est la distinction que l'écran doit rendre visible.
- **Un total partiel n'est jamais présenté comme complet** : un taux manquant rend le montant du
  mois « À saisir », et les bénéficiaires sans volume autorisé sont comptés à part plutôt que lus
  comme un zéro (même famille de règle que le CSV CESU).
- **Un agrégat positif peut cacher un dépassement** : le nombre de bénéficiaires en dépassement
  est donc affiché à côté du solde, sinon un total rassurant éteindrait l'alerte.

**Le taux horaire est exposé à l'admin et à l'aidant concerné** (`showRates` dans
`summariseMonth`), jamais à un lecteur : un compte « famille » ne reçoit pas le coût employeur.
Pour l'aidant, c'est le taux qui compose **sa** rémunération, et son export CESU le lui donne
déjà — le récapitulatif ne fait que le lui montrer plus tôt. Le champ est **absent** du DTO
quand le rôle n'y a pas droit (et non `null`, qui veut dire « pas encore saisi ») : l'écran
n'écrit donc jamais « À saisir » là où il n'a pas le droit de montrer un montant.

### Exports

Trois documents, produits depuis l'écran où la période est **déjà choisie** — jamais depuis un
écran d'export séparé, qui obligerait à la rechoisir :

| Document | Depuis | Contenu | Qui |
| --- | --- | --- | --- |
| **CSV CESU du mois** | `/month` | une ligne par (aidant × bénéficiaire) — heures, taux, montant — puis le total de l'aidant | admin (tout), aidant (ses lignes) |
| **CSV de la semaine** | `/week` | tous les passages avec leur statut **et leurs tags** (colonne « Tags », tous les tags joints par « , »), puis le total d'heures par aidant (hors annulés), sans montant | admin, aidant (les siens) |
| **Message aux familles** | `/week` | texte prêt à coller, **un par bénéficiaire**, avec bouton « Copier » | admin |

**Un seul jeu de règles, pur et testé au caractère près** : `app/utils/export.ts` construit les
lignes, `app/utils/csv.ts` porte la mécanique du fichier, `app/utils/message.ts` écrit le texte,
`app/utils/money.ts` formate les montants. Les routes ne font que lire la base et appeler ces
constructeurs — un montant faux ne se voit pas à l'écran, il se voit sur un virement.

**Le montant suit le taux du bénéficiaire**, seul taux du modèle. Un aidant qui travaille chez
plusieurs bénéficiaires a donc une ligne par bénéficiaire, chacune à son taux : un total unique
au taux moyen serait invérifiable. Un taux manquant écrit « À saisir » — et **le total de
l'aidant aussi**, dès qu'une de ses lignes manque : un total partiel présenté comme complet
finirait sur une déclaration.

**Le CSV est écrit pour Excel en français** : BOM UTF-8, `;` comme séparateur, CRLF, décimales
à la virgule, champs échappés. Trois détails qui ne lèvent aucune erreur — voir
[`pieges.md`](./pieges.md) §16.

**Les heures sont écrites deux fois** : « 12,50 » (décimal, pour un tableur) et « 12 h 30 » (la
forme que demande le CESU). Deviner laquelle convient serait un pari.

**Le message aux familles** ne liste que les passages **non annulés** de la semaine affichée,
dans l'ordre du calendrier, avec le prénom de l'aidant et les **tags** du passage (à la place
de l'ancien intitulé, même place et même séparateur « , » que le CSV) ; un passage qui franchit
minuit est signalé « (lendemain) », sinon il ressemble à une faute de saisie. Une semaine sans
passage ne produit **aucun** message : un message vide ne s'envoie pas. Il se calcule sur TOUS
les créneaux de la semaine, jamais sur la liste filtrée par aidant — sinon le filtre de l'admin
amputerait le message envoyé à une famille des passages d'un autre aidant.

**Droits** : un lecteur ne produit aucun export (403) — la famille reçoit le message, elle ne
génère ni un fichier de paie ni un relevé d'heures. Un aidant exporte ses propres heures et son
propre montant ; il voit donc les taux des bénéficiaires chez qui il est intervenu, puisque ce
sont eux qui composent son montant.

**Cinq hypothèses assumées**, chacune valant une ligne de code à changer le jour où elles
seront démenties :

| Hypothèse | Conséquence | À revoir si |
| --- | --- | --- |
| **Aucune majoration** (nuit, dimanche, férié) | le montant est `heures × taux`, sans coefficient | un contrat prévoit une majoration : il faudra un taux par période |
| **Un binôme coûte deux fois** | chaque aidant est payé de ses heures, donc l'employeur paie deux fois la même plage | la réalité est un partage, ou un seul aidant payé |
| **Le ton du message aux familles** (« Bonjour, », 🗓️, ⏱️, prénom seul) | le texte est un choix de rédaction | il sonne trop familier ou trop sec : les constantes sont dans `app/utils/message.ts` |
| **Un aidant voit les taux** des bénéficiaires chez qui il intervient | son export **et son récapitulatif** montrent les taux qui composent son montant | ces taux doivent rester confidentiels : ils passeront à `null` dans sa ligne |
| **L'aidant voit le volume restant de la famille** (tous aidants) | son « reste à planifier » est le chiffre réel, pas la part qu'il en a faite | voir les heures des collègues, même agrégées, devient un problème : il faudra masquer le solde et ne garder que ses heures |

### Dates et heures : jamais d'objet `Date` exposé

`app/utils/date.ts` manipule des chaînes `'YYYY-MM-DD'`, `app/utils/duration.ts` des
chaînes `'HH:MM'`. Un `Date` porte un instant et un fuseau : il suffit que le serveur
soit en UTC pour qu'un créneau du 1er du mois s'affiche le 31 chez l'utilisateur. Une
date de planning est une **date civile**, sans fuseau.

`durationInMinutes` gère le **passage de minuit** : 22:00 → 01:00 donne 3 h, pas −21 h.
Sans ce traitement, tous les créneaux de nuit seraient faux. C'est testé.

---

## 7. Données de référence (fixtures)

`server/db/fixtures.ts` produit les créneaux de démonstration, consommés par le seed
local ET par les tests : une seule source, jamais de données dupliquées. Elles incluent
volontairement les cas qui cassent une vue mal conçue : créneau de nuit, une journée
vide, des chevauchements, les quatre statuts. Un test vérifie que ces cas sont toujours là.

Le seed (`pnpm db:seed`) peuple la semaine courante ; la lecture se fait par la route
Nitro `/api/appointments` (plage jour ou semaine). `?fail=1` dans l'URL force la lecture
à échouer : c'est ce qui rend l'état d'erreur exerçable, donc vérifiable.

---

## 8. Ce qui remplace la documentation

Le projet n'a **pas** de longue prose pour garantir son comportement. Chaque règle
importante est vérifiée par du code exécutable :

| Garantie | Vérifiée par |
| --- | --- |
| Passage de minuit, dates civiles, mois civils, couleurs, statuts, fixtures, hachage | `pnpm test` (Vitest, 223 tests) |
| Chevauchement par aidant, jours à cheval sur minuit | `pnpm test` (`conflicts.spec.ts`) |
| Plages horaires acceptées ou refusées, et pourquoi | `pnpm test` (`checkTimeRange`) |
| Tap ou glisser : le seuil qui rend la suppression atteignable | `pnpm test` (`gesture.spec.ts`) |
| Ce qui se déclare, le comptage d'un binôme, le mois d'une nuit | `pnpm test` (`summary.spec.ts`) |
| Transitions d'action rapide, et place disponible sur une carte | `pnpm test` (`status.spec.ts`, `hasRoomForStatusActions`) |
| Montants au centime, heures décimales | `pnpm test` (`money.spec.ts`) |
| CSV : BOM, séparateur, échappement | `pnpm test` (`csv.spec.ts`) |
| Lignes d'export, « À saisir », totaux par aidant | `pnpm test` (`export.spec.ts`) |
| Texte du message aux familles | `pnpm test` (`message.spec.ts`) |
| Saisie des kilomètres : virgule, borne, arrondi, somme de flottants | `pnpm test` (`mileage.spec.ts`) |
| La colonne « Km » du CSV, remplie sur le total seulement | `pnpm test` (`export.spec.ts`) |
| Le filtre par rôle, la création, l'édition, la suppression, les statuts refusés | `pnpm e2e` (`api.cy.ts`) |
| Le CSV réellement servi, et le récap qui raconte la même chose que la liste | `pnpm e2e` (`api.cy.ts`) |
| La saisie des kilomètres du jour, et son effet sur le récapitulatif | `pnpm e2e` (`mileage.cy.ts`) |
| Les actions rapides réellement rendues : combien de boutons, pour quel rôle | `pnpm e2e` (`planning.cy.ts`) |
| La modale : Échap, boucle du focus, défilement verrouillé, focus rendu à la carte | `pnpm e2e` (`planning.cy.ts`) |
| Le glisser-déposer au pointeur, et le refus du chevauchement | `pnpm e2e` (`drag.cy.ts`) |
| La navigation basse à 360 px, sans débordement horizontal | `pnpm e2e` (`mobile.cy.ts`) |
| Le clavier : Entrée et Espace ouvrent la fiche d'une carte | `pnpm e2e` (`week.cy.ts`) |
| Le bouton « Copier » écrit vraiment dans le presse-papiers | `pnpm e2e` (`month.cy.ts`) |
| Scan Tailwind, polices, contrastes ≥ 4,5:1, modèle de défilement | `pnpm verify:css` |
| Aucune classe SCSS déclarée sans consommateur | `pnpm verify:css` |
| Aucun export ou fichier inutilisé | `pnpm lint:code-mort` (knip) |
| Types du domaine, des composants, et des scénarios Cypress | `pnpm typecheck`, `pnpm typecheck:e2e` |

Un fait qui peut être testé **doit** être testé plutôt que documenté : la prose ne
casse pas quand elle devient fausse.

**Les scénarios de bout en bout s'ancrent sur la semaine du seed**, elle-même construite
autour d'aujourd'hui : une date figée cesserait de tester quoi que ce soit la semaine
suivante. Ils **créent leurs propres créneaux et les suppriment**, et n'attendent rien de ce
que la semaine contient — aujourd'hui peut être le jour vide du seed.

**Cypress les couvre, mais il ne tourne pas partout** : `pnpm e2e` exige un navigateur, donc un
poste de travail — pas n'importe quel environnement d'exécution. `pnpm verify` ne le lance
donc pas ; il vérifie seulement que les scénarios **compilent** (`pnpm typecheck:e2e`), ce qui
attrape déjà les erreurs de sélecteur typées et les commandes mal appelées. Le reste — un
scénario qui passe — ne s'obtient qu'en le lançant.

---

## 9. Déploiement Vercel

**Vercel n'héberge aucune base de données** : son offre Postgres a été retirée en 2024
et remplacée par un Marketplace. Le filesystem des fonctions serverless est éphémère,
donc ni SQLite sur fichier ni stockage local persistant : la base doit être joignable
par le réseau.

| Variable | Usage | Portée |
| --- | --- | --- |
| `DATABASE_URL` | chaîne de connexion Postgres Neon | serveur uniquement |
| `NUXT_SESSION_PASSWORD` | chiffrement des cookies de session, 32 caractères minimum | serveur uniquement |

- Un secret ne doit **jamais** être préfixé `NUXT_PUBLIC_` : cela l'exposerait au client.
- `.env` est ignoré par Git ; `.env.example` documente les clés sans valeur.
- Les valeurs de production sont saisies dans l'interface Vercel, jamais dans le dépôt.

**Mise en place** : ajouter l'intégration Postgres (Neon) au projet Vercel, ce qui
injecte `DATABASE_URL` en Preview et en Production ; générer
`NUXT_SESSION_PASSWORD` avec `openssl rand -base64 32` ; ajouter l'adaptateur Vercel.

**Points de vigilance** :

- **Pooling** : les fonctions serverless ouvrent beaucoup de connexions courtes.
  Utiliser l'endpoint *pooled* de Neon pour le trafic applicatif, et l'endpoint direct
  uniquement pour les migrations.
- **Migrations** : les exécuter depuis un poste ou une CI, jamais depuis une fonction.

---

## 10. Conventions de code

**Langue** : le **code est en anglais** (identifiants, fichiers, types, routes d'API) et
l'**interface est en français** (libellés, messages, textes d'écran) — c'est la règle 1
d'`AGENTS.md`, et elle a remplacé la convention inverse. Les commentaires sont en
français, comme la documentation. La base est en anglais elle aussi : le français ne vit
qu'à l'affichage, jamais dans un identifiant.

**Nommage** : composants en PascalCase dans un dossier par bloc applicatif (le nom du
dossier devient le préfixe du composant) ; composables `useXxx()` ; utilitaires en
camelCase ; constantes en SCREAMING_SNAKE_CASE ; classes CSS en BEM
(`.bloc__element--modificateur`), nommées **en français** comme le domaine affiché
(`semaine__grille`, `creneau-horaire`).

**Style CSS : `@apply` en priorité**, dans un partial SCSS, jamais de longue liste
d'utilitaires dans un template. Tailwind reste la source des valeurs : les jetons
vivants sont dans le bloc `@theme` de `main.scss`, pas dans un `tailwind.config.js`
(qui n'existe pas en Tailwind 4).

### Accessibilité et zones de frappe

- **44 px minimum de hauteur**, y compris pour `.btn--sm` : c'est la largeur et la
  taille de police qui diminuent, **jamais la hauteur de frappe**. Une cible plus
  courte se rate sur un téléphone tenu d'une main.
- Ne jamais retirer le focus visible : le style global est dans `base/_root.scss`.
- Un bouton icône seul porte un `aria-label`.
- L'état actif d'un lien de navigation passe par `aria-current="page"`, pas par une
  classe conditionnelle.

Après toute intervention sur le pipeline CSS : `pnpm build && pnpm verify:css`.
