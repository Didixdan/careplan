import type { Appointment, DaySummary, PersonSummary, SummaryLine, SummaryTotals } from '~~/shared/types/planning'
import type { AssistantColor } from './colors'
import type { CivilDate } from './date'
import { durationInMinutes } from './duration'
import { amountCents } from './money'

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

/**
 * Heures prévisionnelles d'un cumul : **tout ce qui n'est pas annulé**.
 *
 * C'est la question du mois à venir — combien d'heures seront travaillées, et donc payées. Le
 * réalisé en fait partie (il est déjà fait, mais il appartient au mois), `to_validate` aussi,
 * et le prévu également. `cancelled`, lui, n'entre dans aucun cumul (`addAppointment`).
 */
export function forecastMinutes(
  totals: Pick<SummaryTotals, 'declaredMinutes' | 'toValidateMinutes' | 'plannedMinutes'>,
): number {
  return totals.declaredMinutes + totals.toValidateMinutes + totals.plannedMinutes
}

/** Solde prévisionnel d'un bénéficiaire : ce qu'il reste à faire, et ce que ça coûte. */
export interface ForecastLine {
  id: string
  name: string
  /** Heures prévisionnelles : réalisé + à vérifier + prévu, annulés exclus. */
  forecastMinutes: number
  /**
   * Montant prévisionnel au taux du bénéficiaire, en centimes. `null` quand le taux n'est pas
   * saisi, ou quand il n'est pas communiqué à ce rôle : on n'invente pas un prix.
   */
  amountCents: number | null
  /**
   * Volume autorisé − heures prévisionnelles. `null` sans volume saisi (un volume absent n'est
   * pas un zéro : tout paraîtrait en dépassement). Négatif = dépassement.
   */
  balanceMinutes: number | null
}

/**
 * Solde prévisionnel, bénéficiaire par bénéficiaire. L'ordre d'entrée est conservé : c'est
 * celui du récapitulatif, déjà trié par nom.
 */
export function forecastByBeneficiary(lines: SummaryLine[]): ForecastLine[] {
  return lines.map((line) => {
    const minutes = forecastMinutes(line)

    return {
      id: line.id,
      name: line.name,
      forecastMinutes: minutes,
      // `undefined` (taux non communiqué) et `null` (taux non saisi) donnent le même résultat
      // ici ; c'est l'écran qui les distingue, pour ne pas écrire « À saisir » à tort.
      amountCents: line.hourlyRateCents === undefined
        ? null
        : amountCents(minutes, line.hourlyRateCents),
      balanceMinutes: line.referenceMinutes === null ? null : line.referenceMinutes - minutes,
    }
  })
}

/** Ce que le mois entier prévoit : heures, montant, et ce qu'il reste à planifier. */
export interface ForecastSummary {
  forecastMinutes: number
  /**
   * Montant prévisionnel du mois. `null` dès qu'un taux manque : un total partiel présenté
   * comme complet finirait sur un virement (même règle que le CSV CESU).
   */
  amountCents: number | null
  /** Bénéficiaires dont le taux manque — explique un montant absent, sans le justifier. */
  missingRateCount: number
  /**
   * Somme des soldes des bénéficiaires QUI ONT un volume ; `null` si aucun n'en a. Le solde
   * ne couvre donc jamais un bénéficiaire sans volume : `withoutVolumeCount` le dit.
   */
  balanceMinutes: number | null
  /** Bénéficiaires sans volume autorisé saisi : le solde ne les couvre pas. */
  withoutVolumeCount: number
  /** Bénéficiaires dont le prévisionnel dépasse le volume autorisé. */
  exceededCount: number
}

/** Agrège les lignes de solde du mois. */
export function forecastSummary(lines: ForecastLine[]): ForecastSummary {
  const forecastTotal = lines.reduce((total, line) => total + line.forecastMinutes, 0)

  const missingRateCount = lines.filter(line => line.amountCents === null).length
  const amountTotal = missingRateCount === 0
    ? lines.reduce((total, line) => total + (line.amountCents ?? 0), 0)
    : null

  const balanced = lines.filter(line => line.balanceMinutes !== null)

  return {
    forecastMinutes: forecastTotal,
    amountCents: amountTotal,
    missingRateCount,
    balanceMinutes: balanced.length > 0
      ? balanced.reduce((total, line) => total + (line.balanceMinutes ?? 0), 0)
      : null,
    withoutVolumeCount: lines.length - balanced.length,
    exceededCount: balanced.filter(line => (line.balanceMinutes ?? 0) < 0).length,
  }
}
