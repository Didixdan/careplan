import { describe, expect, it } from 'vitest'
import { formatKilometers, kilometersFromInput, roundKilometers, sumKilometers } from '~/utils/mileage'

/**
 * Kilomètres déclarés.
 *
 * Le seul piège réel de cette fonctionnalité est le flottant : une somme de nombres à virgule
 * dérive (12,1 + 12,2 = 24,299999999999997). Sur des kilomètres, personne ne le voit à l'œil,
 * et le total part faux dans un export — d'où l'arrondi, et ces tests.
 */
describe('kilometersFromInput', () => {
  it('accepte la virgule française et le point', () => {
    expect(kilometersFromInput('12,5')).toBe(12.5)
    expect(kilometersFromInput('12.5')).toBe(12.5)
    expect(kilometersFromInput('12')).toBe(12)
  })

  it('tolère les espaces autour', () => {
    expect(kilometersFromInput('  12,5  ')).toBe(12.5)
  })

  it('accepte zéro (l\'appelant en fera une suppression)', () => {
    expect(kilometersFromInput('0')).toBe(0)
  })

  it('arrondit à deux décimales', () => {
    expect(kilometersFromInput('12,567')).toBe(12.57)
    expect(kilometersFromInput('12,564')).toBe(12.56)
  })

  it('refuse ce qui n\'est pas un nombre plausible', () => {
    expect(kilometersFromInput('')).toBeNull()
    expect(kilometersFromInput('   ')).toBeNull()
    expect(kilometersFromInput('beaucoup')).toBeNull()
    expect(kilometersFromInput('-3')).toBeNull()
    expect(kilometersFromInput('12,5,5')).toBeNull()
  })

  it('refuse une faute de frappe démesurée', () => {
    // 1 000 km dans une journée n'arrive pas : c'est un zéro de trop.
    expect(kilometersFromInput('125000')).toBeNull()
    expect(kilometersFromInput('1000')).toBe(1000)
  })
})

describe('roundKilometers', () => {
  it('tient les deux décimales', () => {
    expect(roundKilometers(12.567)).toBe(12.57)
    expect(roundKilometers(24.299999999999997)).toBe(24.3)
  })
})

describe('formatKilometers', () => {
  it('écrit à la virgule, sans zéro inutile', () => {
    expect(formatKilometers(12.5)).toBe('12,5')
    expect(formatKilometers(12)).toBe('12')
    expect(formatKilometers(0)).toBe('0')
    expect(formatKilometers(12.57)).toBe('12,57')
  })

  it('ne dit rien d\'une valeur absente', () => {
    expect(formatKilometers(null)).toBe('')
    expect(formatKilometers(undefined)).toBe('')
    expect(formatKilometers(Number.NaN)).toBe('')
  })
})

describe('sumKilometers', () => {
  it('n\'hérite pas de la dérive du flottant', () => {
    // Le cas qui justifie l'arrondi : sans lui, 24,299999999999997.
    expect(formatKilometers(sumKilometers([12.1, 12.2]))).toBe('24,3')
  })

  it('additionne une semaine', () => {
    expect(formatKilometers(sumKilometers([12.5, 3.2, 0.3, 8]))).toBe('24')
  })

  it('rend zéro sur une liste vide', () => {
    expect(sumKilometers([])).toBe(0)
  })
})
