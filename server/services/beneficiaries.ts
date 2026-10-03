import { eq } from 'drizzle-orm'
import type { Beneficiary } from '../../shared/types/planning'
import { appointments, beneficiaries, users } from '../db/schema'
import { useDb } from '../utils/db'

export interface CreateBeneficiary {
  firstName: string
  lastName: string
  address: string | null
  hourlyRateCents: number | null
  authorizedMinutesMonth: number | null
}

export type EditBeneficiary = CreateBeneficiary

function normalize(input: CreateBeneficiary) {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName || !lastName) {
    throw createError({ statusCode: 400, statusMessage: 'Prénom et nom requis.' })
  }
  return {
    firstName,
    lastName,
    address: input.address?.trim() || null,
    hourlyRateCents: input.hourlyRateCents,
    authorizedMinutesMonth: input.authorizedMinutesMonth,
  }
}

export async function listBeneficiaries(): Promise<Beneficiary[]> {
  const db = useDb()
  const rows = await db
    .select()
    .from(beneficiaries)
    .orderBy(beneficiaries.lastName, beneficiaries.firstName)

  return rows.map(row => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    address: row.address,
    hourlyRateCents: row.hourlyRateCents,
    authorizedMinutesMonth: row.authorizedMinutesMonth,
  }))
}

export async function createBeneficiary(input: CreateBeneficiary): Promise<Beneficiary> {
  const db = useDb()
  const data = normalize(input)

  const [beneficiary] = await db.insert(beneficiaries).values({
    firstName: data.firstName,
    lastName: data.lastName,
    address: data.address,
    hourlyRateCents: data.hourlyRateCents,
    authorizedMinutesMonth: data.authorizedMinutesMonth,
  }).returning({ id: beneficiaries.id })

  return { id: beneficiary!.id, ...data }
}

export async function editBeneficiary(id: string, input: EditBeneficiary): Promise<Beneficiary | null> {
  const db = useDb()
  const data = normalize(input)

  const [beneficiary] = await db.update(beneficiaries).set({
    firstName: data.firstName,
    lastName: data.lastName,
    address: data.address,
    hourlyRateCents: data.hourlyRateCents,
    authorizedMinutesMonth: data.authorizedMinutesMonth,
  }).where(eq(beneficiaries.id, id)).returning({ id: beneficiaries.id })

  if (!beneficiary) return null

  return { id, ...data }
}

export async function deleteBeneficiary(id: string): Promise<boolean> {
  const db = useDb()
  const [beneficiary] = await db
    .select({ userId: beneficiaries.userId })
    .from(beneficiaries)
    .where(eq(beneficiaries.id, id))

  if (!beneficiary) return false

  const existingAppointments = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.beneficiaryId, id))
    .limit(1)

  if (existingAppointments.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Impossible de supprimer : ce bénéficiaire a des créneaux.' })
  }

  await db.transaction(async (tx) => {
    await tx.delete(beneficiaries).where(eq(beneficiaries.id, id))
    if (beneficiary.userId) {
      await tx.delete(users).where(eq(users.id, beneficiary.userId))
    }
  })

  return true
}
