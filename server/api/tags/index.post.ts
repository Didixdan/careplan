import { createTag } from '../../services/tags'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ name?: string }>(event)
  return createTag(body.name ?? '')
})
