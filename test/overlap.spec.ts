import { describe, expect, it } from 'vitest'
import { roundTo15, overlaps } from '~/utils/duration'
import { isInGrid, checkTimeRange, hasRoomForStatusActions } from '~/utils/grid'

describe('roundTo15', () => {
  it('arrondit au pas de 15 minutes le plus proche', () => {
    expect(roundTo15(0)).toBe(0)
    expect(roundTo15(7)).toBe(0)
    expect(roundTo15(8)).toBe(15)
    expect(roundTo15(22)).toBe(15)
    expect(roundTo15(23)).toBe(30)
    expect(roundTo15(38)).toBe(45)
    expect(roundTo15(45)).toBe(45)
    expect(roundTo15(52)).toBe(45)
    expect(roundTo15(53)).toBe(60)
  })
})

describe('overlaps', () => {
  it('détecte un chevauchement simple', () => {
    expect(overlaps('09:00', '11:00', '10:00', '12:00')).toBe(true)
  })

  it('détecte une inclusion', () => {
    expect(overlaps('09:00', '12:00', '10:00', '11:00')).toBe(true)
  })

  it('ne chevauche pas un contact de bornes', () => {
    expect(overlaps('09:00', '10:00', '10:00', '11:00')).toBe(false)
  })

  it('ne chevauche pas des créneaux disjoints', () => {
    expect(overlaps('09:00', '10:00', '11:00', '12:00')).toBe(false)
  })

  it('gère un créneau de nuit (passage de minuit)', () => {
    // 22:00 → 01:00 contre 23:00 → 00:30 : ils se chevauchent.
    expect(overlaps('22:00', '01:00', '23:00', '00:30')).toBe(true)
  })

  it('distingue nuit et journée', () => {
    // 22:00 → 01:00 ne chevauche pas 09:00 → 10:00.
    expect(overlaps('22:00', '01:00', '09:00', '10:00')).toBe(false)
  })
})

describe('isInGrid', () => {
  it('accepte un créneau entièrement dans 07h–22h', () => {
    expect(isInGrid('07:00', '22:00')).toBe(true)
    expect(isInGrid('08:00', '12:00')).toBe(true)
  })

  it('rejette un créneau qui touche minuit', () => {
    expect(isInGrid('22:00', '01:00')).toBe(false)
  })

  it('rejette un créneau hors plage', () => {
    expect(isInGrid('06:00', '08:00')).toBe(false)
    expect(isInGrid('21:00', '23:00')).toBe(false)
  })
})

/**
 * Contrôle partagé par la création et le déplacement. Le point qui compte : la plage
 * 07h–22h ne contraint QUE le déplacement, sinon la veille de nuit des fixtures ne serait
 * jamais saisissable.
 */
describe('checkTimeRange', () => {
  it('accepte une plage alignée', () => {
    expect(checkTimeRange('08:00', '10:30')).toBeNull()
  })

  it('refuse une heure illisible', () => {
    expect(checkTimeRange('8h', '10:00')).toBe('unparsable')
    expect(checkTimeRange('08:00', '25:00')).toBe('unparsable')
  })

  it('refuse une durée nulle', () => {
    expect(checkTimeRange('10:00', '10:00')).toBe('empty')
  })

  it('refuse une plage non alignée sur 15 minutes', () => {
    expect(checkTimeRange('10:07', '11:00')).toBe('not-quarter-hour')
    expect(checkTimeRange('10:00', '11:20')).toBe('not-quarter-hour')
  })

  it('accepte un créneau de nuit quand la grille n\'est pas exigée', () => {
    expect(checkTimeRange('22:00', '01:00')).toBeNull()
    expect(checkTimeRange('06:00', '08:00')).toBeNull()
  })

  it('refuse la nuit quand la grille est exigée', () => {
    expect(checkTimeRange('22:00', '01:00', { withinGrid: true })).toBe('out-of-grid')
  })

  it('refuse 06h et 23h quand la grille est exigée', () => {
    expect(checkTimeRange('06:00', '08:00', { withinGrid: true })).toBe('out-of-grid')
    expect(checkTimeRange('21:00', '23:00', { withinGrid: true })).toBe('out-of-grid')
  })

  it('contrôle dans l\'ordre : lisibilité, durée, alignement, plage', () => {
    // 06:07 est à la fois hors grille et non alignée : c'est l'alignement qui est signalé.
    expect(checkTimeRange('06:07', '07:07', { withinGrid: true })).toBe('not-quarter-hour')
  })
})

/**
 * Place disponible pour les actions rapides.
 *
 * Une carte de la grille est proportionnelle à sa durée : 24 px pour un quart d'heure, 48 px
 * pour une demi-heure. Les deux boutons font 44 px. Ce prédicat est ce qui empêche d'afficher
 * des boutons coupés par `overflow-hidden` — ou, pire, débordant sur la carte suivante.
 */
describe('hasRoomForStatusActions', () => {
  it('refuse un créneau d\'un quart d\'heure', () => {
    expect(hasRoomForStatusActions('09:00', '09:15')).toBe(false)
  })

  it('accepte une demi-heure', () => {
    // 30 min = 48 px : c'est la plus courte durée que produise l'application en pratique.
    expect(hasRoomForStatusActions('09:00', '09:30')).toBe(true)
  })

  it('accepte les créneaux longs', () => {
    expect(hasRoomForStatusActions('09:00', '12:00')).toBe(true)
  })

  it('accepte un créneau de nuit, mesuré sur sa durée réelle', () => {
    // 22:00 → 01:00 = 3 h : hors grille, mais rendu en carte de liste, qui a toujours la place.
    expect(hasRoomForStatusActions('22:00', '01:00')).toBe(true)
  })

  it('refuse une plage inexploitable', () => {
    expect(hasRoomForStatusActions('09:00', '09:00')).toBe(false)
    expect(hasRoomForStatusActions('9h', '10:00')).toBe(false)
  })
})
