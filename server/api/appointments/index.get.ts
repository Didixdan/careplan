import { listAppointments } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // `?fail=1` rend l'état d'erreur exerçable par l'URL, donc vérifiable.
  if (query.fail === '1') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Lecture des créneaux volontairement échouée (fail=1).',
    })
  }

  const { user } = await requireUserSession(event)

  const day = typeof query.date === 'string' ? query.date : undefined
  const week = typeof query.week === 'string' ? query.week : undefined
  const month = typeof query.month === 'string' ? query.month : undefined

  if (!day && !week && !month) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `date`, `week` ou `month` requis.' })
  }

  return listAppointments({ day, week, month, user: user })
})
