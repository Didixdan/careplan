import { editBeneficiary, type EditBeneficiary } from '../../services/beneficiaries'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Identifiant requis.' })

  const body = await readBody<EditBeneficiary>(event)
  const beneficiary = await editBeneficiary(id, body)
  if (!beneficiary) throw createError({ statusCode: 404, statusMessage: 'Bénéficiaire introuvable.' })

  return beneficiary
})
