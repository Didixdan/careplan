import type { Status } from '~~/shared/types/planning'
import { toCsv, type CsvValue } from './csv'
import type { CivilDate } from './date'
import { longDay, weekLabel } from './date'
import { durationInMinutes, formatDuration } from './duration'
import { amountCents, formatCents, formatHoursDecimal } from './money'
import { STATUS_LABELS } from './status'

/**
 * Exports chiffrés : le récapitulatif CESU du mois (par aidant × bénéficiaire) et la semaine
 * par aidant.
 *
 * Tout est calculé ici, en fonctions pures : les routes ne font que lire la base et appeler
 * ces constructeurs. Un montant faux dans une déclaration ne se voit pas à l'écran — il se
 * voit sur un virement —, donc le calcul et sa mise en forme doivent être testables au
 * caractère près.
 */

/** Ce qu'on écrit quand le bénéficiaire n'a pas de taux horaire saisi. */
export const MISSING_RATE = 'À saisir'

/** Marqueur de la ligne de total d'un aidant, dans la colonne « Bénéficiaire ». */
export const ASSISTANT_TOTAL_LABEL = 'Total aidant'

/** Marqueur de la ligne de total d'une semaine, dans la colonne « Intitulé ». */
export const WEEK_TOTAL_LABEL = 'Total semaine (hors annulés)'

/** Cumul d'un aidant chez un bénéficiaire, pour le mois. */
export interface CesuLine {
  assistantName: string
  beneficiaryName: string
  /** Minutes réalisées (`completed`) : les seules déclarables. */
  declaredMinutes: number
  /** Minutes à vérifier (`to_validate`) : affichées, jamais déclarées. */
  toValidateMinutes: number
  passages: number
  hourlyRateCents: number | null
}

/** Un passage de la semaine. */
export interface WeekLine {
  date: CivilDate
  start: string
  end: string
  /** Tous les aidants du créneau, principal d'abord : un binôme en a deux, et les deux comptent. */
  assistantNames: string[]
  beneficiaryName: string
  title: string
  status: Status
}

const CESU_HEADER: CsvValue[] = [
  'Période',
  'Aidant',
  'Bénéficiaire',
  'Heures (décimal)',
  'Durée (h:min)',
  'Passages',
  'Heures à vérifier (décimal)',
  'Taux horaire (€)',
  'Montant (€)',
  'Km',
]

const WEEK_HEADER: CsvValue[] = [
  'Semaine',
  'Aidant(s)',
  'Date',
  'Jour',
  'Début',
  'Fin',
  'Durée (h:min)',
  'Heures (décimal)',
  'Bénéficiaire',
  'Intitulé',
  'Statut',
]

/**
 * Une ligne de cumul : heures, durée lisible, passages, montant si le taux existe, et les
 * kilomètres — `null` laisse la cellule vide, ce qui est le cas des lignes par bénéficiaire.
 */
function cesuRow(period: string, label: string, line: {
  assistantName: string
  declaredMinutes: number
  toValidateMinutes: number
  passages: number
  hourlyRateCents: number | null
  kilometers: number | null
}): CsvValue[] {
  const amount = amountCents(line.declaredMinutes, line.hourlyRateCents)

  return [
    period,
    line.assistantName,
    label,
    formatHoursDecimal(line.declaredMinutes),
    formatDuration(line.declaredMinutes),
    line.passages,
    formatHoursDecimal(line.toValidateMinutes),
    line.hourlyRateCents === null ? MISSING_RATE : formatCents(line.hourlyRateCents),
    amount === null ? MISSING_RATE : formatCents(amount),
    // Deux décimales, comme tous les autres nombres du fichier : un tableur aligne, et
    // « 12,5 » à côté de « 12,50 » se lit mal.
    line.kilometers === null ? '' : line.kilometers.toFixed(2).replace('.', ','),
  ]
}

/**
 * CSV du récapitulatif CESU mensuel : une ligne par couple aidant × bénéficiaire, puis un
 * total par aidant.
 *
 * **Un taux manquant rend le total « À saisir »** : un total partiel présenté comme complet
 * serait pire qu'un trou visible, puisqu'il finirait sur une déclaration.
 *
 * `travelKilometers` est indexé par NOM d'aidant, et ne remplit que sa ligne de total : des
 * kilomètres déclarés à la journée ne s'attribuent à aucun bénéficiaire.
 */
export function cesuCsv(
  month: string,
  lines: CesuLine[],
  travelKilometers: Record<string, number> = {},
): string {
  const rows: CsvValue[][] = [CESU_HEADER]

  const assistants = [...new Set(lines.map(line => line.assistantName))].sort((a, b) => a.localeCompare(b, 'fr'))

  for (const assistant of assistants) {
    const own = lines
      .filter(line => line.assistantName === assistant)
      .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, 'fr'))

    for (const line of own) {
      rows.push(cesuRow(month, line.beneficiaryName, { ...line, assistantName: assistant, kilometers: null }))
    }

    const declaredMinutes = own.reduce((n, line) => n + line.declaredMinutes, 0)
    const toValidateMinutes = own.reduce((n, line) => n + line.toValidateMinutes, 0)
    const passages = own.reduce((n, line) => n + line.passages, 0)
    const completeRates = own.every(line => line.hourlyRateCents !== null)
    const singleRate = new Set(own.map(line => line.hourlyRateCents)).size === 1
      ? own[0]?.hourlyRateCents ?? null
      : null

    rows.push(cesuRow(month, ASSISTANT_TOTAL_LABEL, {
      assistantName: assistant,
      declaredMinutes,
      toValidateMinutes,
      passages,
      // Plusieurs taux différents : le total n'a pas UN taux. Le montant reste juste (il est
      // la somme des sous-totaux) ; seule la colonne du taux est laissée vide.
      hourlyRateCents: completeRates && singleRate !== null ? singleRate : null,
      // Toujours rempli sur le total : 0 veut dire « rien déclaré », ce qui est une
      // information, pas un vide.
      kilometers: travelKilometers[assistant] ?? 0,
    }))
  }

  return toCsv(rows)
}

/**
 * CSV de la semaine : tous les passages (statuts compris, pour qu'un créneau annulé se voie),
 * puis le total d'heures de chaque aidant, annulés exclus — on ne totalise pas ce qui n'a pas
 * eu lieu.
 */
export function weekCsv(dates: CivilDate[], lines: WeekLine[]): string {
  const period = weekLabel(dates)
  const rows: CsvValue[][] = [WEEK_HEADER]

  const ordered = [...lines].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.beneficiaryName.localeCompare(b.beneficiaryName, 'fr'),
  )

  for (const line of ordered) {
    const minutes = durationInMinutes(line.start, line.end)
    const duration = line.status === 'cancelled' ? null : minutes

    rows.push([
      period,
      line.assistantNames.join(', '),
      line.date,
      longDay(line.date),
      line.start,
      line.end,
      duration === null ? '' : formatDuration(duration),
      duration === null ? '' : formatHoursDecimal(duration),
      line.beneficiaryName,
      line.title,
      STATUS_LABELS[line.status],
    ])
  }

  // Un binôme compte pour SES DEUX aidants : le total par aidant inclut donc les créneaux où
  // il n'est que co-aidant, sinon ses heures disparaîtraient de la semaine.
  const assistants = [...new Set(ordered.flatMap(line => line.assistantNames))]
    .filter(name => name !== '')
    .sort((a, b) => a.localeCompare(b, 'fr'))

  for (const assistant of assistants) {
    const minutes = ordered
      .filter(line => line.assistantNames.includes(assistant) && line.status !== 'cancelled')
      .reduce((n, line) => n + (durationInMinutes(line.start, line.end) ?? 0), 0)

    rows.push([
      period,
      assistant,
      '',
      '',
      '',
      '',
      formatDuration(minutes),
      formatHoursDecimal(minutes),
      '',
      WEEK_TOTAL_LABEL,
      '',
    ])
  }

  return toCsv(rows)
}
