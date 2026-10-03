import { durationInMinutes, parseTime, roundTo15 } from './duration'

/** Plage horaire affichée dans la grille (07h–22h). */
export const GRID_START_MINUTES = 7 * 60
export const GRID_END_MINUTES = 22 * 60

/** Échelle verticale : pixels par minute (15 min = 24 px, 1 h = 96 px). */
export const PX_PER_MINUTE = 1.6

/** Minutes depuis minuit → ordonnée en pixels dans la grille (07h = 0). */
export function minutesToPx(minutes: number): number {
  return (minutes - GRID_START_MINUTES) * PX_PER_MINUTE
}

/** Ordonnée (px depuis 07h) → minutes depuis minuit, arrondies au pas de 15 min. */
export function pxToMinutes(px: number): number {
  return roundTo15(GRID_START_MINUTES + px / PX_PER_MINUTE)
}

/** Minutes depuis minuit → « HH:MM ». */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

/** Heures affichées sur l'axe (de 07h à 22h inclus). */
export const GRID_HOURS = Array.from(
  { length: GRID_END_MINUTES / 60 - GRID_START_MINUTES / 60 + 1 },
  (_, index) => GRID_START_MINUTES / 60 + index,
)

/** Le créneau est-il entièrement dans la plage 07h–22h (donc déplaçable dans la grille) ? */
export function isInGrid(start: string, end: string): boolean {
  const d = parseTime(start)
  const f = parseTime(end)
  if (d === null || f === null) return false
  return d >= GRID_START_MINUTES && f <= GRID_END_MINUTES && f > d
}

/** Cible tactile minimale (docs/decisions.md §10) : deux boutons d'action rapide, 44 px. */
const STATUS_ACTIONS_MIN_PX = 44

/**
 * La carte a-t-elle la place d'afficher ses actions rapides ?
 *
 * Une carte de la grille est PROPORTIONNELLE à sa durée (1.6 px/min) : un créneau d'un quart
 * d'heure mesure 24 px, et deux boutons de 44 px n'y tiennent pas. Comme la carte est en
 * `overflow-hidden`, les actions seraient coupées ; les laisser déborder recouvrirait la
 * carte suivante, qui deviendrait incliquable. En dessous du seuil, elles ne sont donc pas
 * rendues : ces créneaux passent par la modale, ouverte par le tap.
 *
 * Le seuil est calculé, jamais deviné : 30 min = 48 px, et c'est la durée la plus courte que
 * produise l'application en pratique.
 */
export function hasRoomForStatusActions(start: string, end: string): boolean {
  const duration = durationInMinutes(start, end)
  if (duration === null) return false

  // 2 px de marge : la rangée est épinglée à 2 px du bord, sans quoi elle toucherait le coin.
  return duration * PX_PER_MINUTE >= STATUS_ACTIONS_MIN_PX + 2
}

/** Pas de saisie des heures : 15 minutes, le même que `roundTo15`. */
const STEP_MINUTES = 15

/** Motif de refus d'une plage horaire ; `null` quand elle est acceptable. */
export type TimeRangeProblem = 'unparsable' | 'empty' | 'not-quarter-hour' | 'out-of-grid'

/**
 * Contrôle PUR d'une plage `'HH:MM'`, partagé par la création et le déplacement d'un
 * créneau : une règle écrite deux fois finit par diverger.
 *
 * `withinGrid` exige la plage affichée (07h–22h, sans passage de minuit) : c'est la
 * contrainte du DÉPLACEMENT, qui se fait dans la grille. Sans elle, un créneau de nuit
 * (22:00 → 01:00) est valide — sans quoi une veille ne serait jamais saisissable.
 *
 * L'ordre des contrôles est celui des messages : lisibilité, durée, alignement, plage.
 */
export function checkTimeRange(
  start: string,
  end: string,
  options: { withinGrid?: boolean } = {},
): TimeRangeProblem | null {
  const startMinutes = parseTime(start)
  const endMinutes = parseTime(end)
  if (startMinutes === null || endMinutes === null) return 'unparsable'

  // `durationInMinutes` renvoie `null` pour une durée nulle comme pour 24 h.
  if (durationInMinutes(start, end) === null) return 'empty'

  if (startMinutes % STEP_MINUTES !== 0 || endMinutes % STEP_MINUTES !== 0) return 'not-quarter-hour'

  // `endMinutes <= startMinutes` : un créneau qui passe minuit n'entre pas dans la grille.
  if (options.withinGrid) {
    if (startMinutes < GRID_START_MINUTES || endMinutes > GRID_END_MINUTES || endMinutes <= startMinutes) {
      return 'out-of-grid'
    }
  }

  return null
}
