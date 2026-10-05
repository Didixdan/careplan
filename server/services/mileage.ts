import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import type { CivilDate, CivilMonth } from '../../app/utils/date'
import { addDays, isCivilDate, isCivilMonth, monthAfter, monthStart, startOfWeek } from '../../app/utils/date'
import { isPlausibleKilometers, roundKilometers, sumKilometers } from '../../app/utils/mileage'
import type { MileageEntry, MileageSummary } from '../../shared/types/planning'
import { assistants, mileage } from '../db/schema'
import { useDb } from '../utils/db'
import type { UserFilter } from './appointments'

/**
 * Kilomètres déclarés : une valeur par aidant et par jour.
 *
 * Trois règles, et rien d'autre :
 * - un aidant ne voit et n'écrit que les siens, l'admin voit et écrit pour tout le monde ;
 * - une valeur à **zéro supprime la ligne** — on ne stocke pas un zéro pour rien ;
 * - le récapitulatif et l'export lisent la MÊME fonction de cumul, donc ils ne peuvent pas
 *   raconter autre chose que la déclaration.
 *
 * Aucun montant n'est calculé : c'est un relevé de kilomètres, pas une paie.
 */

/** Vérifie la date une fois, à l'entrée : une date silencieusement fausse écrirait à côté. */
function assertDate(date: unknown): asserts date is CivilDate {
  if (typeof date !== 'string' || !isCivilDate(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }
}

/** Même principe pour le mois : `monthStart` suppose une chaîne déjà validée. */
function assertMonth(month: unknown): asserts month is CivilMonth {
  if (typeof month !== 'string' || !isCivilMonth(month)) {
    throw createError({ statusCode: 400, statusMessage: 'Mois invalide.' })
  }
}

/** Un lecteur n'a rien à faire ici : les kilomètres appartiennent aux aidants. */
function assertMayWrite(user: UserFilter, assistantId: string): void {
  if (user.role === 'admin') return
  if (user.role === 'assistant' && user.assistantId === assistantId) return

  if (user.role === 'assistant') {
    throw createError({ statusCode: 403, statusMessage: 'Vous ne pouvez déclarer que vos propres kilomètres.' })
  }

  throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'administrateur et aux aidants.' })
}

/**
 * Les déclarations d'un jour. Un aidant ne reçoit que la sienne : son écran n'a qu'un champ,
 * il n'a rien à faire des kilomètres des autres.
 */
export async function listMileage(date: string, user: UserFilter): Promise<MileageEntry[]> {
  assertDate(date)

  const db = useDb()
  const rows = await db
    .select({
      date: mileage.date,
      assistantId: mileage.assistantId,
      assistantName: assistants.firstName,
      assistantLastName: assistants.lastName,
      kilometers: mileage.kilometers,
    })
    .from(mileage)
    .innerJoin(assistants, eq(assistants.id, mileage.assistantId))
    .where(user.role === 'assistant' && user.assistantId
      ? and(eq(mileage.date, date), eq(mileage.assistantId, user.assistantId))
      : eq(mileage.date, date))

  return rows.map(row => ({
    date: row.date,
    assistantId: row.assistantId,
    assistantName: `${row.assistantName} ${row.assistantLastName}`,
    kilometers: roundKilometers(row.kilometers),
  }))
}

/**
 * Déclare les kilomètres d'un aidant pour un jour, ou les efface.
 *
 * `kilometers === 0` efface : l'écran envoie zéro quand le champ est vidé, et garder une ligne
 * à zéro ferait apparaître des aidants sans kilomètres dans le récapitulatif.
 */
export async function setMileage(
  date: string,
  assistantId: string,
  kilometers: number,
  user: UserFilter,
): Promise<void> {
  assertDate(date)
  assertMayWrite(user, assistantId)

  if (!isPlausibleKilometers(kilometers)) {
    throw createError({ statusCode: 400, statusMessage: 'Kilomètres invalides.' })
  }

  const db = useDb()
  const rounded = roundKilometers(kilometers)

  if (rounded === 0) {
    await db.delete(mileage).where(and(eq(mileage.assistantId, assistantId), eq(mileage.date, date)))
    return
  }

  await db
    .insert(mileage)
    .values({ date, assistantId, kilometers: rounded })
    // L'index unique (aidant, date) porte la règle « une fois par jour » : c'est lui qui décide
    // qu'une seconde déclaration met à jour la première.
    .onConflictDoUpdate({
      target: [mileage.assistantId, mileage.date],
      set: { kilometers: rounded },
    })
}

/**
 * Cumul d'une plage `[start, end[`, par aidant. `user` absent = aucune restriction, comme
 * `listAppointments` : c'est l'appel interne des récapitulatifs, les routes passent toujours un
 * rôle.
 *
 * La borne de fin est EXCLUSIVE, comme partout ailleurs : pas de `<= 31` approximatif.
 */
async function mileageBetween(
  start: CivilDate,
  end: CivilDate,
  user?: UserFilter,
): Promise<Map<string, number>> {
  const db = useDb()
  const rows = await db
    .select({ assistantId: mileage.assistantId, kilometers: mileage.kilometers })
    .from(mileage)
    .where(and(
      gte(mileage.date, start),
      lt(mileage.date, end),
      ...(user?.role === 'assistant' && user.assistantId
        ? [inArray(mileage.assistantId, [user.assistantId])]
        : []),
    ))

  const byAssistant = new Map<string, number[]>()
  for (const row of rows) {
    byAssistant.set(row.assistantId, [...(byAssistant.get(row.assistantId) ?? []), row.kilometers])
  }

  // Somme arrondie : additionner des flottants sans arrondir finit par dériver.
  return new Map([...byAssistant].map(([id, values]) => [id, sumKilometers(values)]))
}

/**
 * Cumul du mois, par aidant. Sert au récapitulatif ET à l'export CESU : une seule lecture,
 * donc un seul chiffre — celui que l'aidant a déclaré.
 */
export async function monthlyMileage(month: string, user?: UserFilter): Promise<Map<string, number>> {
  assertMonth(month)
  return mileageBetween(monthStart(month), monthAfter(month), user)
}

/**
 * Cumul de la SEMAINE, par aidant, avec son nom : le tableau de bord n'a ainsi aucune liste
 * d'aidants à charger en plus pour afficher ses lignes.
 *
 * Un lecteur reçoit une liste vide : les kilomètres appartiennent aux aidants, qui les
 * déclarent ; une famille n'a ni relevé à déclarer ni frais à consulter.
 */
export async function weeklyMileage(week: string, user?: UserFilter): Promise<MileageSummary[]> {
  if (typeof week !== 'string' || !isCivilDate(week)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  if (user?.role === 'viewer') return []

  const monday = startOfWeek(week)
  const totals = await mileageBetween(monday, addDays(monday, 7), user)
  if (totals.size === 0) return []

  // `inArray` avec un tableau vide produirait un SQL invalide : la sortie ci-dessus protège.
  const db = useDb()
  const rows = await db
    .select({ id: assistants.id, firstName: assistants.firstName, lastName: assistants.lastName })
    .from(assistants)
    .where(inArray(assistants.id, [...totals.keys()]))

  const nameOf = new Map(rows.map(row => [row.id, `${row.firstName} ${row.lastName}`.trim()]))

  return [...totals]
    .map(([assistantId, kilometers]) => ({
      assistantId,
      assistantName: nameOf.get(assistantId) ?? '',
      kilometers,
    }))
    .sort((a, b) => a.assistantName.localeCompare(b.assistantName, 'fr'))
}
