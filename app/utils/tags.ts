// Tags : le vocabulaire partagé des actes d'un créneau. Ces règles sont PURES et testées :
// elles décident de ce qui est un doublon, donc de ce que la base contient.

/** Nombre maximum de tags sur un créneau. Borne d'affichage et d'export, pas une règle métier. */
export const MAX_TAGS = 10

/** Nombre de tags que montre une carte de la grille horaire (les exports les portent tous). */
export const VISIBLE_TAGS = 3

/**
 * Clé de dédoublonnage : espaces réduits, minuscules. « Courses » et « courses » sont le
 * même tag ; « Préparation » et « preparation » en sont deux, volontairement.
 *
 * **La règle est écrite deux fois** : ici, et dans la migration qui convertit les anciens
 * intitulés (`server/db/migrations/0002_heavy_vargas.sql`,
 * `lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))`). La changer d'un côté oblige à la
 * changer de l'autre. Le repli des accents n'est PAS fait : l'extension `unaccent` n'est pas
 * garantie sur Neon, et une seconde règle approximative créerait des doublons silencieux.
 */
export function tagKey(name: string): string {
  return normalizeSpaces(name).toLowerCase()
}

/** Espaces de bord retirés, espaces internes réduits à un seul. */
function normalizeSpaces(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Noms prêts à écrire : vides retirés, espaces normalisés, doublons de clé retirés — le
 * PREMIER garde sa place et sa graphie, parce que c'est celui que la personne vient de saisir.
 */
export function cleanTagNames(names: string[]): string[] {
  const seen = new Set<string>()
  const clean: string[] = []

  for (const raw of names) {
    const name = normalizeSpaces(raw)
    if (!name) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    clean.push(name)
  }

  return clean
}

/**
 * Motif de refus d'une liste de tags ; `null` quand elle est acceptable.
 *
 * Même forme que `checkTimeRange` (`app/utils/grid.ts`) : une règle PURE, appelée une seule
 * fois — à l'écriture — et testée sans base. Le message affiché vit à côté, dans le service.
 */
export type TagProblem = 'empty' | 'too-many'

/** Contrôle d'une liste de tags : au moins un, au plus `MAX_TAGS`. */
export function checkTagNames(names: string[]): TagProblem | null {
  const clean = cleanTagNames(names)
  if (clean.length === 0) return 'empty'
  if (clean.length > MAX_TAGS) return 'too-many'
  return null
}

/**
 * Ce qu'une carte montre, et ce qu'elle cache : trois pastilles puis « +N ». `hidden` existe
 * pour que l'écran puisse le DIRE au lieu de laisser croire que trois tags sont tous les tags.
 */
export function visibleTags(names: string[], limit = VISIBLE_TAGS): { shown: string[], hidden: number } {
  return {
    shown: names.slice(0, limit),
    hidden: Math.max(0, names.length - limit),
  }
}

/**
 * Mise en forme unique des tags (export CSV, message aux familles). Une seule fonction, donc
 * un seul séparateur : deux copies finiraient par ne plus écrire la même chose.
 */
export function tagLine(names: string[]): string {
  return names.join(', ')
}

/**
 * Nom canonique du catalogue pour un nom saisi : taper « courses » quand « Courses » existe
 * ajoute le tag EXISTANT, avec la graphie déjà enregistrée, au lieu d'en créer un second.
 */
export function canonicalTagName(name: string, catalogue: { name: string }[]): string {
  const clean = normalizeSpaces(name)
  const key = clean.toLowerCase()
  return catalogue.find(tag => tagKey(tag.name) === key)?.name ?? clean
}

/**
 * Le texte tapé peut-il devenir un tag NEUF ? Renvoie son nom nettoyé, ou `null`.
 *
 * C'est la règle de la ligne « Créer « … » » de l'autocomplete. Elle refuse trois cas :
 * - une frappe vide (rien à créer) ;
 * - un nom déjà retenu sur ce créneau (on n'ajoute pas deux fois le même) ;
 * - un nom déjà au catalogue (le tag existe : il faut le CHOISIR, pas le dupliquer).
 *
 * Elle ne regarde pas si le catalogue a proposé quelque chose : taper « Aide aux courses »
 * quand « Aide à la toilette » existe doit rester créable — c'est tout l'intérêt.
 */
export function creatableTagName(
  query: string,
  catalogue: { name: string }[],
  chosen: string[],
): string | null {
  const clean = normalizeSpaces(query)
  if (!clean) return null

  const key = clean.toLowerCase()
  if (chosen.some(name => tagKey(name) === key)) return null
  if (catalogue.some(tag => tagKey(tag.name) === key)) return null

  return clean
}

/** Nombre de suggestions offertes : au-delà, on affine la frappe au lieu de faire défiler. */
export const SUGGESTION_LIMIT = 8

/** Les lignes de l'autocomplete : suggestions du catalogue, PUIS création éventuelle. */
export interface TagOptions {
  matches: { id: string, name: string }[]
  /** Nom à créer, quand la frappe ne correspond à rien d'existant. */
  creation: string | null
}

/**
 * Ce que la liste propose pour une frappe : les tags existants qui la contiennent, puis la
 * création si la frappe ne correspond à aucun tag — c'est ce qui permet de créer un tag dont
 * le nom ressemble à un voisin.
 *
 * Deux règles d'ORDRE, qui ne sont pas de la mise en page :
 * - **le nom exact d'abord**, puis les noms qui commencent par la frappe, puis les autres :
 *   taper « Courses » et valider doit choisir « Courses », pas « Aide aux courses » ;
 * - **la création en dernier**, pour que le défaut d'« Entrée » reste la première suggestion,
 *   et jamais un nouveau tag approximatif.
 */
export function tagOptions(
  query: string,
  catalogue: { id: string, name: string }[],
  chosen: string[],
  limit = SUGGESTION_LIMIT,
): TagOptions {
  const needle = tagKey(query)
  const taken = new Set(chosen.map(tagKey))

  /** 0 = nom exact, 1 = commence par la frappe, 2 = la contient. */
  const rank = (name: string): number => {
    const key = tagKey(name)
    if (key === needle) return 0
    return key.startsWith(needle) ? 1 : 2
  }

  const matches = catalogue
    .filter(tag => !taken.has(tagKey(tag.name)))
    .filter(tag => needle === '' || tagKey(tag.name).includes(needle))
    // `sort` est stable : à rang égal, l'ordre du catalogue (déjà trié par nom) est conservé.
    .sort((a, b) => rank(a.name) - rank(b.name))
    .slice(0, limit)

  return { matches, creation: creatableTagName(query, catalogue, chosen) }
}

/** Nombre de lignes affichables : le curseur les parcourt toutes, création comprise. */
export function tagOptionCount(options: TagOptions): number {
  return options.matches.length + (options.creation === null ? 0 : 1)
}

/**
 * Ce que fait « Entrée » : le nom de la ligne surlignée. `null` quand il n'y a rien à valider.
 *
 * Deux garde-fous, chacun pour un piège réel :
 * - le catalogue s'affiche aussi **champ vide** (on le découvre) : « Entrée » ne doit pas y
 *   choisir la première ligne au hasard — il faut avoir tapé, ou descendu le curseur ;
 * - le curseur est **borné** ici : une liste qui rétrécit pendant la frappe laisserait sinon
 *   un index qui ne désigne plus rien, et « Entrée » serait inerte.
 */
export function commitTag(options: TagOptions, highlighted: number, query: string): string | null {
  if (query.trim() === '' && highlighted === 0) return null

  const rows = tagOptionCount(options)
  if (rows === 0) return null

  const index = Math.min(Math.max(highlighted, 0), rows - 1)
  const match = options.matches[index]
  if (match) return match.name

  return options.creation
}
