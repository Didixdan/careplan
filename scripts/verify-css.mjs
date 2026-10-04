#!/usr/bin/env node
/**
 * Garde-fou du design system : Tailwind débranché, police en repli silencieux et contraste
 * insuffisant ne cassent aucun build — ils cassent le style, sans erreur.
 *
 * Tout est vérifié sur le CSS RÉELLEMENT PRODUIT : les couleurs de badge sont lues dans les
 * règles compilées, jamais recopiées depuis le SCSS.
 *
 * Usage : `pnpm verify:css` (après `pnpm build`). Sortie 1 en cas d'échec.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = process.cwd()
const CSS_DIR = resolve(ROOT, '.output/public/_nuxt')
const APP_DIR = resolve(ROOT, 'app')

/** Libellés français des deux thèmes, pour les messages de sortie. */
const THEME_LABELS = { light: 'clair', dark: 'sombre' }

/** Seuil WCAG AA pour du texte de taille normale. */
const MIN_CONTRAST = 4.5

const FORBIDDEN = [
  { token: '@apply', why: 'directive Tailwind non résolue (SCSS non traité)' },
  { token: '@tailwind', why: 'directive Tailwind non résolue' },
  { token: '--theme(', why: 'placeholder du compilateur Tailwind non résolu' },
]

/**
 * Noms déclarés par les paquets Fontsource, pas les noms « naturels » : une faute de nom
 * provoque un repli silencieux sur la pile système (docs/decisions.md §4).
 */
const FONT_FAMILIES = ['Instrument Sans Variable', 'Anton', 'Space Grotesk Variable']

/**
 * Témoin de scan : `p-[13.5px]` est une valeur arbitraire UNIQUE dans le projet, écrite
 * dans un seul template. Un nom de classe inventé ne conviendrait pas : Tailwind ne génère
 * que des utilitaires valides, un nom arbitraire serait absent même si le scan fonctionne.
 */
const SCAN_MARKER = { source: 'p-[13.5px]', selector: '.p-\\[13\\.5px\\]' }

/** Témoins secondaires : classes présentes uniquement dans les templates. */
const TEMPLATE_ONLY_CLASSES = ['gap-4', 'flex-wrap', 'py-4']

/**
 * Les huit couleurs d'aidant doivent être PRÉSENTES dans le CSS compilé : Tailwind élague
 * les variables qu'il ne voit pas au scan, et celles-ci sont posées en style inline construit
 * à l'exécution (docs/pieges.md §8). Le bloc `@theme static` de main.scss les expose.
 */
const ASSISTANT_COLOR_VARIABLES = Array.from({ length: 8 }, (_, i) => `--color-assistant-${i + 1}`)

/** Classes du design system dont la disparition casserait un écran. */
const REQUIRED_CLASSES = [
  'semaine__grille',
  'semaine__colonne',
  'semaine__bloc',
  'semaine__corps',
  'semaine__vide',
  'creneau',
  'creneau__temps',
  'creneau__heure',
  'duree__piste',
  'duree__remplissage',
]

/**
 * Borne du cadre d'un jour de la vue semaine : quatre heures de grille (1 h = 96 px,
 * `PX_PER_MINUTE` = 1,6). Alignée sur une heure entière, sinon une ligne horaire serait coupée
 * en deux.
 */
const DAY_BOX_MAX_HEIGHT = '24rem'

/**
 * PRÉFIXES de familles dont les modificateurs sont composés à l'exécution.
 *
 * Le critère est la FAMILLE, pas le nom : lister `btn--primary` individuellement
 * blanchirait n'importe quelle classe `btn--*`, y compris une classe morte. Ici,
 * seules les familles réellement pilotées par une prop ou un `computed` sont
 * exemptées, et un modificateur oublié dans une autre famille est bien signalé.
 *
 * Vérifié pour chaque préfixe : il existe un `computed` ou une interpolation qui
 * construit le nom de classe à partir d'une prop.
 */
const DYNAMIC_FAMILIES = [
  '.btn', // UiBouton : `btn--${props.variant}`, `btn--${props.size}`
  '.badge', // UiBadge : `badge--${props.tone}`
  '.card', // UiCarte : blocs et modificateurs choisis par props booléennes
]

// `clairSel` / `sombreSel` désignent les sélecteurs compilés. Un sélecteur absent est un
// échec assumé : mieux vaut signaler une disparition que sauter un contrôle en silence.
const BADGES = [
  { name: 'badge--neutral', lightSelector: '.badge--neutral', darkSelector: '.dark .badge--neutral' },
  { name: 'badge--primary', lightSelector: '.badge--primary', darkSelector: '.dark .badge--primary' },
  { name: 'badge--accent', lightSelector: '.badge--accent', darkSelector: '.dark .badge--accent' },
  { name: 'badge--success', lightSelector: '.badge--success', darkSelector: '.dark .badge--success' },
  { name: 'badge--warning', lightSelector: '.badge--warning', darkSelector: '.dark .badge--warning' },
  { name: 'badge--danger', lightSelector: '.badge--danger', darkSelector: '.dark .badge--danger' },
  {
    name: 'badge--solid primary',
    lightSelector: '.badge--solid.badge--primary',
    darkSelector: '.dark .badge--solid.badge--primary',
  },
  {
    name: 'badge--solid success',
    lightSelector: '.badge--solid.badge--success',
    darkSelector: '.dark .badge--solid.badge--success',
  },
  {
    name: 'badge--solid danger',
    lightSelector: '.badge--solid.badge--danger',
    darkSelector: '.dark .badge--solid.badge--danger',
  },
]

/** Couples de texte courant à contrôler, dans les deux thèmes. */
const CONTRAST_PAIRS = [
  { name: 'ink sur surface', light: ['--color-ink', '--color-surface'], dark: ['--color-ink', '--color-surface'] },
  {
    name: 'ink-soft sur surface',
    light: ['--color-ink-soft', '--color-surface'],
    dark: ['--color-ink-soft', '--color-surface'],
  },
  {
    name: 'ink-muted sur canvas',
    light: ['--color-ink-muted', '--color-canvas'],
    dark: ['--color-ink-muted', '--color-canvas'],
  },
  // L'encre d'ALERTE est définie par mode : `--color-danger` (rouge de remplissage) reste
  // illisible en texte sur une surface sombre, d'où un jeton distinct et ce contrôle.
  {
    name: 'danger-ink sur surface',
    light: ['--color-danger-ink', '--color-surface'],
    dark: ['--color-danger-ink', '--color-surface'],
  },
  // Pastilles de tags (cartes et sélecteur) : encre douce sur fond atténué. C'est du texte de
  // 0,65–0,7 rem, donc le seuil de 4,5:1 s'applique pour de bon.
  {
    name: 'ink-soft sur surface-muted',
    light: ['--color-ink-soft', '--color-surface-muted'],
    dark: ['--color-ink-soft', '--color-surface-muted'],
  },
]

/**
 * Découpe le bundle en règles `sélecteur { corps }`. Les `@media` et `@layer` n'ont pas de
 * sélecteur commençant par `.`, ils sont donc ignorés naturellement.
 */
function extractRules(bundle) {
  const rules = []
  for (const [, selector, body] of bundle.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const trimmed = selector.trim()
    if (!trimmed) continue
    rules.push({ selector: trimmed, declarations: parseDeclarations(body) })
  }
  return rules
}

/** Transforme `a: 1; b: 2` en Map, dernière valeur gagnante. */
function parseDeclarations(body) {
  const declarations = new Map()
  for (const [, property, value] of body.matchAll(/([a-z-]+)\s*:\s*([^;]+)/gi)) {
    declarations.set(property.toLowerCase(), value.trim())
  }
  return declarations
}

/**
 * Dernière déclaration non `revert` pour un sélecteur : `revert` sur `color` signifie que la
 * règle n'impose pas d'encre, et on passe.
 */
function resolveDeclaration(rules, selectors, property) {
  let found = null
  for (const rule of rules) {
    if (!selectors.has(rule.selector)) continue
    const value = rule.declarations.get(property)
    if (value !== undefined && value !== 'revert') found = value
  }
  return found
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/** oklch(L C h) → [r, g, b]. L et C acceptent % ou décimal. */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  const encode = (u) => {
    const v = u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055
    return Math.round(clamp(v, 0, 1) * 255)
  }
  return [encode(red), encode(green), encode(blue)]
}

function luminance([r, g, b]) {
  const channel = (u) => {
    const v = u / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

// Résout `#hex`, `oklch()`, `color-mix()` ou un nom de variable, en respectant la portée
// (`.dark` redéfinit certaines variables).
function resolveColor(value, scopes, seen = new Set()) {
  const raw = value.trim()

  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ]
  }

  const variableName = raw.startsWith('--')
    ? raw
    : raw.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1]

  if (variableName) {
    if (seen.has(variableName)) throw new Error(`référence circulaire sur ${variableName}`)
    let target
    for (const scope of scopes) {
      if (scope.has(variableName)) {
        target = scope.get(variableName)
        break
      }
    }
    if (target === undefined) throw new Error(`variable ${variableName} introuvable`)
    seen.add(variableName)
    return resolveColor(target, scopes, seen)
  }

  // Fond composé par opacité (`color-mix(in oklab, …)`), émis par Tailwind : on le résout
  // pour MESURER le contraste obtenu, au lieu de le rejeter.
  const mix = raw.match(/^color-mix\(in oklab,\s*(.+?)\s+([\d.]+)%,?\s*transparent\)/i)
  if (mix) {
    const base = resolveColor(mix[1], scopes, seen)
    const alpha = Number(mix[2]) / 100
    // Le fond de référence est le premier scope connu : la surface du thème.
    const reference = scopes[0].get('--color-surface')
    const under = reference ? resolveColor(reference, scopes, new Set(seen)) : [255, 255, 255]
    return base.map((v, i) => Math.round(v * alpha + under[i] * (1 - alpha)))
  }

  const oklch = raw.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i)
  if (oklch) {
    const l = oklch[2] === '%' ? Number(oklch[1]) / 100 : Number(oklch[1])
    return oklchToRgb(l, Number(oklch[3]), Number(oklch[4]))
  }

  throw new Error(`format de couleur non reconnu : ${raw.slice(0, 40)}`)
}

const escapeForRegExp = value => value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
const selectorPattern = className =>
  new RegExp(`\\.${escapeForRegExp(className)}(?=[{:,])`)

const failures = []
const fail = message => failures.push(message)
const ok = message => console.log(`  ✓ ${message}`)

function collectFiles(dir, extension) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      found.push(...collectFiles(full, extension))
    }
    else if (entry.name.endsWith(extension)) {
      found.push(full)
    }
  }
  return found
}

function declarationInBlock(bundle, selector, property) {
  const block = bundle.match(new RegExp(`${escapeForRegExp(selector)}\\s*\\{([^}]*)\\}`))
  if (!block) return null
  const declaration = block[1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  return declaration ? declaration[1].trim() : null
}

function checkDirectives(bundle) {
  for (const { token, why } of FORBIDDEN) {
    const count = bundle.split(token).length - 1
    if (count > 0) fail(`« ${token} » présent ${count}× dans le CSS — ${why}`)
    else ok(`aucun « ${token} » résiduel`)
  }
}

function checkScan(bundle) {
  if (!bundle.includes(SCAN_MARKER.selector)) {
    fail(
      `« ${SCAN_MARKER.selector} » absent du CSS — `
      + 'le scan des composants .vue est à l\'arrêt (Tailwind mal branché)',
    )
  }
  else {
    ok(`témoin de scan « ${SCAN_MARKER.selector} » généré`)
  }

  for (const className of TEMPLATE_ONLY_CLASSES) {
    if (!selectorPattern(className).test(bundle)) {
      fail(`« .${className} » absent du CSS — classe de template non générée`)
    }
    else {
      ok(`classe de template « .${className} » générée`)
    }
  }

  const declarers = collectFiles(APP_DIR, '.vue')
    .filter(file => readFileSync(file, 'utf8').includes(SCAN_MARKER.source))
  if (declarers.length === 0) {
    fail(
      `le témoin de scan « ${SCAN_MARKER.source} » n'existe plus dans app/ : `
      + 'le rétablir dans app/pages/styleguide.vue',
    )
  }
  else {
    ok(`témoin de scan toujours déclaré (${declarers.length} fichier(s))`)
  }
}

function checkFonts(bundle) {
  for (const family of FONT_FAMILIES) {
    if (!bundle.includes(family)) {
      fail(
        `police « ${family} » absente du CSS compilé — `
        + 'nom de famille erroné (repli silencieux) ou import retiré',
      )
    }
    else {
      ok(`police « ${family} » présente`)
    }
  }
}

// Une variable de thème élaguée par Tailwind ne casse aucun build : elle rend simplement un
// élément invisible. D'où ce contrôle explicite.
/**
 * Détecte les classes SCSS déclarées que personne ne consomme.
 *
 * Mesuré avant ce contrôle : `.jour__nom`, `.rail`, `.skeleton--group` et
 * `.creneau--en-cours` étaient déclarées, stylées, et jamais appliquées. Rien ne
 * le signalait — ni le build, ni le typecheck, ni le lint. Une classe morte n'est
 * pas inoffensive : elle donne l'illusion d'un composant existant et fait perdre
 * du temps à qui la cherche dans les templates.
 *
 * Le contrôle lit les `.vue` demandés et les `.ts` de `app/` (les classes y sont
 * posées par des `computed`), en ignorant les fichiers SCSS eux-mêmes.
 */
function checkDeadClasses() {
  const sources = [
    ...collectFiles(APP_DIR, '.vue'),
    ...collectFiles(APP_DIR, '.ts'),
  ].filter(file => !file.endsWith('.scss'))

  const consumers = sources.map(file => readFileSync(file, 'utf8')).join('\n')

  const scssFiles = collectFiles(resolve(APP_DIR, 'assets/scss'), '.scss')
  const declared = new Set()

  for (const file of scssFiles) {
    const content = readFileSync(file, 'utf8')
    // Sélecteurs de classe, en ignorant les variables Sass (`$radius-pill`) et les
    // utilitaires Tailwind appliqués via `@apply` (ils ne sont pas des sélecteurs).
    for (const [, name] of content.matchAll(/^\s*\.([a-z][a-z0-9_-]*)/gim)) {
      declared.add(name)
    }
  }

  const dead = [...declared].filter((className) => {
    if (DYNAMIC_FAMILIES.some(prefix => `.${className}`.startsWith(prefix))) return false
    // Une classe est consommée si son nom apparaît dans un template ou un computed.
    return !new RegExp(`(?<![\\w-])${className.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![\\w-])`).test(consumers)
  })

  if (dead.length > 0) {
    for (const className of dead) {
      fail(
        `.${className} est déclarée en SCSS mais consommée nulle part — `
        + 'la supprimer, l\'utiliser, ou l\'ajouter à FAMILLES_DYNAMIQUES si son nom est composé à l\'exécution',
      )
    }
  }
  else {
    ok(`${declared.size} classes SCSS déclarées, toutes consommées`)
  }
}

function checkVariablesAndClasses(bundle) {
  const missing = ASSISTANT_COLOR_VARIABLES.filter(variable => !bundle.includes(`${variable}:`))
  if (missing.length > 0) {
    fail(
      `${missing.length} variable(s) d'aidant absente(s) du CSS (${missing.join(', ')}) — `
      + 'le bloc `@theme static` de main.scss a-t-il été modifié ? '
      + 'Sans `static`, Tailwind élague les variables non détectées au scan.',
    )
  }
  else {
    ok(`${ASSISTANT_COLOR_VARIABLES.length} variables de couleur d'aidant émises`)
  }

  for (const className of REQUIRED_CLASSES) {
    if (!selectorPattern(className).test(bundle)) {
      fail(`« .${className} » absente du CSS — un écran du planning serait dégradé`)
    }
    else {
      ok(`classe « .${className} » présente`)
    }
  }
}

/**
 * Verrouille le modèle de défilement de la vue semaine (`docs/pieges.md` §13).
 *
 * Les jours sont empilés en grille : plus AUCUN défilement horizontal, et le défilement d'un
 * jour vit dans `.semaine__corps`. Trois propriétés y sont verrouillées, chacune corrigeant une
 * panne silencieuse :
 *
 * - `max-height` : sans borne, la page ferait 10 000 px ;
 * - `min-height: 0` : dans une colonne flex, sans lui l'enfant refuse de rétrécir et la borne
 *   est ignorée ;
 * - `overscroll-behavior` : mis à `contain`, il ARRÊTE le geste au bout du jour au lieu de le
 *   laisser continuer vers le jour suivant (il ne le redirige jamais).
 */
/**
 * Lit une déclaration sur toutes les règles portant un sélecteur. Nécessaire car Tailwind
 * émet `overflow: auto hidden` (raccourci, sens x puis y) : chercher seulement `overflow-x`
 * conclurait à tort que le défilement a disparu.
 */
function declarationsForSelector(rules, selector) {
  const merged = new Map()
  for (const rule of rules) {
    if (rule.selector !== selector) continue
    for (const [property, value] of rule.declarations) merged.set(property, value)
  }
  return merged
}

/** `overflow: auto hidden` → `{ x: 'auto', y: 'hidden' }`. */
function axesOverflow(declarations) {
  const shorthand = declarations.get('overflow')
  if (shorthand) {
    const parts = shorthand.trim().split(/\s+/)
    return { x: parts[0] ?? '', y: parts[1] ?? parts[0] ?? '' }
  }
  return { x: declarations.get('overflow-x') ?? '', y: declarations.get('overflow-y') ?? '' }
}

function checkWeekLayout(bundle) {
  try {
    const rules = extractRules(bundle)

    const grid = declarationsForSelector(rules, '.semaine__grille')
    if (grid.size === 0) {
      fail('« .semaine__grille » introuvable dans le CSS — la vue semaine a disparu')
      return
    }

    if (grid.get('display') !== 'grid') {
      fail(`.semaine__grille : « display: grid » attendu, trouvé « ${grid.get('display') || 'absent'} » — les jours ne seraient plus disposés en blocs`)
    }
    else {
      ok('.semaine__grille dispose les jours en grille')
    }

    const axes = axesOverflow(grid)
    if (axes.x.includes('auto') || axes.x.includes('scroll')) {
      fail(`.semaine__grille : défilement horizontal « ${axes.x} » — la vue semaine ne défile plus en horizontal, le défilement d'un jour vit dans .semaine__corps`)
    }
    else {
      ok('.semaine__grille : aucun défilement horizontal')
    }

    if (grid.get('scroll-snap-type')?.includes('x')) {
      fail('.semaine__grille : accroche horizontale « snap-x » de retour — elle n\'a plus de zone de défilement à aimanter')
    }
    else {
      ok('.semaine__grille : aucune accroche horizontale')
    }

    if (grid.get('max-height')) {
      fail(`.semaine__grille : max-height « ${grid.get('max-height')} » — la borne appartient au cadre d'un jour (.semaine__corps)`)
    }
    else {
      ok('.semaine__grille : aucune hauteur bornée')
    }

    const corps = declarationsForSelector(rules, '.semaine__corps')
    if (corps.size === 0) {
      fail('« .semaine__corps » introuvable dans le CSS — le cadre défilant d\'un jour a disparu')
      return
    }

    const corpsAxes = axesOverflow(corps)
    if (!corpsAxes.y.includes('auto')) {
      fail(`.semaine__corps : défilement vertical attendu, trouvé « ${corpsAxes.y || 'absent'} » — un jour ne montrerait que ses premières heures`)
    }
    else {
      ok('.semaine__corps défile verticalement')
    }

    if (corps.get('max-height') !== DAY_BOX_MAX_HEIGHT) {
      fail(`.semaine__corps : max-height « ${corps.get('max-height') || 'absent'} » au lieu de « ${DAY_BOX_MAX_HEIGHT} » — la borne vaut quatre heures de grille, sans elle la page devient interminable`)
    }
    else {
      ok(`.semaine__corps borné à ${DAY_BOX_MAX_HEIGHT} (quatre heures de grille)`)
    }

    if (corps.get('min-height') !== '0') {
      fail(`.semaine__corps : min-height « ${corps.get('min-height') || 'absent'} » au lieu de « 0 » — dans une colonne flex, sans lui la borne est ignorée (docs/pieges.md §13)`)
    }
    else {
      ok('.semaine__corps : min-height 0, la colonne flex accepte de rétrécir')
    }

    const overscroll = corps.get('overscroll-behavior')
    if (overscroll !== undefined && overscroll !== 'auto') {
      fail(`.semaine__corps : overscroll-behavior « ${overscroll} » — le geste s'arrêterait au bout du jour au lieu de continuer vers le jour suivant`)
    }
    else {
      ok('.semaine__corps : le geste se chaîne à la page')
    }
  }
  catch (error) {
    fail(`vérification du défilement de la semaine impossible : ${error.message}`)
  }
}

function checkShadows(bundle) {
  const shadow = declarationInBlock(bundle, '.card', 'box-shadow')
  if (shadow) {
    fail(`.card porte une box-shadow (${shadow}) — une carte est posée, pas flottante`)
  }
  else {
    ok('.card ne porte aucune ombre')
  }

  if (!/--shadow-float\s*:/.test(bundle)) {
    fail('--shadow-float absent du thème — les éléments flottants n\'auraient plus d\'élévation')
  }
  else {
    ok('--shadow-float disponible pour les éléments flottants')
  }

  if (/--shadow-card\s*:/.test(bundle) || /--shadow-raised\s*:/.test(bundle)) {
    fail('--shadow-card ou --shadow-raised réapparus : les ombres doivent rester réservées au flottant')
  }
  else {
    ok('aucune ombre décorative dans le thème')
  }
}

/** Construit les portées de variables : racine, puis `.dark`. */
function buildScopes(bundle) {
  // Les variables sombres sont émises APRÈS celles du clair : un balayage global les verrait
  // « gagner » et les contrôles du thème clair testeraient le thème sombre. On retire donc le
  // bloc `.dark` avant de construire la portée claire.
  const withoutDark = bundle.replace(/\.dark\s*\{[^}]*\}/, '')
  const root = new Map()
  for (const [, name, value] of withoutDark.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    root.set(name, value.trim())
  }

  const dark = new Map(root)
  const darkBlock = bundle.match(/\.dark\s*\{([^}]*)\}/)
  if (darkBlock) {
    for (const [, name, value] of darkBlock[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
      dark.set(name, value.trim())
    }
  }
  return { root, dark }
}

function checkContrasts(bundle) {
  const rules = extractRules(bundle)
  const scopes = buildScopes(bundle)

  console.log(`\n  Contrastes réels des badges (seuil ${MIN_CONTRAST}:1)`)

  for (const badge of BADGES) {
    for (const [theme, selector] of [['light', badge.lightSelector], ['dark', badge.darkSelector]]) {
      const sets = new Set([selector, selector.replace('.dark ', '')])
      const selected = rules.filter(r =>
        [...sets].some(s => r.selector === s || r.selector.includes(s)),
      )

      if (selected.length === 0) {
        fail(`${badge.name} (${THEME_LABELS[theme]}) : sélecteur « ${selector} » introuvable dans le CSS`)
        continue
      }

      const ink = resolveDeclaration(rules, sets, 'color')
      const backgroundColor = resolveDeclaration(rules, sets, 'background-color')

      if (!ink || !backgroundColor) {
        fail(
          `${badge.name} (${THEME_LABELS[theme]}) : color ou background-color introuvable — `
          + 'un badge doit déclarer une encre ET un fond, jamais hériter du fond de la surface',
        )
        continue
      }

      try {
        const scope = theme === 'dark' ? scopes.dark : scopes.root
        const ratio = contrast(resolveColor(ink, [scope]), resolveColor(backgroundColor, [scope]))
        const label = `${badge.name} (${THEME_LABELS[theme]})`
        if (ratio < MIN_CONTRAST) {
          fail(`${label} : contraste ${ratio.toFixed(2)} < ${MIN_CONTRAST}`)
        }
        else {
          ok(`${label} — ${ratio.toFixed(2)}:1`)
        }
      }
      catch (error) {
        fail(`${badge.name} (${THEME_LABELS[theme]}) : ${error.message}`)
      }
    }
  }

  console.log('\n  Contrastes du texte courant')

  for (const pair of CONTRAST_PAIRS) {
    for (const theme of ['light', 'dark']) {
      const [ink, backgroundColor] = pair[theme]
      try {
        const scope = theme === 'dark' ? scopes.dark : scopes.root
        const ratio = contrast(resolveColor(ink, [scope]), resolveColor(backgroundColor, [scope]))
        const label = `${pair.name} (${THEME_LABELS[theme]})`
        if (ratio < MIN_CONTRAST) {
          fail(`${label} : contraste ${ratio.toFixed(2)} < ${MIN_CONTRAST}`)
        }
        else {
          ok(`${label} — ${ratio.toFixed(2)}:1`)
        }
      }
      catch (error) {
        fail(`${pair.name} (${THEME_LABELS[theme]}) : ${error.message}`)
      }
    }
  }
}

function main() {
  let files
  try {
    files = collectFiles(CSS_DIR, '.css')
  }
  catch {
    console.error(`\n  ✗ Dossier introuvable : ${CSS_DIR}`)
    console.error('    Lancez `pnpm build` avant `pnpm verify:css`.\n')
    process.exit(1)
  }

  if (files.length === 0) {
    console.error(`\n  ✗ Aucun fichier CSS dans ${CSS_DIR}. Lancez \`pnpm build\`.\n`)
    process.exit(1)
  }

  console.log(`\n  Vérification de ${files.length} fichier(s) CSS…\n`)
  const bundle = files.map(file => readFileSync(file, 'utf8')).join('\n')

  checkDirectives(bundle)
  checkScan(bundle)
  checkFonts(bundle)
  checkShadows(bundle)
  checkWeekLayout(bundle)
  checkVariablesAndClasses(bundle)
  checkDeadClasses()
  checkContrasts(bundle)

  if (failures.length > 0) {
    console.error('')
    for (const message of failures) console.error(`  ✗ ${message}`)
    console.error(`\n  Échec : ${failures.length} problème(s) dans le design system.\n`)
    process.exit(1)
  }

  console.log('\n  Design system conforme.\n')
}

main()
