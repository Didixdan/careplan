import { summariseMonth, summariseWeek } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  // `?fail=1` rend l'état d'erreur exerçable par l'URL, donc vérifiable.
  if (query.fail === '1') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Lecture du récapitulatif volontairement échouée (fail=1).',
    })
  }

  const { user } = await requireUserSession(event)

  const month = typeof query.month === 'string' ? query.month : undefined
  const week = typeof query.week === 'string' ? query.week : undefined

  // Une période à la fois : additionner un mois et une semaine n'aurait aucun sens, et le
  // deviner à la place de l'appelant donnerait un récapitulatif faux sans le dire.
  if (month && week) {
    throw createError({ statusCode: 400, statusMessage: 'Un seul paramètre `month` ou `week`.' })
  }

  if (month) return summariseMonth(month, user)
  if (week) return summariseWeek(week, user)

  throw createError({ statusCode: 400, statusMessage: 'Paramètre `month` ou `week` requis.' })
})
