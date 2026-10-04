import type { CopyWeekRequest } from '~~/shared/types/planning'
import { copyWeek } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody<CopyWeekRequest>(event)
  return copyWeek(body, user)
})
