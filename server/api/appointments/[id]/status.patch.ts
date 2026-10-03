import { changeAppointmentStatus } from '../../../services/appointments'

/**
 * Action rapide : ne change QUE le statut. Le corps complet de `PATCH /:id` n'est pas
 * demandé ici, précisément pour ne pas risquer d'écraser un autre champ depuis un DTO lu
 * quelques secondes plus tôt.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<{ status?: string }>(event)
  const changed = await changeAppointmentStatus(id, body.status ?? '', user)
  if (!changed) throw createError({ statusCode: 404, statusMessage: 'Créneau introuvable.' })

  return { ok: true }
})
