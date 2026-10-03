import { moveAppointment } from '../../services/appointments'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<{ date: string, start: string, end: string }>(event)
  const moved = await moveAppointment(id, body, user)
  if (!moved) throw createError({ statusCode: 404, statusMessage: 'Créneau introuvable.' })

  return { ok: true }
})
