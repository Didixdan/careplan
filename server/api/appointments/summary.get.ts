import { summariseMonth } from '../../services/appointments'

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
  if (!month) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `month` requis.' })
  }

  return summariseMonth(month, user)
})
