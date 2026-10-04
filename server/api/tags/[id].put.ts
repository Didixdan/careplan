import { renameTag } from '../../services/tags'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<{ name?: string }>(event)
  const tag = await renameTag(id, body.name ?? '')
  if (!tag) throw createError({ statusCode: 404, statusMessage: 'Tag introuvable.' })

  return tag
})
