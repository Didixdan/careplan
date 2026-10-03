import { eq } from 'drizzle-orm'
import type { Role } from '~~/shared/types/planning'
import { assistants, beneficiaries, users } from '../../db/schema'
import { useDb } from '../../utils/db'
import { scryptVerify } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = body.email?.trim().toLowerCase()
  const password = body.password

  if (!email || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Email et mot de passe requis.' })
  }

  const db = useDb()
  const [user] = await db.select().from(users).where(eq(users.email, email))

  if (!user || !scryptVerify(password, user.hashedPassword)) {
    throw createError({ statusCode: 401, statusMessage: 'Identifiants invalides.' })
  }

  // Profil métier lié au compte, pour filtrer les plannings côté serveur.
  let assistantId: string | undefined
  let beneficiaryId: string | undefined

  if (user.role === 'assistant') {
    const [assistant] = await db
      .select({ id: assistants.id })
      .from(assistants)
      .where(eq(assistants.userId, user.id))
    assistantId = assistant?.id
  }
  else if (user.role === 'viewer') {
    const [beneficiary] = await db
      .select({ id: beneficiaries.id })
      .from(beneficiaries)
      .where(eq(beneficiaries.userId, user.id))
    beneficiaryId = beneficiary?.id
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      assistantId,
      beneficiaryId,
    },
  })

  return { ok: true }
})
