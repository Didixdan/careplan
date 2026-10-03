import { describe, expect, it } from 'vitest'
import { isDragGesture } from '~/utils/gesture'

/**
 * Tap ou glisser ?
 *
 * Toute la suppression d'un créneau tient à cette question : les deux intentions partagent
 * le même `pointerdown`, donc si le seuil était trop bas, un doigt posé déclencherait un
 * déplacement et la fiche ne s'ouvrirait jamais. Trop haut, un vrai déplacement serait pris
 * pour un tap.
 */
describe('isDragGesture', () => {
  it('ne bouge pas : c\'est un tap', () => {
    expect(isDragGesture({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false)
  })

  it('laisse passer le tremblement d\'un doigt posé', () => {
    // 4 px sur chaque axe : un doigt qui tremble, pas un déplacement.
    expect(isDragGesture({ x: 100, y: 100 }, { x: 104, y: 104 })).toBe(false)
  })

  it('reconnaît un déplacement horizontal', () => {
    expect(isDragGesture({ x: 100, y: 100 }, { x: 107, y: 100 })).toBe(true)
  })

  it('reconnaît un déplacement vertical, dans les deux sens', () => {
    expect(isDragGesture({ x: 100, y: 100 }, { x: 100, y: 107 })).toBe(true)
    expect(isDragGesture({ x: 100, y: 100 }, { x: 100, y: 93 })).toBe(true)
  })

  it('ne compte pas comme un déplacement un point EXACTEMENT sur le seuil', () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false)
  })

  it('tolère un seuil explicite', () => {
    // Un quart d'heure de créneau fait 24 px : bien au-delà de tous ces seuils.
    expect(isDragGesture({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true)
    expect(isDragGesture({ x: 0, y: 0 }, { x: 24, y: 0 }, 40)).toBe(false)
  })
})
