import { and, asc, eq, gte, inArray, lt, ne, or } from 'drizzle-orm'
import { conflictingIds, type BookedRange } from '../../app/utils/conflicts'
import type { CivilDate } from '../../app/utils/date'
import { addDays, isCivilDate, isCivilMonth, monthAfter, monthStart, startOfWeek, week as weekOf, weekShift } from '../../app/utils/date'
import type { AssistantColor } from '../../app/utils/colors'
import { durationInMinutes } from '../../app/utils/duration'
import type { CesuLine, WeekLine } from '../../app/utils/export'
import { checkTimeRange, GRID_END_MINUTES, GRID_START_MINUTES, type TimeRangeProblem } from '../../app/utils/grid'
import { isStatus, quickTransitions } from '../../app/utils/status'
import { checkTagNames, cleanTagNames, MAX_TAGS, type TagProblem } from '../../app/utils/tags'
import {
  forecastMinutes,
  incomeTotals,
  summarise,
  summariseByAssistant,
  summariseByBeneficiary,
  summariseByDay,
  summariseByPair,
  toIncomeLine,
} from '../../app/utils/summary'
import type {
  Appointment,
  AppointmentFormOptions,
  CopyWeekPreview,
  CopyWeekRequest,
  CopyWeekResult,
  MonthSummary,
  PersonSummary,
  Role,
  SummaryLine,
  TagOption,
  WeekIncomeLine,
  WeekSummary,
} from '../../shared/types/planning'
import { appointmentAssistants, appointmentTags, appointments, assistants, beneficiaries, tags } from '../db/schema'
import { useDb } from '../utils/db'
import { monthlyMileage, weeklyMileage } from './mileage'
import { listTagOptions, resolveTagIds } from './tags'

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
 * bénéficiaire (couleur incluse), aidant principal (couleur incluse) et co-aidants. Les deux
 * couleurs sont lues ICI, à chaque requête : changer la couleur d'un bénéficiaire recolore
 * donc tout son planning passé, sans reprise de données. Le filtre par rôle borne l'aidant à
 * ses créneaux et le bénéficiaire (lecture) aux siens.
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
      status: appointments.status,
      beneficiaryFirstName: beneficiaries.firstName,
      beneficiaryNom: beneficiaries.lastName,
      beneficiaryId: appointments.beneficiaryId,
      beneficiaryColor: beneficiaries.color,
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

  // Les tags, dans l'ORDRE enregistré (`position`) : `inArray` ne garantit aucun ordre, et
  // c'est cet ordre qui décide des trois tags affichés sur une carte. Une seule requête pour
  // tous les créneaux de la fenêtre, comme les co-aidants.
  const tagLignes = await db
    .select({
      appointmentId: appointmentTags.appointmentId,
      position: appointmentTags.position,
      id: tags.id,
      name: tags.name,
    })
    .from(appointmentTags)
    .innerJoin(tags, eq(tags.id, appointmentTags.tagId))
    .where(inArray(appointmentTags.appointmentId, ids))
    .orderBy(asc(appointmentTags.position))

  const tagsParAppointment = new Map<string, TagOption[]>()
  for (const tag of tagLignes) {
    const list = tagsParAppointment.get(tag.appointmentId) ?? []
    list.push({ id: tag.id, name: tag.name })
    tagsParAppointment.set(tag.appointmentId, list)
  }

  return rows.map((row) => {
    const coAssistants = coParAppointment.get(row.id) ?? []
    return {
      id: row.id,
      date: row.date,
      start: row.start,
      end: row.end,
      tags: tagsParAppointment.get(row.id) ?? [],
      status: row.status as Appointment['status'],
      beneficiary: fullName(row.beneficiaryFirstName, row.beneficiaryNom),
      beneficiaryId: row.beneficiaryId,
      beneficiaryColor: row.beneficiaryColor as AssistantColor | null,
      primaryAssistant: fullName(row.assistantFirstName, row.assistantNom),
      primaryAssistantId: row.primaryAssistant,
      assistantColor: row.color as AssistantColor,
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
 * - un aidant ne voit que ses créneaux : sa propre ligne est complète (celle d'un co-aidant ne
 *   le serait pas), et ses lignes par bénéficiaire ne comptent que SES passages — d'où les
 *   volumes de référence calculés à part, sur toutes les heures du mois (`reference*`) ;
 * - une famille voit tous les créneaux de son bénéficiaire — sa consommation et son volume
 *   autorisé sont donc exacts — mais pas ceux d'un aidant chez d'autres personnes.
 */
function totalsAllowed(user: UserFilter | undefined): { assistants: boolean, beneficiaries: boolean } {
  // La famille ne reçoit pas les lignes par aidant : elle ignore qui travaille chez les autres.
  return { assistants: !user || user.role !== 'viewer', beneficiaries: true }
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
        .select({
          id: beneficiaries.id,
          authorizedMinutesMonth: beneficiaries.authorizedMinutesMonth,
          hourlyRateCents: beneficiaries.hourlyRateCents,
        })
        .from(beneficiaries)
        .where(inArray(beneficiaries.id, beneficiaryIds))
    : []

  const contractedMinutes = new Map(assistantRows.map(row => [row.id, row.contractedMinutes]))
  const authorizedMinutes = new Map(beneficiaryRows.map(row => [row.id, row.authorizedMinutesMonth]))
  const hourlyRates = new Map(beneficiaryRows.map(row => [row.id, row.hourlyRateCents]))

  /**
   * Le taux horaire est chargé pour qui a l'usage d'un montant : l'admin, qui paie, et
   * **l'aidant concerné** — c'est ce taux qui compose sa rémunération, et son export CESU le
   * lui donne déjà. Le champ reste ABSENT pour un lecteur (bénéficiaire ou famille), qui n'a
   * pas à voir le coût employeur : `undefined` veut dire « non communiqué », à ne pas
   * confondre avec `null`, « pas encore saisi ».
   */
  const showRates = !user || user.role === 'admin' || user.role === 'assistant'

  /**
   * Le volume autorisé appartient au BÉNÉFICIAIRE, pas à l'aidant : le solde d'un aidant doit
   * donc se calculer sur **toutes** les heures du mois, tous aidants confondus. Sans cela, son
   * « reste 6 h 30 » ignorerait les 5 h d'un collègue, et serait faux.
   *
   * On agrège (jamais les passages eux-mêmes, qui restent filtrés par rôle) : un seul chiffre
   * par bénéficiaire, comme celui que voit la famille.
   */
  const consumedByAll = user?.role === 'assistant'
    ? new Map((await summariseByBeneficiary(await listAppointments({ month }))).map(line => [line.id, line]))
    : new Map<string, PersonSummary>()

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
        .map((line) => {
          // Ce qui consomme le volume autorisé : les heures de tout le monde pour un aidant,
          // les siennes sinon (sa ligne EST le total).
          const all = consumedByAll.get(line.id)

          return {
            ...withReference(line, authorizedMinutes.get(line.id)),
            // Champ ABSENT quand le rôle n'y a pas droit : l'écran distingue « non communiqué »
            // de « pas saisi », sans quoi il écrirait « À saisir » à la place du néant.
            ...(showRates ? { hourlyRateCents: hourlyRates.get(line.id) ?? null } : {}),
            ...(all
              ? {
                  referenceDeclaredMinutes: all.declaredMinutes,
                  referenceForecastMinutes: forecastMinutes(all),
                }
              : {}),
          }
        })
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
 * Récapitulatif d'une SEMAINE : les chiffres du tableau de bord.
 *
 * Même source que le mois — `listAppointments`, donc le même filtre par rôle que la grille — et
 * mêmes règles de comptage (`app/utils/summary.ts`). Trois choses lui sont propres :
 *
 * - les revenus se lisent par **couple aidant × bénéficiaire** (`summariseByPair`) : le montant
 *   suit le taux du bénéficiaire, donc un aidant qui travaille chez deux personnes a deux lignes,
 *   chacune à son taux ;
 * - les kilomètres sont ceux de la semaine, par aidant (`weeklyMileage`) ;
 * - le taux reste réservé à l'admin et à l'aidant concerné (`showRates`) : un lecteur reçoit les
 *   heures, jamais le coût employeur.
 */
export async function summariseWeek(week: string, user?: UserFilter): Promise<WeekSummary> {
  if (!isCivilDate(week)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  // N'importe quel jour de la semaine est accepté ; la réponse porte le lundi résolu.
  const monday = startOfWeek(week)
  const appointments = await listAppointments({ week: monday, user })
  const showRates = !user || user.role === 'admin' || user.role === 'assistant'

  const pairs = summariseByPair(appointments)
  const beneficiaryIds = [...new Set(pairs.map(pair => pair.beneficiaryId))]

  const rates = new Map<string, number | null>()
  // `inArray` avec un tableau vide produirait un SQL invalide : une semaine sans créneau est une
  // semaine vide, pas une erreur.
  if (showRates && beneficiaryIds.length > 0) {
    const db = useDb()
    const rows = await db
      .select({ id: beneficiaries.id, hourlyRateCents: beneficiaries.hourlyRateCents })
      .from(beneficiaries)
      .where(inArray(beneficiaries.id, beneficiaryIds))
    for (const row of rows) rates.set(row.id, row.hourlyRateCents)
  }

  const byPair: WeekIncomeLine[] = pairs.map(pair => toIncomeLine(
    pair,
    // `undefined` = taux non communiqué à ce rôle : le champ disparaît du DTO.
    showRates ? rates.get(pair.beneficiaryId) ?? null : undefined,
  ))

  return {
    week: monday,
    dates: weekOf(monday),
    totals: summarise(appointments),
    byDay: summariseByDay(appointments),
    byPair,
    income: incomeTotals(byPair),
    mileage: await weeklyMileage(monday, user),
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
      tags: appointment.tags.map(tag => tag.name),
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
    // Le catalogue entier : l'autocomplete filtre côté client, donc aucune requête par frappe.
    tags: await listTagOptions(),
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
  /** Noms des tags, dans l'ordre d'affichage. Le serveur résout ou crée les tags manquants. */
  tags: string[]
  status?: string
  beneficiaryId: string
  primaryAssistantId: string
}

export type CreateAppointment = AppointmentPayload
export type EditAppointment = AppointmentPayload

/** Refus d'une liste de tags → message affiché (même table que les plages horaires). */
const TAG_MESSAGES: Record<TagProblem, string> = {
  'empty': 'Au moins un tag est requis.',
  'too-many': `${MAX_TAGS} tags au maximum.`,
}

/** Contrôles communs ; `$` normalise les tags et le statut par défaut. */
function validatePayload(input: AppointmentPayload): { tags: string[], status: string } {
  if (!isCivilDate(input.date)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  // Un créneau de NUIT (22:00 → 01:00) est valide : la plage 07h–22h ne borne que le
  // déplacement dans la grille, sans quoi une veille ne serait jamais saisissable.
  assertValidTimeRange(input.start, input.end)

  // Les tags remplacent l'ancien intitulé : comme lui, ils décrivent ce qu'on vient faire.
  // La règle est pure et testée (`checkTagNames`), le message vit ici.
  const tags = cleanTagNames(input.tags ?? [])
  const tagProblem = checkTagNames(tags)
  if (tagProblem) {
    throw createError({ statusCode: 400, statusMessage: TAG_MESSAGES[tagProblem] })
  }

  const status = input.status ?? 'planned'
  if (!isStatus(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Statut invalide.' })
  }

  return { tags, status }
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

  const { tags: tagNames, status } = validatePayload(input)

  await assertReferencesExist(input.beneficiaryId, input.primaryAssistantId)

  await assertNoAssistantOverlap({
    date: input.date,
    start: input.start,
    end: input.end,
    assistantIds: [input.primaryAssistantId],
  })

  const db = useDb()
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(appointments).values({
      date: input.date,
      startTime: input.start,
      endTime: input.end,
      status: status,
      beneficiaryId: input.beneficiaryId,
      primaryAssistantId: input.primaryAssistantId,
    }).returning({ id: appointments.id })

    const tagIds = await resolveTagIds(tx, tagNames)

    await tx.insert(appointmentTags).values(
      tagIds.map((tagId, position) => ({ appointmentId: created!.id, tagId, position })),
    )

    return { id: created!.id }
  })
}

/**
 * Modifie un créneau : tags, statut, bénéficiaire, aidant principal et horaires — la
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

  const { tags: tagNames, status } = validatePayload(input)

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

  // Le créneau et ses tags changent ensemble : une liste à moitié remplacée serait un
  // créneau décrit par autre chose que ce que la personne vient de valider.
  await db.transaction(async (tx) => {
    await tx.update(appointments).set({
      date: input.date,
      startTime: input.start,
      endTime: input.end,
      status: status,
      beneficiaryId: input.beneficiaryId,
      primaryAssistantId: input.primaryAssistantId,
    }).where(eq(appointments.id, id))

    // Remplacement complet, dans l'ordre reçu : l'édition porte sur la liste entière.
    await tx.delete(appointmentTags).where(eq(appointmentTags.appointmentId, id))

    const tagIds = await resolveTagIds(tx, tagNames)
    await tx.insert(appointmentTags).values(
      tagIds.map((tagId, position) => ({ appointmentId: id, tagId, position })),
    )
  })

  return true
}

/**
 * Supprime un créneau, ses co-aidants et ses tags. `false` si le créneau n'existe pas (404) ;
 * 403 si l'utilisateur n'a pas le droit d'y toucher.
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

  // Le schéma ne déclare aucune cascade : les co-aidants et les tags partent d'abord, sinon
  // la clé étrangère bloque la suppression.
  await db.transaction(async (tx) => {
    await tx.delete(appointmentAssistants).where(eq(appointmentAssistants.appointmentId, id))
    await tx.delete(appointmentTags).where(eq(appointmentTags.appointmentId, id))
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

/**
 * Copie d'une semaine sur une autre.
 *
 * Le vocabulaire est celui du domaine, pas de la base : on COPIE des créneaux, on ne
 * « duplique » pas des lignes. Rien ici ne lit ni n'écrit d'objet `Date` (règle 3) : les
 * dates restent des chaînes civiles, décalées par `weekShift`.
 */

/** Le rôle lecture seule ne copie rien : même refus que la création, même message. */
function assertMayCopy(user: UserFilter): void {
  if (user.role === 'viewer') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Consultation seule : la copie est réservée à l\'administrateur et aux aidants.',
    })
  }

  if (user.role === 'assistant' && !user.assistantId) {
    throw createError({ statusCode: 403, statusMessage: 'Profil d\'aidant introuvable.' })
  }
}

/**
 * Validation commune aux deux routes : deux dates civiles, et deux semaines DIFFÉRENTES.
 *
 * Copier une semaine sur elle-même supprimerait puis réécrirait les mêmes créneaux en
 * changeant leurs statuts : ce n'est pas une copie, c'est une remise à « Planifié » déguisée.
 */
function copyWeeks(source: string, target: string): { sourceWeek: CivilDate, targetWeek: CivilDate } {
  if (!isCivilDate(source) || !isCivilDate(target)) {
    throw createError({ statusCode: 400, statusMessage: 'Date invalide.' })
  }

  const sourceWeek = startOfWeek(source)
  const targetWeek = startOfWeek(target)

  if (sourceWeek === targetWeek) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La semaine source et la semaine cible sont identiques.',
    })
  }

  return { sourceWeek, targetWeek }
}

/** Un créneau d'une semaine, avec de quoi le réécrire ailleurs : tags et co-aidants inclus. */
interface WeekRow {
  id: string
  date: string
  start: string
  end: string
  status: string
  beneficiaryId: string
  beneficiaryName: string
  primaryAssistantId: string
  tagIds: string[]
  coAssistantIds: string[]
}

/**
 * Les créneaux d'une semaine, bornés au PÉRIMÈTRE D'ÉCRITURE de l'utilisateur.
 *
 * La MÊME fonction décide de ce qu'on copie et de ce qu'on supprime dans la semaine cible :
 * « on remplace exactement ce qu'on copie ». Sans cette règle, un aidant effacerait le
 * planning d'un collègue avec une copie qui ne porte que sur ses propres créneaux.
 *
 * L'aidant est borné à ses créneaux d'aidant PRINCIPAL : un créneau où il n'est que
 * co-aidant appartient au planning de quelqu'un d'autre, il ne le copie pas.
 */
async function scopedWeekRows(weekStart: CivilDate, user: UserFilter): Promise<WeekRow[]> {
  const db = useDb()

  const conditions = [
    gte(appointments.date, weekStart),
    lt(appointments.date, addDays(weekStart, 7)),
  ]

  if (user.role === 'assistant') {
    conditions.push(eq(appointments.primaryAssistantId, user.assistantId ?? ''))
  }

  const rows = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      start: appointments.startTime,
      end: appointments.endTime,
      status: appointments.status,
      beneficiaryId: appointments.beneficiaryId,
      beneficiaryFirstName: beneficiaries.firstName,
      beneficiaryLastName: beneficiaries.lastName,
      primaryAssistantId: appointments.primaryAssistantId,
    })
    .from(appointments)
    .innerJoin(beneficiaries, eq(beneficiaries.id, appointments.beneficiaryId))
    .where(and(...conditions))
    .orderBy(asc(appointments.date), asc(appointments.startTime))

  if (rows.length === 0) return []

  const ids = rows.map(row => row.id)

  // Tags et co-aidants en deux requêtes pour toute la semaine, comme `listAppointments` :
  // leurs ORDRES respectifs (position, insertion) doivent être conservés à la copie.
  const tagRows = await db
    .select({ appointmentId: appointmentTags.appointmentId, tagId: appointmentTags.tagId })
    .from(appointmentTags)
    .where(inArray(appointmentTags.appointmentId, ids))
    .orderBy(asc(appointmentTags.position))

  const tagIdsByAppointment = new Map<string, string[]>()
  for (const tag of tagRows) {
    tagIdsByAppointment.set(tag.appointmentId, [...(tagIdsByAppointment.get(tag.appointmentId) ?? []), tag.tagId])
  }

  const coRows = await db
    .select({ appointmentId: appointmentAssistants.appointmentId, assistantId: appointmentAssistants.assistantId })
    .from(appointmentAssistants)
    .where(inArray(appointmentAssistants.appointmentId, ids))

  const coIdsByAppointment = new Map<string, string[]>()
  for (const co of coRows) {
    coIdsByAppointment.set(co.appointmentId, [...(coIdsByAppointment.get(co.appointmentId) ?? []), co.assistantId])
  }

  return rows.map(row => ({
    id: row.id,
    date: row.date,
    start: row.start,
    end: row.end,
    status: row.status,
    beneficiaryId: row.beneficiaryId,
    beneficiaryName: fullName(row.beneficiaryFirstName, row.beneficiaryLastName),
    primaryAssistantId: row.primaryAssistantId,
    tagIds: tagIdsByAppointment.get(row.id) ?? [],
    coAssistantIds: coIdsByAppointment.get(row.id) ?? [],
  }))
}

/**
 * Aperçu d'une copie, lu AVANT d'écrire (`GET /api/appointments/copy`).
 *
 * C'est la source unique des comptes affichés par l'écran : ils viennent de la même règle de
 * périmètre que la copie, donc l'écran ne peut pas promettre autre chose que ce que le
 * serveur fera. Lecture seule, aucune écriture.
 */
export async function previewCopyWeek(
  input: { source: string, target: string },
  user: UserFilter,
): Promise<CopyWeekPreview> {
  assertMayCopy(user)
  const { sourceWeek, targetWeek } = copyWeeks(input.source, input.target)

  const [source, target] = await Promise.all([
    scopedWeekRows(sourceWeek, user),
    scopedWeekRows(targetWeek, user),
  ])

  return {
    sourceWeek,
    targetWeek,
    sourceCount: source.length,
    targetCount: target.length,
    // Les annulés sont signalés, pas cachés : ils repartiront en « Planifié », ce qui peut
    // recréer un passage que la famille avait annulé pour une raison ponctuelle.
    cancelled: source
      .filter(row => row.status === 'cancelled')
      .map(row => ({ date: row.date, start: row.start, end: row.end, beneficiary: row.beneficiaryName })),
  }
}

/**
 * Recopie une semaine sur une autre : les créneaux de la cible, dans le périmètre de
 * l'utilisateur, sont SUPPRIMÉS puis remplacés par ceux de la source, dans une seule
 * transaction — une semaine à moitié remplacée serait un planning faux.
 *
 * Trois règles qui ne se lisent pas dans le code appelant :
 * - **Statuts remis à `planned`** : une copie est un prévisionnel. Recopier « Réalisé »
 *   inventerait des heures à déclarer au CESU, et « à vérifier » une vérification déjà faite.
 * - **Aucun contrôle de chevauchement ni de plage horaire** : la donnée copiée existe déjà en
 *   base, donc elle est valide par construction. Les fixtures contiennent volontairement des
 *   chevauchements et une nuit de 22:00 → 01:00 ; les refuser ici rendrait un planning réel
 *   incopiable.
 * - **Tags copiés par identifiant** : le vocabulaire n'est ni créé ni renommé par une copie.
 *
 * Les kilomètres ne suivent pas : un relevé déclare ce qui a été fait, jour par jour.
 */
export async function copyWeek(input: CopyWeekRequest, user: UserFilter): Promise<CopyWeekResult> {
  assertMayCopy(user)
  const { sourceWeek, targetWeek } = copyWeeks(input.source, input.target)

  const source = await scopedWeekRows(sourceWeek, user)
  // Une source vide ne doit RIEN supprimer : sans cette sortie, copier une semaine vide
  // viderait la cible, ce qui est exactement l'inverse de ce que la personne a demandé.
  if (source.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'La semaine choisie ne contient aucun créneau à copier.',
    })
  }

  const target = await scopedWeekRows(targetWeek, user)
  if (target.length > 0 && input.replace !== true) {
    throw createError({
      statusCode: 409,
      statusMessage: `La semaine cible contient ${target.length} créneau${target.length > 1 ? 'x' : ''} : `
        + 'leur remplacement doit être confirmé.',
    })
  }

  const shift = weekShift(sourceWeek, targetWeek)
  const deletedIds = target.map(row => row.id)
  const db = useDb()

  await db.transaction(async (tx) => {
    // Aucune cascade n'est déclarée au schéma : les co-aidants et les tags partent d'abord,
    // sinon la clé étrangère bloque la suppression (même ordre que `deleteAppointment`).
    if (deletedIds.length > 0) {
      await tx.delete(appointmentAssistants).where(inArray(appointmentAssistants.appointmentId, deletedIds))
      await tx.delete(appointmentTags).where(inArray(appointmentTags.appointmentId, deletedIds))
      await tx.delete(appointments).where(inArray(appointments.id, deletedIds))
    }

    // Une insertion par créneau : l'identifiant est généré par la base, et la restitution
    // d'un `INSERT` multi-lignes ne garantit aucun ordre, donc aucune correspondance
    // fiable entre un créneau source et son identifiant. Une semaine en compte des dizaines.
    for (const row of source) {
      const [created] = await tx.insert(appointments).values({
        date: addDays(row.date, shift),
        startTime: row.start,
        endTime: row.end,
        status: 'planned',
        beneficiaryId: row.beneficiaryId,
        primaryAssistantId: row.primaryAssistantId,
      }).returning({ id: appointments.id })

      const appointmentId = created!.id

      if (row.tagIds.length > 0) {
        await tx.insert(appointmentTags).values(
          row.tagIds.map((tagId, position) => ({ appointmentId, tagId, position })),
        )
      }

      if (row.coAssistantIds.length > 0) {
        await tx.insert(appointmentAssistants).values(
          row.coAssistantIds.map(assistantId => ({ appointmentId, assistantId })),
        )
      }
    }
  })

  return { copied: source.length, deleted: deletedIds.length }
}
