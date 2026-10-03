import { deleteAssistant } from '../../services/assistants'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const deleted = await deleteAssistant(id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Aidant introuvable.' })

  return { ok: true }
})
