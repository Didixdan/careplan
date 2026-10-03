import { cesuCsv } from '../../../app/utils/export'
import { cesuLines } from '../../services/appointments'
import { requireWriter } from '../../utils/auth'

/**
 * Export CESU mensuel, en CSV. Un fichier plutôt qu'un écran : il se range, s'ouvre dans un
 * tableur et se conserve avec la déclaration.
 *
 * L'admin exporte tout ; un aidant n'obtient que ses propres lignes — le filtre par rôle est
 * celui du planning, appliqué une seule fois dans `listAppointments`. Un lecteur est refusé :
 * la famille reçoit le message hebdomadaire, elle ne produit pas un relevé de paie.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriter(event)
  const query = getQuery(event)

  const month = typeof query.month === 'string' ? query.month : undefined
  if (!month) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `month` requis.' })
  }

  const { lines, travelKilometers } = await cesuLines(month, user)

  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="CESU-${month}.csv"`)

  return cesuCsv(month, lines, travelKilometers)
})
