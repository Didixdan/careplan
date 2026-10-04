import { loadEnvFile } from 'node:process'
import { eq } from 'drizzle-orm'
import { startOfWeek, today } from '../../app/utils/date'
import { tagKey } from '../../app/utils/tags'
import { scryptHash } from '../utils/password'
import { closeDb, useDb } from '../utils/db'
import { assistantFixtures, beneficiaryFixtures, buildAppointments, buildTags } from './fixtures'
import { appointmentAssistants, appointmentTags, appointments, assignments, assistants, beneficiaries, mileage, tags, users } from './schema'

// Chargé ici, pas par Nuxt : le seed tourne hors du runtime (tsx).
try {
  loadEnvFile('.env')
}
catch {
  // `.env` absent : DATABASE_URL viendra de l'environnement.
}

// Mot de passe de développement, commun aux comptes de démonstration (aidants + lecture).
const DEV_PASSWORD = 'quZx$%A7'

// Compte d'administration. Ces deux valeurs sont aussi celles des scénarios de bout en bout
// (`cypress/support/e2e.ts`) : les changer ici oblige à les changer là-bas.
const ADMIN_EMAIL = 'admin@careplan.prod'
const ADMIN_PASSWORD = '@59y%P#5'

/** Récupère l'unique ligne d'une insertion `.returning(...)`, en échouant sinon. */
async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [first] = await rows
  if (!first) throw new Error('Insertion sans résultat.')
  return first
}

async function seed() {
  const db = useDb()

  // Réinitialisation complète (donnée de dev) : les tables sont vidées dans l'ordre
  // des dépendances, puis réinsérées. Les liens de tags partent avant leurs deux parents.
  await db.delete(mileage)
  await db.delete(appointmentTags)
  await db.delete(appointmentAssistants)
  await db.delete(appointments)
  await db.delete(tags)
  await db.delete(assignments)
  await db.delete(assistants)
  await db.delete(beneficiaries)
  await db.delete(users)

  // Compte admin.
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    hashedPassword: scryptHash(ADMIN_PASSWORD),
    role: 'admin',
  })

  // Comptes + profils des aidants.
  const assistantBySlug = new Map<string, string>()
  for (const reference of assistantFixtures) {
    const user = await one(db.insert(users).values({
      email: reference.email,
      hashedPassword: scryptHash(DEV_PASSWORD),
      role: 'assistant',
    }).returning({ id: users.id }))

    const assistant = await one(db.insert(assistants).values({
      userId: user.id,
      firstName: reference.firstName,
      lastName: reference.lastName,
      color: reference.color,
      contractedMinutes: reference.contractedMinutes,
    }).returning({ id: assistants.id }))

    assistantBySlug.set(reference.slug, assistant.id)
  }

  // Bénéficiaires ; le premier reçoit un compte « lecture » (famille).
  const beneficiaryBySlug = new Map<string, string>()
  for (const [index, reference] of beneficiaryFixtures.entries()) {
    const beneficiary = await one(db.insert(beneficiaries).values({
      firstName: reference.firstName,
      lastName: reference.lastName,
      hourlyRateCents: reference.hourlyRateCents,
    }).returning({ id: beneficiaries.id }))

    beneficiaryBySlug.set(reference.slug, beneficiary.id)

    if (index === 0) {
      const user = await one(db.insert(users).values({
        email: 'famille.dupont@careplan.local',
        hashedPassword: scryptHash(DEV_PASSWORD),
        role: 'viewer',
      }).returning({ id: users.id }))

      await db.update(beneficiaries).set({ userId: user.id }).where(eq(beneficiaries.id, beneficiary.id))
    }
  }

  // Le vocabulaire des actes, avant les créneaux qui le portent.
  const tagByName = new Map<string, string>()
  for (const name of buildTags()) {
    const [tag] = await db.insert(tags).values({ name, key: tagKey(name) }).returning({ id: tags.id })
    if (!tag) throw new Error(`Tag « ${name} » non inséré.`)
    tagByName.set(name, tag.id)
  }

  // Créneaux de la semaine courante + leurs tags + co-assistants + affectations.
  const appointmentFixtures = buildAppointments(today())
  const assignedPairs = new Set<string>()

  for (const fixture of appointmentFixtures) {
    const inserted = await one(db.insert(appointments).values({
      date: fixture.date,
      startTime: fixture.start,
      endTime: fixture.end,
      status: fixture.status,
      beneficiaryId: beneficiaryBySlug.get(fixture.beneficiarySlug)!,
      primaryAssistantId: assistantBySlug.get(fixture.primaryAssistantSlug)!,
    }).returning({ id: appointments.id }))

    assignedPairs.add(`${fixture.primaryAssistantSlug}|${fixture.beneficiarySlug}`)

    // L'ORDRE des tags est celui du modèle : c'est lui qui décide des trois affichés.
    await db.insert(appointmentTags).values(fixture.tags.map((name, position) => ({
      appointmentId: inserted.id,
      tagId: tagByName.get(name)!,
      position,
    })))

    for (const slug of fixture.coAssistantSlugs) {
      await db.insert(appointmentAssistants).values({
        appointmentId: inserted.id,
        assistantId: assistantBySlug.get(slug)!,
      })
      assignedPairs.add(`${slug}|${fixture.beneficiarySlug}`)
    }
  }

  for (const pair of assignedPairs) {
    const [assistantSlug, beneficiarySlug] = pair.split('|') as [string, string]
    await db.insert(assignments).values({
      assistantId: assistantBySlug.get(assistantSlug)!,
      beneficiaryId: beneficiaryBySlug.get(beneficiarySlug)!,
    })
  }

  // Kilomètres déclarés : une journée pour Damien, pour que le récapitulatif et l'export
  // CESU montrent un chiffre réel plutôt qu'une colonne vide.
  await db.insert(mileage).values({
    date: startOfWeek(today()),
    assistantId: assistantBySlug.get('damien')!,
    kilometers: 12.5,
  })

  console.log(
    `✓ ${appointmentFixtures.length} créneaux, ${assistantFixtures.length} aidants, `
    + `${beneficiaryFixtures.length} bénéficiaires, ${tagByName.size} tags, `
    + `${assignedPairs.size} affectations, 1 relevé de km`,
  )
}

async function main() {
  try {
    await seed()
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
  finally {
    await closeDb()
  }
}

await main()
