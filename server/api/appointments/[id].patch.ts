import { editAppointment, type EditAppointment } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<EditAppointment>(event)
  const edited = await editAppointment(id, body, user)
  if (!edited) throw createError({ statusCode: 404, statusMessage: 'Créneau introuvable.' })

  return { ok: true }
})
