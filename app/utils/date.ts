// Dates CIVILES en chaînes 'YYYY-MM-DD', jamais un `Date` exposé : un `Date` porte un
// instant et un fuseau, et un créneau changerait de jour selon le fuseau du serveur.
// `Date` reste interne, en UTC, pour les calculs de calendrier.

export type CivilDate = string

/** Mois civil en chaîne `'YYYY-MM'`. Même raison que les dates : aucun fuseau, jamais un `Date`. */
export type CivilMonth = string

const MS_PER_DAY = 24 * 60 * 60 * 1000

const SHORT_DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const LONG_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function toUTCDate(date: CivilDate): Date {
  // `noUncheckedIndexedAccess` rend chaque élément `number | undefined` : on
  // nomme les valeurs et on fournit un repli, plutôt que de déstructurer.
  const parts = date.split('-').map(Number)
  const year = parts[0] ?? 1970
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return new Date(Date.UTC(year, month - 1, day))
}

function toCivilDate(d: Date): CivilDate {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  // Rejette les dates inexistantes comme 2025-02-30.
  return toCivilDate(toUTCDate(value)) === value
}

/** `'2026-10'`, et rien d'autre : ni `'2026-13'`, ni `'2026-1'`, ni une date complète. */
export function isCivilMonth(value: unknown): value is CivilMonth {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Mois civil d'une date : `'2026-10-02'` → `'2026-10'`. */
export function monthOf(date: CivilDate): CivilMonth {
  return date.slice(0, 7)
}

/** Premier jour du mois. Suppose le mois déjà validé (`isCivilMonth`). */
export function monthStart(month: CivilMonth): CivilDate {
  return `${month}-01`
}

/**
 * Premier jour du mois SUIVANT — la borne **exclusive** d'une lecture mensuelle.
 *
 * Décembre + 1 → janvier de l'année suivante : `Date.UTC` normalise le débordement, on ne
 * réécrit donc pas à la main une arithmétique de calendrier.
 */
export function monthAfter(month: CivilMonth): CivilDate {
  const parts = month.split('-').map(Number)
  const year = parts[0] ?? 1970
  const monthNumber = parts[1] ?? 1
  // `Date.UTC` attend un mois à base 0 : passer `monthNumber` donne bien le mois suivant.
  return toCivilDate(new Date(Date.UTC(year, monthNumber, 1)))
}

/** Décale un mois de `n` mois (négatif accepté) : `shiftMonth('2026-01', -1)` → `'2025-12'`. */
export function shiftMonth(month: CivilMonth, n: number): CivilMonth {
  const parts = month.split('-').map(Number)
  const year = parts[0] ?? 1970
  const monthNumber = parts[1] ?? 1
  return monthOf(toCivilDate(new Date(Date.UTC(year, monthNumber - 1 + n, 1))))
}

/** Libellé d'un mois : « octobre 2026 ». */
export function monthLabel(month: CivilMonth): string {
  const parts = month.split('-').map(Number)
  const year = parts[0] ?? 1970
  const monthNumber = parts[1] ?? 1
  return `${MONTHS[monthNumber - 1] ?? ''} ${year}`
}

/**
 * Index du jour civil depuis l'époque (1970-01-01), pour mesurer une distance en jours.
 *
 * Sert à comparer deux créneaux sur une échelle absolue : un créneau de nuit
 * (22:00 → 01:00) déborde sur le lendemain, donc une comparaison « même date » le raterait.
 * `toUTCDate` construit toujours un minuit UTC : le résultat est un entier exact, sans
 * heure d'été.
 */
export function dayIndex(date: CivilDate): number {
  return toUTCDate(date).getTime() / MS_PER_DAY
}

/** Aujourd'hui selon l'horloge LOCALE : la date civile de l'utilisateur. */
export function today(): CivilDate {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: CivilDate, n: number): CivilDate {
  const d = toUTCDate(date)
  d.setUTCDate(d.getUTCDate() + n)
  return toCivilDate(d)
}

/**
 * Lundi de la semaine contenant `date`. `getUTCDay()` renvoie 0 pour dimanche, qui
 * appartient donc à la semaine qui se termine.
 */
export function startOfWeek(date: CivilDate): CivilDate {
  const d = toUTCDate(date)
  const day = d.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  return addDays(date, offset)
}

/** Les sept dates d'une semaine, du lundi au dimanche. */
export function week(date: CivilDate): CivilDate[] {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Numéro du jour dans le mois, sans zéro initial : « 14 ». */
export function dayOfMonth(date: CivilDate): string {
  return String(toUTCDate(date).getUTCDate())
}

export function shortDay(date: CivilDate): string {
  return SHORT_DAYS[toUTCDate(date).getUTCDay()] ?? ''
}

export function longDay(date: CivilDate): string {
  return LONG_DAYS[toUTCDate(date).getUTCDay()] ?? ''
}

export function longMonth(date: CivilDate): string {
  return MONTHS[toUTCDate(date).getUTCMonth()] ?? ''
}

/** Libellé complet : « lundi 14 mars ». */
export function longDate(date: CivilDate): string {
  return `${longDay(date)} ${dayOfMonth(date)} ${longMonth(date)}`
}

export function isToday(date: CivilDate): boolean {
  return date === today()
}

/** Libellé d'une plage : « 10 – 16 mars 2025 », sans répéter le mois et l'année identiques. */
export function weekLabel(dates: CivilDate[]): string {
  const start = dates[0]
  const end = dates[dates.length - 1]
  if (!start || !end) return ''

  const startDate = toUTCDate(start)
  const endDate = toUTCDate(end)
  const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth()
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear()

  if (sameMonth) {
    return `${startDate.getUTCDate()} – ${endDate.getUTCDate()} ${longMonth(end)} ${endDate.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${startDate.getUTCDate()} ${longMonth(start)} – ${endDate.getUTCDate()} ${longMonth(end)} ${endDate.getUTCFullYear()}`
  }
  return `${longDate(start)} ${startDate.getUTCFullYear()} – ${longDate(end)} ${endDate.getUTCFullYear()}`
}
