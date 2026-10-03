import { createAssistant, type CreateAssistant } from '../../services/assistants'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<CreateAssistant>(event)
  return createAssistant(body)
})
