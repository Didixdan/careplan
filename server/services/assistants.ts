import { eq, inArray, or } from 'drizzle-orm'
import { isAssistantColor, type AssistantColor } from '../../app/utils/colors'
import type { Assistant } from '../../shared/types/planning'
import { appointmentAssistants, appointments, assignments, assistants, mileage, users } from '../db/schema'
import { useDb } from '../utils/db'
import { scryptHash } from '../utils/password'

export interface CreateAssistant {
  firstName: string
  lastName: string
  color: AssistantColor
  contractedHours: number | null
  email: string
  password: string
}

export interface EditAssistant {
  firstName: string
  lastName: string
  color: AssistantColor
  contractedHours: number | null
}

function validateColor(color: unknown): asserts color is AssistantColor {
  if (!isAssistantColor(color)) {
    throw createError({ statusCode: 400, statusMessage: 'Couleur invalide.' })
  }
}

export async function listAssistants(): Promise<Assistant[]> {
  const db = useDb()
  const rows = await db
    .select({
      id: assistants.id,
      firstName: assistants.firstName,
      lastName: assistants.lastName,
      color: assistants.color,
      contractedHours: assistants.contractedMinutes,
      email: users.email,
    })
    .from(assistants)
    .innerJoin(users, eq(users.id, assistants.userId))
    .orderBy(assistants.lastName, assistants.firstName)

  return rows.map(row => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    color: row.color as AssistantColor,
    contractedHours: row.contractedHours,
    email: row.email,
  }))
}

export async function createAssistant(input: CreateAssistant): Promise<Assistant> {
  validateColor(input.color)

  const email = input.email.trim().toLowerCase()
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName || !email || !input.password) {
    throw createError({ statusCode: 400, statusMessage: 'Champs requis manquants.' })
  }

  const db = useDb()

  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      email,
      hashedPassword: scryptHash(input.password),
      role: 'assistant',
    }).returning({ id: users.id })

    const [assistant] = await tx.insert(assistants).values({
      userId: user!.id,
      firstName: firstName,
      lastName: lastName,
      color: input.color,
      contractedMinutes: input.contractedHours,
    }).returning({ id: assistants.id })

    return {
      id: assistant!.id,
      firstName,
      lastName,
      color: input.color,
      contractedHours: input.contractedHours,
      email,
    }
  })
}

export async function editAssistant(id: string, input: EditAssistant): Promise<Assistant | null> {
  validateColor(input.color)

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName || !lastName) {
    throw createError({ statusCode: 400, statusMessage: 'Prénom et nom requis.' })
  }

  const db = useDb()

  const [assistant] = await db.update(assistants).set({
    firstName: firstName,
    lastName: lastName,
    color: input.color,
    contractedMinutes: input.contractedHours,
  }).where(eq(assistants.id, id)).returning({ userId: assistants.userId })

  if (!assistant) return null

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, assistant.userId))

  return {
    id,
    firstName,
    lastName,
    color: input.color,
    contractedHours: input.contractedHours,
    email: user?.email ?? '',
  }
}

export async function deleteAssistant(id: string): Promise<boolean> {
  const db = useDb()
  const [assistant] = await db
    .select({ userId: assistants.userId })
    .from(assistants)
    .where(eq(assistants.id, id))

  if (!assistant) return false

  const existingAppointments = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(or(
      eq(appointments.primaryAssistantId, id),
      inArray(
        appointments.id,
        db.select({ id: appointmentAssistants.appointmentId })
          .from(appointmentAssistants)
          .where(eq(appointmentAssistants.assistantId, id)),
      ),
    ))
    .limit(1)

  const existingAssignments = await db
    .select({ id: assignments.assistantId })
    .from(assignments)
    .where(eq(assignments.assistantId, id))
    .limit(1)

  const existingMileage = await db
    .select({ id: mileage.id })
    .from(mileage)
    .where(eq(mileage.assistantId, id))
    .limit(1)

  if (existingAppointments.length > 0 || existingAssignments.length > 0 || existingMileage.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Impossible de supprimer : cet aidant a des créneaux, des affectations ou des kilomètres déclarés.',
    })
  }

  await db.transaction(async (tx) => {
    await tx.delete(assistants).where(eq(assistants.id, id))
    await tx.delete(users).where(eq(users.id, assistant.userId))
  })

  return true
}
