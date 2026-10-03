// Trois formats à ne jamais confondre : heure du jour (minutes depuis minuit), durée
// (minutes), affichage (« 2 h 00 »). Ce module est le seul endroit des conversions.

const MINUTES_PER_DAY = 24 * 60

/** « HH:MM » → minutes depuis minuit. `null` si inexploitable (jamais minuit par défaut). */
export function parseTime(time: string | null | undefined): number | null {
  if (!time) return null
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * Durée en minutes ; gère le passage de minuit (22:00 → 01:00 = 3 h). `null` si une
 * heure est invalide ou si la durée est nulle.
 */
export function durationInMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const startMinutes = parseTime(start)
  const endMinutes = parseTime(end)
  if (startMinutes === null || endMinutes === null) return null

  const raw = endMinutes - startMinutes
  const duration = raw > 0 ? raw : raw + MINUTES_PER_DAY

  // Une durée nulle n'a pas de sens pour un créneau : c'est une saisie invalide.
  if (duration === MINUTES_PER_DAY) return null
  return duration
}

/** « 2 h 00 », « 45 min ». Les minutes gardent leur zéro pour aligner les colonnes. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—'
  if (minutes < 0) return '—'

  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)

  if (hours === 0) return `${remainder} min`
  return `${hours} h ${String(remainder).padStart(2, '0')}`
}

/** Largeur en %, bornée à 100 pour qu'un créneau long remplisse la barre sans déborder. */
export function durationProportion(
  minutes: number | null | undefined,
  referenceMinutes: number,
): number {
  if (!minutes || minutes <= 0) return 0
  if (!referenceMinutes || referenceMinutes <= 0) return 0
  return Math.min(100, Math.round((minutes / referenceMinutes) * 100))
}

export function addMinutesToTime(time: string, minutes: number): string | null {
  const base = parseTime(time)
  if (base === null) return null

  const total = (base + Math.round(minutes) + MINUTES_PER_DAY * 2) % MINUTES_PER_DAY
  const hours = Math.floor(total / 60)
  const remainder = total % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

/** Arrondit des minutes au pas de 15 minutes le plus proche. */
export function roundTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

/**
 * Deux plages horaires se chevauchent-elles (même journée) ? Robuste au passage de
 * minuit : une fin inférieure au début (22:00 → 01:00) est traitée comme le lendemain.
 * Un contact de bornes (09:00–10:00 vs 10:00–11:00) n'est PAS un chevauchement.
 */
export function overlaps(
  startA: string | null | undefined,
  endA: string | null | undefined,
  startB: string | null | undefined,
  endB: string | null | undefined,
): boolean {
  const sA = parseTime(startA)
  const sB = parseTime(startB)
  const endAMin = parseTime(endA)
  const endBMin = parseTime(endB)
  if (sA === null || sB === null || endAMin === null || endBMin === null) return false

  const eA = endAMin > sA ? endAMin : endAMin + MINUTES_PER_DAY
  const eB = endBMin > sB ? endBMin : endBMin + MINUTES_PER_DAY

  return sA < eB && sB < eA
}
