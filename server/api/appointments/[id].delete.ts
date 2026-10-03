import { deleteAppointment } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const deleted = await deleteAppointment(id, user)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Créneau introuvable.' })

  return { ok: true }
})
