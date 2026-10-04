import { previewCopyWeek } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { user } = await requireUserSession(event)

  const source = typeof query.source === 'string' ? query.source : undefined
  const target = typeof query.target === 'string' ? query.target : undefined

  if (!source || !target) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètres `source` et `target` requis.' })
  }

  return previewCopyWeek({ source, target }, user)
})
