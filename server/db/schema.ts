import { doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Base en ANGLAIS (AGENTS.md §1 amendé) : tables, colonnes et valeurs. Les dates
// civiles 'YYYY-MM-DD' et heures 'HH:MM' restent en TEXTE, jamais en `date`/`time`
// Postgres (qui portent un fuseau). Couleur en identifiant ('assistant-3'), jamais
// en hexadécimal.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  hashedPassword: text('hashed_password').notNull(),
  // 'admin' | 'assistant' | 'viewer'
  role: text('role').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const assistants = pgTable('assistants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  // 'assistant-1' … 'assistant-8'
  color: text('color').notNull(),
  contractedMinutes: integer('contracted_minutes'),
})

export const beneficiaries = pgTable('beneficiaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  address: text('address'),
  hourlyRateCents: integer('hourly_rate_cents'),
  authorizedMinutesMonth: integer('authorized_minutes_month'),
  color: text('color'),
  userId: uuid('user_id').unique().references(() => users.id),
})

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: text('date').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    // 'planned' | 'completed' | 'to_validate' | 'cancelled'
    status: text('status').notNull(),
    beneficiaryId: uuid('beneficiary_id').notNull().references(() => beneficiaries.id),
    primaryAssistantId: uuid('primary_assistant_id').notNull().references(() => assistants.id),
  },
  table => [index('appointments_date_idx').on(table.date)],
)

// Vocabulaire partagé des actes (« Aide à la toilette », « Courses »). Un tag appartient à
// plusieurs créneaux, d'où la table de liaison ci-dessous : l'intitulé libre d'avant ne se
// réutilisait pas, se réécrivait à chaque fois, et finissait en variantes.
//
// `key` porte le dédoublonnage (« Courses » et « courses » sont le même tag) : la règle est
// écrite une fois en JS (`app/utils/tags.ts`, `tagKey`) et une fois dans la migration qui
// convertit les anciens intitulés. La clé unique est ce qui tranche, jamais le code appelant.
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Affiché tel qu'il a été saisi la première fois.
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
})

// Tags d'un créneau, DANS L'ORDRE d'affichage (`position`) : l'écran n'en montre que trois,
// mais les exports les portent tous, donc l'ordre ne peut pas dépendre de la base.
export const appointmentTags = pgTable(
  'appointment_tags',
  {
    appointmentId: uuid('appointment_id').notNull().references(() => appointments.id),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
    position: integer('position').notNull(),
  },
  table => [primaryKey({ columns: [table.appointmentId, table.tagId] })],
)

// Co-assistants d'un créneau (au-delà de l'aidant principal).
export const appointmentAssistants = pgTable(
  'appointment_assistants',
  {
    appointmentId: uuid('appointment_id').notNull().references(() => appointments.id),
    assistantId: uuid('assistant_id').notNull().references(() => assistants.id),
  },
  table => [primaryKey({ columns: [table.appointmentId, table.assistantId] })],
)

// Affectation aidant ↔ bénéficiaire.
export const assignments = pgTable(
  'assignments',
  {
    assistantId: uuid('assistant_id').notNull().references(() => assistants.id),
    beneficiaryId: uuid('beneficiary_id').notNull().references(() => beneficiaries.id),
  },
  table => [primaryKey({ columns: [table.assistantId, table.beneficiaryId] })],
)

// Kilomètres déclarés par un aidant pour une journée. Un flottant, parce que c'est ce qu'un
// compteur affiche — mais arrondi à deux décimales à l'écriture ET à l'affichage : une somme
// de flottants dérive (12,1 + 12,2 = 24,299999…), et un total de kilomètres faux ne se voit
// pas. L'index unique porte la règle « une fois par jour » : elle appartient à la base, pas au
// code appelant.
//
// Aucun montant n'est stocké ni calculé : c'est un relevé, pas une paie.
export const mileage = pgTable(
  'mileage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: text('date').notNull(),
    assistantId: uuid('assistant_id').notNull().references(() => assistants.id),
    kilometers: doublePrecision('kilometers').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [uniqueIndex('mileage_assistant_date_idx').on(table.assistantId, table.date)],
)
