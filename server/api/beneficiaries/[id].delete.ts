import { deleteBeneficiary } from '../../services/beneficiaries'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const deleted = await deleteBeneficiary(id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Bénéficiaire introuvable.' })

  return { ok: true }
})
