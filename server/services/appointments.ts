import { and, asc, eq, gte, inArray, lt, ne, or } from 'drizzle-orm'
import { conflictingIds, type BookedRange } from '../../app/utils/conflicts'
import type { CivilDate } from '../../app/utils/date'
import { addDays, isCivilDate, isCivilMonth, monthAfter, monthStart, startOfWeek, week as weekOf } from '../../app/utils/date'
import type { AssistantColor } from '../../app/utils/colors'
import { durationInMinutes } from '../../app/utils/duration'
import type { CesuLine, WeekLine } from '../../app/utils/export'
import { checkTimeRange, GRID_END_MINUTES, GRID_START_MINUTES, type TimeRangeProblem } from '../../app/utils/grid'
import { isStatus, quickTransitions } from '../../app/utils/status'
import {
  summarise,
  summariseByAssistant,
  summariseByBeneficiary,
  summariseByDay,
} from '../../app/utils/summary'
import type {
  Appointment,
  AppointmentFormOptions,
  MonthSummary,
  PersonSummary,
  Role,
  SummaryLine,
} from '../../shared/types/planning'
import { appointmentAssistants, appointments, assistants, beneficiaries } from '../db/schema'
import { useDb } from '../utils/db'
import { monthlyMileage } from './mileage'

const fullName = (firstName: string, lastName: string) => `${firstName} ${lastName}`.trim()

/**
 * Ce qu'un rôle a le droit de voir ou d'écrire. Le filtre est appliqué ICI, une fois, pour
 * tout le monde — y compris les kilomètres, qui partagent la même règle.
 */
export interface UserFilter {
  role: Role
  assistantId?: string
  beneficiaryId?: string
}

interface AppointmentQuery {
  day?: string
  week?: string
  month?: string
  user?: UserFilter
}

/**
 * Fenêtre lue : un jour, une semaine ou un mois — jamais deux à la fois. `day` prime, puis
 * `week`, puis `month`.
 *
 * La borne de fin est EXCLUSIVE dans les trois cas, ce qui évite un `<= 23:59` approximatif.
 */
function windowOf(query: AppointmentQuery): { start: CivilDate, end: CivilDate } {
  if (query.day) {
    return { start: query.day, end: addDays(query.day, 1) }
  }

  if (query.week) {
    const start = startOfWeek(query.week)
    return { start, end: addDays(start, 7) }
  }

  if (query.month) {
    // Un mois mal formé est refusé ICI : `monthStart` suppose une chaîne déjà validée, et
    // un mois silencieusement faux donnerait des totaux faux.
    if (!isCivilMonth(query.month)) {
      throw createError({ statusCode: 400, statusMessage: 'Mois invalide.' })
    }
    return { start: monthStart(query.month), end: monthAfter(query.month) }
  }

  throw new Error('Paramètre `day`, `week` ou `month` requis.')
}

/** Plage affichée, dérivée des bornes de la grille : le message ne peut pas diverger. */
const gridHour = (minutes: number) => String(minutes / 60).padStart(2, '0')
const GRID_LABEL = `${gridHour(GRID_START_MINUTES)}h–${gridHour(GRID_END_MINUTES)}h`

/** Refus d'une plage horaire → message affiché. Le code, lui, est testé (`checkTimeRange`). */
const TIME_RANGE_MESSAGES: Record<TimeRangeProblem, string> = {
  // `consistent-as-needed` (stylistic) impose de citer TOUTES les clés dès que l'une
  // d'elles en a besoin — d'où les guillemets sur `unparsable` et `empty`.
  'unparsable': 'Heures invalides.',
  'empty': 'La durée du créneau est nulle.',
  'not-quarter-hour': 'Les heures doivent être alignées sur 15 minutes.',
  'out-of-grid': `Le créneau doit rester dans la plage ${GRID_LABEL}.`,
}

/**
 * Lecture des créneaux d'une plage (jour ou semaine), dénormalisés pour l'affichage :
 * bénéficiaire, aidant principal (couleur incluse) et co-aidants. Le filtre par rôle
 * borne l'aidant à ses créneaux et le bénéficiaire (lecture) aux siens.
 */
export async function listAppointments(options: AppointmentQuery): Promise<Appointment[]> {
  const db = useDb()
  const { start, end } = windowOf(options)

  const conditions = [gte(appointments.date, start), lt(appointments.date, end)]

  const user = options.user
  if (user?.role === 'assistant' && user.assistantId) {
    const conditionAssistant = or(
      eq(appointments.primaryAssistantId, user.assistantId),
      inArray(
        appointments.id,
        db.select({ id: appointmentAssistants.appointmentId })
          .from(appointmentAssistants)
          .where(eq(appointmentAssistants.assistantId, user.assistantId)),
      ),
    )
    if (conditionAssistant) conditions.push(conditionAssistant)
  }
  else if (user?.role === 'viewer' && user.beneficiaryId) {
    conditions.push(eq(appointments.beneficiaryId, user.beneficiaryId))
  }

  const rows = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      start: appointments.startTime,
      end: appointments.endTime,
      title: appointments.title,
      status: appointments.status,
      beneficiaryFirstName: beneficiaries.firstName,
      beneficiaryNom: beneficiaries.lastName,
      beneficiaryId: appointments.beneficiaryId,
      primaryAssistant: appointments.primaryAssistantId,
      assistantFirstName: assistants.firstName,
      assistantNom: assistants.lastName,
      color: assistants.color,
    })
    .from(appointments)
    .innerJoin(beneficiaries, eq(beneficiaries.id, appointments.beneficiaryId))
    .innerJoin(assistants, eq(assistants.id, appointments.primaryAssistantId))
    .where(and(...conditions))
    .orderBy(asc(appointments.date), asc(appointments.startTime))

  if (rows.length === 0) return []

  const ids = rows.map(row => row.id)
  const coAssistantsLignes = await db
    .select({
      appointmentId: appointmentAssistants.appointmentId,
      assistantId: appointmentAssistants.assistantId,
      firstName: assistants.firstName,
      lastName: assistants.lastName,
    })
    .from(appointmentAssistants)
    .innerJoin(assistants, eq(assistants.id, appointmentAssistants.assistantId))
    .where(inArray(appointmentAssistants.appointmentId, ids))

  const coParAppointment = new Map<string, { id: string, lastName: string }[]>()
  for (const co of coAssistantsLignes) {
    const list = coParAppointment.get(co.appointmentId) ?? []
    list.push({ id: co.assistantId, lastName: fullName(co.firstName, co.lastName) })
    coParAppointment.set(co.appointmentId, list)
  }

  return rows.map((row) => {
    const coAssistants = coParAppointment.get(row.id) ?? []
    return {
      id: row.id,
      date: row.date,
      start: row.start,
      end: row.end,
      title: row.title,
      status: row.status as Appointment['status'],
      beneficiary: fullName(row.beneficiaryFirstName, row.beneficiaryNom),
      beneficiaryId: row.beneficiaryId,
      primaryAssistant: fullName(row.assistantFirstName, row.assistantNom),
      primaryAssistantId: row.primaryAssistant,
      color: row.color as AssistantColor,
      coAssistants: coAssistants.map(co => co.lastName),
      coAssistantIds: coAssistants.map(co => co.id),
    }
  })
}

/**
 * Ce que le lecteur a le droit de TOTALISER — ce n'est pas la même chose que ce qu'il a le
 * droit de voir.
 *
 * Un total n'est honnête que s'il porte sur **tous** les créneaux de la personne :
 * - l'admin voit tout, ses deux sections sont donc complètes ;
 * - un aidant ne voit que ses créneaux : sa propre ligne est complète, celle d'un co-aidant
 *   ne le serait pas (elle ignorerait ses autres bénéficiaires) ;
 * - une famille voit tous les créneaux de son bénéficiaire — sa consommation et son volume
 *   autorisé sont donc exacts — mais pas ceux d'un aidant chez d'autres personnes.
 *
 * Un total partiel présenté comme un total est pire qu'une section absente : il a l'air
 * d'un chiffre à déclarer.
 */
function totalsAllowed(user: UserFilter | undefined): { assistants: boolean, beneficiaries: boolean } {
  if (!user || user.role === 'admin') return { assistants: true, beneficiaries: true }
  if (user.role === 'assistant') return { assistants: true, beneficiaries: false }
  return { assistants: false, beneficiaries: true }
}

/**
 * Récapitulatif d'un mois : cumuls du mois, par aidant et par bénéficiaire, avec la
 * référence contractuelle de chacun quand elle existe.
 *
 * Les heures viennent de `listAppointments`, donc du **même** filtre par rôle que le
 * planning : un aidant ne peut pas voir dans son récap des heures qu'il ne voit pas dans sa
 * grille. Les règles de comptage, elles, vivent dans `app/utils/summary.ts`, testé sans base.
 */
export async function summariseMonth(month: string, user?: UserFilter): Promise<MonthSummary> {
  const appointments = await listAppointments({ month, user })
  const db = useDb()
  const allowed = totalsAllowed(user)
  // Une seule lecture des kilomètres, partagée avec l'export CESU : le récapitulatif et le
  // fichier ne peuvent donc pas afficher deux totaux différents.
  const travel = await monthlyMileage(month, user)

  // Les co-aidants comptent dans leurs propres heures : leurs contrats doivent donc être
  // chargés aussi, sans quoi leur ligne n'aurait pas de référence.
  const assistantIds = [...new Set(appointments.flatMap(a => [a.primaryAssistantId, ...a.coAssistantIds]))]
  const beneficiaryIds = [...new Set(appointments.map(a => a.beneficiaryId))]

  // `inArray` avec un tableau vide produirait un SQL invalide : un mois sans créneau est un
  // mois vide, pas une erreur.
  const assistantRows = assistantIds.length > 0
    ? await db
        .select({ id: assistants.id, contractedMinutes: assistants.contractedMinutes })
        .from(assistants)
        .where(inArray(assistants.id, assistantIds))
    : []

  const beneficiaryRows = beneficiaryIds.length > 0
    ? await db
        .select({ id: beneficiaries.id, authorizedMinutesMonth: beneficiaries.authorizedMinutesMonth })
        .from(beneficiaries)
        .where(inArray(beneficiaries.id, beneficiaryIds))
    : []

  const contractedMinutes = new Map(assistantRows.map(row => [row.id, row.contractedMinutes]))
  const authorizedMinutes = new Map(beneficiaryRows.map(row => [row.id, row.authorizedMinutesMonth]))

  /** Une référence absente reste absente : on n'affiche pas un ratio contre rien. */
  const withReference = (line: PersonSummary, reference: number | null | undefined): SummaryLine => ({
    ...line,
    referenceMinutes: reference ?? null,
  })

  // Un aidant n'a qu'une ligne complète : la sienne.
  const assistantLines = allowed.assistants
    ? summariseByAssistant(appointments)
        .filter(line => user?.role !== 'assistant' || line.id === user.assistantId)
        .map(line => withReference(line, contractedMinutes.get(line.id)))
        // Les kilomètres ne s'attribuent à aucun bénéficiaire : ils vont donc sur la ligne de
        // l'aidant, et nulle part ailleurs. Absents quand il n'a rien déclaré.
        .map(line => ({ ...line, travelKilometers: travel.get(line.id) }))
    : []

  const beneficiaryLines = allowed.beneficiaries
    ? summariseByBeneficiary(appointments)
        .map(line => withReference(line, authorizedMinutes.get(line.id)))
    : []

  return {
    month,
    totals: summarise(appointments),
    byAssistant: assistantLines,
    byBeneficiary: beneficiaryLines,
    byDay: summariseByDay(appointments),
  }
}

/**
 * Change le statut d'un créneau, sans toucher au reste — la mutation des actions rapides.
 *
 * Elle est bornée par la table des transitions (`quickTransitions`) : `completed` et
 * `cancelled` sont des états FINAUX, on en sort par la modification complète
 * (`editAppointment`), pas par ici. La règle vit dans `app/utils/status.ts`, donc
 * l'interface et le serveur ne peuvent pas diverger.
 *
 * `false` si le créneau n'existe pas (404) ; 403 si l'utilisateur n'a pas le droit d'y
 * toucher ; 409 si la transition n'est pas une action rapide.
 */
export async function changeAppointmentStatus(id: string, status: string, user: UserFilter): Promise<boolean> {
  const db = useDb()

  const [appointment] = await db
    .select({ status: appointments.status, primaryAssistantId: appointments.primaryAssistantId })
    .from(appointments)
    .where(eq(appointments.id, id))
  if (!appointment) return false

  const coAssistants = await db
    .select({ assistantId: appointmentAssistants.assistantId })
    .from(appointmentAssistants)
    .where(eq(appointmentAssistants.appointmentId, id))

  assertMayEdit(user, [appointment.primaryAssistantId, ...coAssistants.map(co => co.assistantId)], 'modifier')

  if (!isStatus(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Statut invalide.' })
  }

  // Un statut inconnu en base (donnée abîmée) ne peut pas valider de transition : on refuse
  // plutôt que de lire `undefined` dans la table.
  if (!isStatus(appointment.status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Statut du créneau inconnu : passez par la modification du créneau.',
    })
  }

  if (!quickTransitions(appointment.status).includes(status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Statut final : passez par la modification du créneau.',
    })
  }

  await db.update(appointments).set({ status: status }).where(eq(appointments.id, id))

  return true
}

/**
 * Données de l'export CESU mensuel : le croisement aidant × bénéficiaire.
 *
 * Le récapitulatif de l'écran ne calcule pas ce croisement (il rend deux listes séparées),
 * mais l'export en a besoin : un aidant qui travaille chez deux bénéficiaires à des taux
 * différents doit voir chaque sous-total, sinon son montant n'est pas vérifiable.
 *
 * Seuls les passages qui comptent sont repris : les RÉALISÉS (déclarables) et les « à
 * vérifier » (affichés à part, hors total). Le prévisionnel et l'annulé restent dehors.
 */
export async function cesuLines(
  month: string,
  user?: UserFilter,
): Promise<{ month: string, lines: CesuLine[], travelKilometers: Record<string, number> }> {
  const appointments = await listAppointments({ month, user })
  const db = useDb()

  // Les kilomètres du mois, par aidant : les mêmes que ceux du récapitulatif, lus une fois.
  const travel = await monthlyMileage(month, user)

  const beneficiaryIds = [...new Set(appointments.map(a => a.beneficiaryId))]
  const rates = new Map<string, number | null>()
  if (beneficiaryIds.length > 0) {
    const rows = await db
      .select({ id: beneficiaries.id, hourlyRateCents: beneficiaries.hourlyRateCents })
      .from(beneficiaries)
      .where(inArray(beneficiaries.id, beneficiaryIds))
    for (const row of rows) rates.set(row.id, row.hourlyRateCents)
  }

  const byPair = new Map<string, CesuLine>()

  for (const appointment of appointments) {
    if (appointment.status !== 'completed' && appointment.status !== 'to_validate') continue

    const minutes = durationInMinutes(appointment.start, appointment.end)
    if (minutes === null) continue

    // Un binôme crédite les DEUX aidants : chacun déclare les heures qu'il a faites.
    const assistants = [
      { id: appointment.primaryAssistantId, name: appointment.primaryAssistant },
      ...appointment.coAssistantIds.map((id, index) => ({ id, name: appointment.coAssistants[index] ?? '' })),
    ]

    const seen = new Set<string>()
    for (const assistant of assistants) {
      if (seen.has(assistant.id)) continue
      seen.add(assistant.id)

      const key = `${assistant.id}|${appointment.beneficiaryId}`
      let line = byPair.get(key)
      if (!line) {
        line = {
          assistantName: assistant.name,
          beneficiaryName: appointment.beneficiary,
          declaredMinutes: 0,
          toValidateMinutes: 0,
          passages: 0,
          hourlyRateCents: rates.get(appointment.beneficiaryId) ?? null,
        }
        byPair.set(key, line)
      }

      if (appointment.status === 'completed') {
        line.declaredMinutes += minutes
        line.passages += 1
      }
      else {
        line.toValidateMinutes += minutes
      }
    }
  }

  // Le CSV est indexé par NOM d'aidant (c'est ce qu'il affiche) : on traduit les identifiants
  // une fois, ici, plutôt que de laisser la mise en forme deviner.
  const nameOf = new Map<string, string>()
  for (const appointment of appointments) {
    nameOf.set(appointment.primaryAssistantId, appointment.primaryAssistant)
    appointment.coAssistantIds.forEach((id, index) => {
      nameOf.set(id, appointment.coAssistants[index] ?? '')
    })
  }

  const travelKilometers: Record<string, number> = {}
  for (const [assistantId, kilometers] of travel) {
    const name = nameOf.get(assistantId)
    if (name) travelKilometers[name] = kilometers
  }

  return { month, lines: [...byPair.values()], travelKilometers }
}

/** Données de l'export de la semaine : les passages, avec leur statut. */
export async function weekLines(week: string, user?: UserFilter): Promise<{ dates: CivilDate[], lines: WeekLine[] }> {
  const appointments = await listAppointments({ week, user })

  return {
    dates: weekOf(week),
    lines: appointments.map(appointment => ({
      date: appointment.date,
      start: appointment.start,
      end: appointment.end,
      assistantNames: [appointment.primaryAssistant, ...appointment.coAssistants].filter(name => name !== ''),
      beneficiaryName: appointment.beneficiary,
      title: appointment.title,
      status: appointment.status,
    })),
  }
}

/**
 * Listes de référence de l'écran de création : identifiants et libellés, rien d'autre.
 *
 * Cette route existe parce que `/api/beneficiaries` est réservée à l'administrateur (elle
 * expose l'adresse, le taux horaire et le volume autorisé). Ici, un aidant obtient les
 * bénéficiaires — dont il a besoin pour saisir un passage — mais **pas** la liste de ses
 * collègues : il ne récupère que son propre profil.
 */
export async function listAppointmentOptions(user: UserFilter): Promise<AppointmentFormOptions> {
  if (user.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'administrateur et aux aidants.' })
  }
  if (user.role === 'assistant' && !user.assistantId) {
    throw createError({ statusCode: 403, statusMessage: 'Profil d\'aidant introuvable.' })
  }

  const db = useDb()

  const assistantColumns = {
    id: assistants.id,
    firstName: assistants.firstName,
    lastName: assistants.lastName,
  }

  const beneficiaryRows = await db
    .select({ id: beneficiaries.id, firstName: beneficiaries.firstName, lastName: beneficiaries.lastName })
    .from(beneficiaries)
    .orderBy(beneficiaries.lastName, beneficiaries.firstName)

  const assistantRows = await db
    .select(assistantColumns)
    .from(assistants)
    .where(user.role === 'admin' ? undefined : eq(assistants.id, user.assistantId ?? ''))
    .orderBy(assistants.lastName, assistants.firstName)

  const toOption = (row: { id: string, firstName: string, lastName: string }) => ({
    id: row.id,
    name: fullName(row.firstName, row.lastName),
  })

  return {
    beneficiaries: beneficiaryRows.map(toOption),
    assistants: assistantRows.map(toOption),
  }
}

/** L'utilisateur peut-il écrire sur un créneau auquel ces aidants participent ? */
function assertMayEdit(
  user: UserFilter,
  assistantIds: string[],
  action: 'déplacer' | 'modifier' | 'supprimer',
): void {
  if (user.role === 'admin') return
  if (user.role === 'assistant' && user.assistantId && assistantIds.includes(user.assistantId)) return

  if (user.role === 'assistant') {
    throw createError({ statusCode: 403, statusMessage: `Vous ne pouvez ${action} que vos propres créneaux.` })
  }

  throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'administrateur.' })
}

/** Traduit le refus d'une plage horaire (code testable) en erreur 400. */
function assertValidTimeRange(start: string, end: string, options?: { withinGrid?: boolean }): void {
  const problem = checkTimeRange(start, end, options)
  if (problem) {
    throw createError({ statusCode: 400, statusMessage: TIME_RANGE_MESSAGES[problem] })
  }
}

/**
 * Refuse (409) un créneau dont la plage recouvre celle d'un créneau partageant un aidant.
 *
 * La fenêtre chargée est J-1 … J+1 : un créneau de nuit commence la veille et un créneau
 * long peut se terminer le lendemain. Se limiter au jour visé laisserait passer un
 * chevauchement de part et d'autre de minuit.
 */
async function assertNoAssistantOverlap(input: {
  date: string
  start: string
  end: string
  assistantIds: string[]
  excludedId?: string
}): Promise<void> {
  const db = useDb()

  const conditions = [
    gte(appointments.date, addDays(input.date, -1)),
    lt(appointments.date, addDays(input.date, 2)),
  ]
  if (input.excludedId) conditions.push(ne(appointments.id, input.excludedId))

  const neighbours = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      start: appointments.startTime,
      end: appointments.endTime,
      primaryAssistantId: appointments.primaryAssistantId,
    })
    .from(appointments)
    .where(and(...conditions))

  if (neighbours.length === 0) return

  const coAssistants = await db
    .select({
      appointmentId: appointmentAssistants.appointmentId,
      assistantId: appointmentAssistants.assistantId,
    })
    .from(appointmentAssistants)
    .where(inArray(appointmentAssistants.appointmentId, neighbours.map(neighbour => neighbour.id)))

  const assistantIdsByAppointment = new Map<string, string[]>()
  for (const neighbour of neighbours) {
    assistantIdsByAppointment.set(neighbour.id, [neighbour.primaryAssistantId])
  }
  for (const co of coAssistants) {
    assistantIdsByAppointment.get(co.appointmentId)?.push(co.assistantId)
  }

  const booked: BookedRange[] = neighbours.map(neighbour => ({
    id: neighbour.id,
    date: neighbour.date,
    start: neighbour.start,
    end: neighbour.end,
    assistantIds: assistantIdsByAppointment.get(neighbour.id) ?? [],
  }))

  if (conflictingIds(input, booked).length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Chevauchement avec un créneau du même aidant.' })
  }
}

/**
 * Corps commun à la création et à la modification d'un créneau. Les deux écritures
 * acceptent exactement les mêmes champs : un seul contrat à figer, une seule validation.
 *
 * Le nom n'est pas exporté : les points d'entrée manipulent `CreateAppointment` ou
 * `EditAppointment`, qui disent l'intention.
 */
interface AppointmentPayload {
  date: string
  start: string
  end: string
  title: string
  status?: string
  beneficiaryId: string
  primaryAssistantId: string
}

export type CreateAppointment = AppointmentPayload
export type EditAppointment = AppointmentPayload

/** Contrôles communs ; `$` normalise l'intitulé et le statut par défaut. */
function validatePayload(input: AppointmentPayload): { title: string, status: string } {
  if (!isCivilDate(input.date)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  // Un créneau de NUIT (22:00 → 01:00) est valide : la plage 07h–22h ne borne que le
  // déplacement dans la grille, sans quoi une veille ne serait jamais saisissable.
  assertValidTimeRange(input.start, input.end)

  const title = input.title?.trim() ?? ''
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Intitulé requis.' })
  }

  const status = input.status ?? 'planned'
  if (!isStatus(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Statut invalide.' })
  }

  return { title, status }
}

/**
 * Bénéficiaire et aidant doivent exister. Sans ce contrôle, une référence inconnue
 * sortirait en 500 sur une violation de clé étrangère, sans rien dire de ce qui manque.
 */
async function assertReferencesExist(beneficiaryId: string, assistantId: string): Promise<void> {
  const db = useDb()

  const [beneficiary] = await db
    .select({ id: beneficiaries.id })
    .from(beneficiaries)
    .where(eq(beneficiaries.id, beneficiaryId))
  if (!beneficiary) {
    throw createError({ statusCode: 400, statusMessage: 'Bénéficiaire inconnu.' })
  }

  const [assistant] = await db
    .select({ id: assistants.id })
    .from(assistants)
    .where(eq(assistants.id, assistantId))
  if (!assistant) {
    throw createError({ statusCode: 400, statusMessage: 'Aidant inconnu.' })
  }
}

/**
 * Crée un créneau. L'aidant ne crée que POUR LUI-MÊME, l'admin pour n'importe qui, le
 * lecteur rien.
 */
export async function createAppointment(input: CreateAppointment, user: UserFilter): Promise<{ id: string }> {
  if (user.role === 'viewer') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Consultation seule : la création est réservée à l\'administrateur et aux aidants.',
    })
  }

  if (user.role === 'assistant' && input.primaryAssistantId !== user.assistantId) {
    throw createError({ statusCode: 403, statusMessage: 'Vous ne pouvez créer que vos propres créneaux.' })
  }

  const { title, status } = validatePayload(input)

  await assertReferencesExist(input.beneficiaryId, input.primaryAssistantId)

  await assertNoAssistantOverlap({
    date: input.date,
    start: input.start,
    end: input.end,
    assistantIds: [input.primaryAssistantId],
  })

  const db = useDb()
  const [created] = await db.insert(appointments).values({
    date: input.date,
    startTime: input.start,
    endTime: input.end,
    title: title,
    status: status,
    beneficiaryId: input.beneficiaryId,
    primaryAssistantId: input.primaryAssistantId,
  }).returning({ id: appointments.id })

  return { id: created!.id }
}

/**
 * Modifie un créneau : intitulé, statut, bénéficiaire, aidant principal et horaires — la
 * DURÉE peut changer, contrairement au déplacement (`moveAppointment`), qui ne fait que
 * translater un créneau dans la grille.
 *
 * `false` si le créneau n'existe pas (404) ; 403 si l'utilisateur n'a pas le droit d'y
 * toucher, ou si un aidant tente de confier le créneau à quelqu'un d'autre.
 */
export async function editAppointment(id: string, input: EditAppointment, user: UserFilter): Promise<boolean> {
  const db = useDb()

  const [appointment] = await db
    .select({ primaryAssistantId: appointments.primaryAssistantId })
    .from(appointments)
    .where(eq(appointments.id, id))
  if (!appointment) return false

  const coAssistants = await db
    .select({ assistantId: appointmentAssistants.assistantId })
    .from(appointmentAssistants)
    .where(eq(appointmentAssistants.appointmentId, id))
  const coAssistantIds = coAssistants.map(co => co.assistantId)

  assertMayEdit(user, [appointment.primaryAssistantId, ...coAssistantIds], 'modifier')

  if (user.role === 'assistant' && input.primaryAssistantId !== user.assistantId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Vous ne pouvez confier un créneau qu\'à vous-même.',
    })
  }

  const { title, status } = validatePayload(input)

  await assertReferencesExist(input.beneficiaryId, input.primaryAssistantId)

  // Les co-aidants restent attachés au créneau : leur planning est concerné par le
  // déplacement, le chevauchement doit donc les inclure.
  await assertNoAssistantOverlap({
    date: input.date,
    start: input.start,
    end: input.end,
    assistantIds: [input.primaryAssistantId, ...coAssistantIds],
    excludedId: id,
  })

  await db.update(appointments).set({
    date: input.date,
    startTime: input.start,
    endTime: input.end,
    title: title,
    status: status,
    beneficiaryId: input.beneficiaryId,
    primaryAssistantId: input.primaryAssistantId,
  }).where(eq(appointments.id, id))

  return true
}

/**
 * Supprime un créneau et ses co-aidants. `false` si le créneau n'existe pas (404) ; 403 si
 * l'utilisateur n'a pas le droit d'y toucher.
 */
export async function deleteAppointment(id: string, user: UserFilter): Promise<boolean> {
  const db = useDb()

  const [appointment] = await db
    .select({ primaryAssistantId: appointments.primaryAssistantId })
    .from(appointments)
    .where(eq(appointments.id, id))
  if (!appointment) return false

  const coAssistants = await db
    .select({ assistantId: appointmentAssistants.assistantId })
    .from(appointmentAssistants)
    .where(eq(appointmentAssistants.appointmentId, id))

  assertMayEdit(
    user,
    [appointment.primaryAssistantId, ...coAssistants.map(co => co.assistantId)],
    'supprimer',
  )

  // Le schéma ne déclare aucune cascade : les co-aidants partent d'abord, sinon la clé
  // étrangère bloque la suppression.
  await db.transaction(async (tx) => {
    await tx.delete(appointmentAssistants).where(eq(appointmentAssistants.appointmentId, id))
    await tx.delete(appointments).where(eq(appointments.id, id))
  })

  return true
}

/**
 * Déplace un créneau (durée conservée) vers un nouveau jour/créneau horaire, après
 * contrôle de permission et de chevauchement par aidant. Lève `createError` (403/400/409)
 * en cas de refus ; renvoie `false` si le créneau n'existe pas.
 */
export async function moveAppointment(
  id: string,
  target: { date: string, start: string, end: string },
  user: UserFilter,
): Promise<boolean> {
  const db = useDb()

  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id))
  if (!appointment) return false

  const coAssistants = await db
    .select({ assistantId: appointmentAssistants.assistantId })
    .from(appointmentAssistants)
    .where(eq(appointmentAssistants.appointmentId, id))
  const assistantIds = [appointment.primaryAssistantId, ...coAssistants.map(co => co.assistantId)]

  assertMayEdit(user, assistantIds, 'déplacer')

  if (!isCivilDate(target.date)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  // Le déplacement se fait DANS la grille : plage 07h–22h et pas de passage de minuit,
  // contrairement à la création.
  assertValidTimeRange(target.start, target.end, { withinGrid: true })

  if (durationInMinutes(target.start, target.end) !== durationInMinutes(appointment.startTime, appointment.endTime)) {
    throw createError({ statusCode: 400, statusMessage: 'La durée du créneau ne peut pas changer.' })
  }

  await assertNoAssistantOverlap({
    date: target.date,
    start: target.start,
    end: target.end,
    assistantIds: assistantIds,
    excludedId: id,
  })

  await db.update(appointments).set({
    date: target.date,
    startTime: target.start,
    endTime: target.end,
  }).where(eq(appointments.id, id))

  return true
}
