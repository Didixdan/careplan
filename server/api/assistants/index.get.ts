import { listAssistants } from '../../services/assistants'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return listAssistants()
})
