import type { CivilDate } from './date'
import { dayIndex } from './date'
import { durationInMinutes, parseTime } from './duration'

const MINUTES_PER_DAY = 24 * 60

/** Un créneau à poser : ce qui suffit à décider d'un chevauchement, sans identifiant. */
export interface BookingDraft {
  date: CivilDate
  start: string
  end: string
  /** Aidant principal ET co-aidants : un créneau occupe tous ses aidants. */
  assistantIds: string[]
}

/** Un créneau déjà enregistré, que la plage candidate peut recouvrir. */
export interface BookedRange extends BookingDraft {
  id: string
}

/** Plage en minutes ABSOLUES depuis l'époque, ou `null` si elle est inexploitable. */
function absoluteRange(range: BookingDraft): [number, number] | null {
  const start = parseTime(range.start)
  const duration = durationInMinutes(range.start, range.end)
  if (start === null || duration === null) return null

  const base = dayIndex(range.date) * MINUTES_PER_DAY
  return [base + start, base + start + duration]
}

/**
 * Identifiants des créneaux qui recouvrent la plage candidate en partageant au moins un
 * aidant. C'est LA règle du chevauchement : le serveur la fait foi, l'aperçu du
 * glisser-déposer la réutilise pour ne pas en entretenir une seconde version côté client.
 *
 * La comparaison se fait en minutes absolues, et non en heures du jour : un créneau de
 * nuit (22:00 → 01:00) déborde sur le lendemain, donc deux créneaux de dates différentes
 * peuvent se recouvrir. Une plage inexploitable (durée nulle) ne conflicte jamais.
 *
 * Un contact de bornes (09:00–10:00 contre 10:00–11:00) n'est PAS un chevauchement.
 */
export function conflictingIds(candidate: BookingDraft, others: BookedRange[]): string[] {
  const candidateRange = absoluteRange(candidate)
  if (candidateRange === null) return []

  const assistantIds = new Set(candidate.assistantIds)

  return others
    .filter(other => other.assistantIds.some(assistantId => assistantIds.has(assistantId)))
    .filter((other) => {
      const range = absoluteRange(other)
      return range !== null && candidateRange[0] < range[1] && range[0] < candidateRange[1]
    })
    .map(other => other.id)
}
