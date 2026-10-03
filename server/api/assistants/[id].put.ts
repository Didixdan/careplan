import { editAssistant, type EditAssistant } from '../../services/assistants'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<EditAssistant>(event)
  const assistant = await editAssistant(id, body)
  if (!assistant) throw createError({ statusCode: 404, statusMessage: 'Aidant introuvable.' })

  return assistant
})
