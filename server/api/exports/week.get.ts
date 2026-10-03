import { isCivilDate } from '../../../app/utils/date'
import { weekCsv } from '../../../app/utils/export'
import { weekLines } from '../../services/appointments'
import { requireWriter } from '../../utils/auth'

/**
 * Export de la semaine, en CSV, groupé par aidant : tous les passages (statuts compris, pour
 * qu'un créneau annulé se voie) puis le total d'heures de chacun, annulés exclus.
 *
 * C'est un document de planning, pas de paie : aucun montant n'y figure. La semaine exportée
 * est celle qu'on regarde (`?week=`), pas celle d'aujourd'hui.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriter(event)
  const query = getQuery(event)

  const week = typeof query.week === 'string' ? query.week : undefined
  if (!week) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `week` requis.' })
  }
  if (!isCivilDate(week)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  const { dates, lines } = await weekLines(week, user)

  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="semaine-${dates[0]}.csv"`)

  return weekCsv(dates, lines)
})
