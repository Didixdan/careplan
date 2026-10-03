import { createAppointment, type CreateAppointment } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await readBody<CreateAppointment>(event)
  return createAppointment(body, user)
})
