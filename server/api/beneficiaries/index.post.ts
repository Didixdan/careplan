import { createBeneficiary, type CreateBeneficiary } from '../../services/beneficiaries'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<CreateBeneficiary>(event)
  return createBeneficiary(body)
})
