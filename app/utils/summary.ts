import type { Appointment, DaySummary, PersonSummary, SummaryTotals } from '~~/shared/types/planning'
import type { AssistantColor } from './colors'
import type { CivilDate } from './date'
import { durationInMinutes } from './duration'

/**
 * Ce qui compte comme temps RÉALISÉ, donc à DÉCLARER : un passage terminé, et rien d'autre.
 *
 * `to_validate` veut dire « à vérifier : durée ou réalité incertaine » — on ne déclare pas une
 * heure dont on n'est pas sûr. Il n'est pas caché pour autant : il a son propre cumul
 * (`toValidateMinutes`), hors total, et il devient déclarable une fois vérifié (passage en
 * « Réalisé » depuis la modale).
 *
 * `planned` est du prévisionnel, et `cancelled` ne compte nulle part.
 */
export const DECLARED_STATUSES: readonly Appointment['status'][] = ['completed']

/** Un participant à un créneau : l'aidant principal d'abord, puis les co-aidants. */
interface Participant {
  id: string
  name: string
  color?: AssistantColor
}

function emptyTotals(): SummaryTotals {
  return {
    declaredMinutes: 0,
    toValidateMinutes: 0,
    plannedMinutes: 0,
    passages: 0,
    toValidatePassages: 0,
  }
}

/**
 * Ajoute un créneau à un cumul.
 *
 * Une durée inexploitable est IGNORÉE plutôt que propagée : un `NaN` dans un total de
 * déclaration se verrait à la fin, sans qu'on sache d'où il vient.
 */
function addAppointment(totals: SummaryTotals, appointment: Appointment): void {
  if (appointment.status === 'cancelled') return

  const minutes = durationInMinutes(appointment.start, appointment.end)
  if (minutes === null) return

  if (DECLARED_STATUSES.includes(appointment.status)) {
    totals.declaredMinutes += minutes
    totals.passages += 1
    return
  }

  if (appointment.status === 'to_validate') {
    totals.toValidateMinutes += minutes
    totals.toValidatePassages += 1
    return
  }

  totals.plannedMinutes += minutes
}

/** Cumuls d'une liste de créneaux, tous statuts confondus (voir `DECLARED_STATUSES`). */
export function summarise(appointments: Appointment[]): SummaryTotals {
  const totals = emptyTotals()
  for (const appointment of appointments) addAppointment(totals, appointment)
  return totals
}

/**
 * Les aidants d'un créneau : un créneau a UN aidant principal et ZÉRO OU PLUSIEURS
 * co-aidants, et tous ont travaillé ces heures-là.
 *
 * `coAssistantIds` et `coAssistants` sont projetés depuis la MÊME requête, dans le même
 * ordre : les zipper est sûr, et c'est le seul endroit du code où on le fait.
 */
function participants(appointment: Appointment): Participant[] {
  const coAssistants = appointment.coAssistantIds.map((id, index) => ({
    id,
    name: appointment.coAssistants[index] ?? '',
  }))

  return [
    { id: appointment.primaryAssistantId, name: appointment.primaryAssistant, color: appointment.color },
    ...coAssistants,
  ]
}

/**
 * Regroupe par personne. `people` peut renvoyer plusieurs participants pour un même
 * créneau (les aidants) : c'est là que le créneau est crédité à chacun.
 *
 * Un créneau annulé, ou de durée inexploitable, crée quand même la ligne, à zéro : « rien
 * ce mois-ci » est une information, alors qu'une personne absente de la liste est un doute.
 */
function groupByPeople(
  appointments: Appointment[],
  people: (appointment: Appointment) => Participant[],
): PersonSummary[] {
  const byId = new Map<string, PersonSummary>()

  for (const appointment of appointments) {
    // Une même personne ne compte qu'une fois par créneau : le schéma autorise
    // théoriquement un aidant principal aussi co-assistant de son propre créneau.
    const seen = new Set<string>()

    for (const person of people(appointment)) {
      if (seen.has(person.id)) continue
      seen.add(person.id)

      let line = byId.get(person.id)
      if (!line) {
        line = { id: person.id, name: person.name, color: person.color, ...emptyTotals() }
        byId.set(person.id, line)
      }
      addAppointment(line, appointment)
    }
  }

  // Ordre alphabétique : une déclaration se lit aidant par aidant.
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * Cumuls par aidant. Un binôme crédite les DEUX aidants : chacun déclare les heures qu'il a
 * faites.
 */
export function summariseByAssistant(appointments: Appointment[]): PersonSummary[] {
  return groupByPeople(appointments, participants)
}

/**
 * Cumuls par bénéficiaire. Un créneau a UN bénéficiaire, et il est compté UNE fois : le
 * volume d'heures autorisé n'est pas une réserve qu'un binôme consommerait deux fois.
 */
export function summariseByBeneficiary(appointments: Appointment[]): PersonSummary[] {
  return groupByPeople(appointments, appointment => [{
    id: appointment.beneficiaryId,
    name: appointment.beneficiary,
  }])
}

/** Cumuls par jour, triés. La date reste celle du DÉBUT : un créneau de nuit (22:00 → 01:00)
 * appartient au jour où il commence, comme il est affiché dans le bloc « Nuit ».
 */
export function summariseByDay(appointments: Appointment[]): DaySummary[] {
  const byDate = new Map<CivilDate, DaySummary>()

  for (const appointment of appointments) {
    let line = byDate.get(appointment.date)
    if (!line) {
      line = { date: appointment.date, ...emptyTotals() }
      byDate.set(appointment.date, line)
    }
    addAppointment(line, appointment)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Ce qu'il faut pour confronter un cumul à une référence contractuelle. */
interface Referenced {
  declaredMinutes: number
  referenceMinutes: number | null
}

/**
 * Minutes restantes avant la référence ; `null` quand aucune référence n'est saisie.
 * Un résultat négatif est un dépassement.
 */
export function remainingMinutes(line: Referenced): number | null {
  return line.referenceMinutes === null ? null : line.referenceMinutes - line.declaredMinutes
}

/** Le volume de référence est-il dépassé ? Faux sans référence : on ne dépasse rien. */
export function exceedsReference(line: Referenced): boolean {
  const remaining = remainingMinutes(line)
  return remaining !== null && remaining < 0
}
