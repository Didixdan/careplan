import { eq, inArray } from 'drizzle-orm'
import { cleanTagNames, tagKey } from '../../app/utils/tags'
import type { Tag, TagOption } from '../../shared/types/planning'
import { appointmentTags, tags } from '../db/schema'
import { useDb } from '../utils/db'

/**
 * Vocabulaire partagé des actes d'un créneau.
 *
 * Deux chemins d'écriture, et ils ne se comportent pas pareil À DESSEIN :
 * - `resolveTagIds` (appelé par la création/modification d'un créneau) **réutilise** le tag
 *   existant, et n'en crée un que s'il manque. C'est ce qui rend l'autocomplete utile ;
 * - `createTag` (écran de gestion) **refuse** un doublon en 409, parce qu'une saisie
 *   volontairement dupliquée est une erreur qu'il vaut mieux voir.
 */

/** Le client d'écriture : la transaction d'un créneau, ou la base. */
type TagClient = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0]

/** Un nom de tag exploitable, ou un refus. Une règle, deux chemins d'écriture. */
function normalizeTag(name: string | undefined): { name: string, key: string } {
  const [clean] = cleanTagNames([name ?? ''])
  if (!clean) {
    throw createError({ statusCode: 400, statusMessage: 'Nom de tag requis.' })
  }
  return { name: clean, key: tagKey(clean) }
}

/** Le catalogue, trié par nom : l'autocomplete et l'écran de gestion lisent la même chose. */
export async function listTags(): Promise<Tag[]> {
  const db = useDb()

  const rows = await db.select({ id: tags.id, name: tags.name }).from(tags)
  const usage = await db
    .select({ tagId: appointmentTags.tagId })
    .from(appointmentTags)

  const usedBy = new Map<string, number>()
  for (const link of usage) {
    usedBy.set(link.tagId, (usedBy.get(link.tagId) ?? 0) + 1)
  }

  return rows
    .map(row => ({ id: row.id, name: row.name, usageCount: usedBy.get(row.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * Le catalogue réduit à ce dont l'autocomplete a besoin : identifiant et libellé, triés comme
 * l'écran (`fr`, accents compris).
 *
 * Une requête, et surtout PAS `listTags` : les compteurs d'usage ne servent qu'à l'écran de
 * gestion, et cette liste est chargée à chaque ouverture d'une vue de planning.
 */
export async function listTagOptions(): Promise<TagOption[]> {
  const db = useDb()
  const rows = await db.select({ id: tags.id, name: tags.name }).from(tags)

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * Crée un tag depuis l'écran de gestion. 409 si la clé existe déjà : c'est une saisie
 * volontaire, un doublon silencieux y serait une perte d'information.
 */
export async function createTag(name: string): Promise<Tag> {
  const db = useDb()
  const { name: clean, key } = normalizeTag(name)

  const [existing] = await db.select({ name: tags.name }).from(tags).where(eq(tags.key, key))
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: `Le tag « ${existing.name} » existe déjà.` })
  }

  const [created] = await db.insert(tags).values({ name: clean, key }).returning({ id: tags.id })

  return { id: created!.id, name: clean, usageCount: 0 }
}

/**
 * Renomme un tag. Le renommage se propage partout, puisque les créneaux pointent la ligne et
 * non son texte.
 */
export async function renameTag(id: string, name: string): Promise<Tag | null> {
  const db = useDb()
  const { name: clean, key } = normalizeTag(name)

  const [current] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id))
  if (!current) return null

  const [clash] = await db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.key, key))
  if (clash && clash.id !== id) {
    throw createError({ statusCode: 409, statusMessage: `Le tag « ${clash.name} » existe déjà.` })
  }

  await db.update(tags).set({ name: clean, key }).where(eq(tags.id, id))

  const usage = await db
    .select({ tagId: appointmentTags.tagId })
    .from(appointmentTags)
    .where(eq(appointmentTags.tagId, id))

  return { id, name: clean, usageCount: usage.length }
}

/**
 * Supprime un tag — refusé (409) tant qu'un créneau le porte. Retirer les liens en silence
 * modifierait des créneaux sans que personne ne l'ait demandé : même règle que la suppression
 * d'un bénéficiaire.
 */
export async function deleteTag(id: string): Promise<boolean> {
  const db = useDb()

  const [tag] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id))
  if (!tag) return false

  const [used] = await db
    .select({ appointmentId: appointmentTags.appointmentId })
    .from(appointmentTags)
    .where(eq(appointmentTags.tagId, id))
    .limit(1)

  if (used) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Impossible de supprimer : ce tag est utilisé par des créneaux.',
    })
  }

  await db.delete(tags).where(eq(tags.id, id))

  return true
}

/**
 * Traduit une liste de NOMS en identifiants de tags, en créant les manquants, dans l'ordre
 * reçu. Appelé dans la transaction de la création/modification d'un créneau : un tag à moitié
 * créé sans son lien serait un tag orphelin au catalogue.
 *
 * La liste arrive DÉJÀ VALIDÉE (`assertValidTagNames`... autrement dit `checkTagNames`, appelé
 * par la création et la modification d'un créneau) : cette fonction ne juge pas, elle résout.
 * Une règle écrite deux fois finit par diverger, et ici la divergence serait un 400 tantôt
 * affiché, tantôt silencieux.
 *
 * Deux écrivains simultanés peuvent viser le même tag neuf : `ON CONFLICT DO NOTHING` puis
 * relecture par clé — c'est l'index unique qui tranche, jamais le code appelant.
 */
export async function resolveTagIds(tx: TagClient, names: string[]): Promise<string[]> {
  const clean = cleanTagNames(names)
  const keys = clean.map(tagKey)
  const known = new Map<string, string>()

  const existing = await tx
    .select({ id: tags.id, key: tags.key })
    .from(tags)
    .where(inArray(tags.key, keys))

  for (const row of existing) known.set(row.key, row.id)

  // Les manquants, avec le nom que la personne a saisi (le premier de chaque clé).
  const missing = clean
    .map((name, index) => ({ name, key: keys[index]! }))
    .filter(candidate => !known.has(candidate.key))

  if (missing.length > 0) {
    await tx.insert(tags).values(missing).onConflictDoNothing({ target: tags.key })

    const created = await tx
      .select({ id: tags.id, key: tags.key })
      .from(tags)
      .where(inArray(tags.key, missing.map(candidate => candidate.key)))

    for (const row of created) known.set(row.key, row.id)
  }

  // L'ordre demandé, jamais celui que la base a rendu : c'est lui qui décide des trois tags
  // affichés sur une carte.
  const ids = keys.map(key => known.get(key))
  if (ids.some(id => id === undefined)) {
    throw createError({ statusCode: 500, statusMessage: 'Tag introuvable après création.' })
  }

  return ids as string[]
}
