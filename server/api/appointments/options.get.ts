import { listAppointmentOptions } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return listAppointmentOptions(user)
})
