import { listMileage } from '../../services/mileage'
import { requireWriter } from '../../utils/auth'

/**
 * Kilomètres déclarés pour un jour.
 *
 * Un aidant ne reçoit que la sienne : son écran n'a qu'un champ. Un lecteur est refusé — les
 * kilomètres appartiennent aux aidants, pas aux familles.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriter(event)
  const query = getQuery(event)

  const date = typeof query.date === 'string' ? query.date : undefined
  if (!date) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `date` requis.' })
  }

  return listMileage(date, user)
})
