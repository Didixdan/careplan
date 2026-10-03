import { describe, expect, it } from 'vitest'
import { amountCents, centsFromEuros, formatCents, formatEuros, formatHoursDecimal } from '~/utils/money'

/**
 * Montants et durées décimales.
 *
 * L'argent est stocké en centimes entiers, jamais en flottant : ces conversions sont donc le
 * seul endroit où un arrondi peut se tromper de centime — et un montant faux dans une
 * déclaration ne se voit pas à l'écran, il se voit sur un virement.
 */
describe('formatCents', () => {
  it('écrit le montant à la virgule décimale', () => {
    expect(formatCents(3875)).toBe('38,75')
    expect(formatCents(5000)).toBe('50,00')
    expect(formatCents(0)).toBe('0,00')
  })

  it('écrit les centimes seuls, sans zéro inutile', () => {
    expect(formatCents(5)).toBe('0,05')
    expect(formatCents(50)).toBe('0,50')
  })

  it('ne dit rien d\'une valeur absente', () => {
    expect(formatCents(null)).toBe('')
    expect(formatCents(undefined)).toBe('')
    expect(formatCents(Number.NaN)).toBe('')
  })
})

describe('formatEuros', () => {
  it('ajoute le symbole', () => {
    expect(formatEuros(1650)).toBe('16,50 €')
  })

  it('reste vide quand le montant manque', () => {
    expect(formatEuros(null)).toBe('')
  })
})

describe('centsFromEuros', () => {
  it('convertit une saisie en euros', () => {
    expect(centsFromEuros(16.5)).toBe(1650)
    expect(centsFromEuros(16.55)).toBe(1655)
  })

  it('refuse zéro, le négatif et l\'absence de saisie', () => {
    // Un taux à 0 € n'a pas de sens : c'est une absence de saisie, comme `null`.
    expect(centsFromEuros(0)).toBeNull()
    expect(centsFromEuros(-3)).toBeNull()
    expect(centsFromEuros(null)).toBeNull()
    expect(centsFromEuros(Number.NaN)).toBeNull()
  })

  it('arrondit au centime, jamais en dessous', () => {
    expect(centsFromEuros(16.554)).toBe(1655)
    expect(centsFromEuros(16.556)).toBe(1656)
  })
})

describe('amountCents', () => {
  it('calcule un montant exact', () => {
    // 3 h à 15,50 €/h
    expect(amountCents(180, 1550)).toBe(4650)
    expect(amountCents(150, 1550)).toBe(3875)
  })

  it('arrondit au centime', () => {
    // 1 h 07 (67 min) à 16,33 €/h = 18,24 €
    expect(amountCents(67, 1633)).toBe(1824)
  })

  it('ne calcule rien sans taux', () => {
    // Le point important : pas de taux = pas de montant, jamais un montant à zéro.
    expect(amountCents(180, null)).toBeNull()
    expect(amountCents(null, 1550)).toBeNull()
  })

  it('accepte une durée nulle', () => {
    expect(amountCents(0, 1550)).toBe(0)
  })
})

describe('formatHoursDecimal', () => {
  it('écrit des heures décimales à la virgule', () => {
    expect(formatHoursDecimal(150)).toBe('2,50')
    expect(formatHoursDecimal(60)).toBe('1,00')
    expect(formatHoursDecimal(45)).toBe('0,75')
  })

  it('ne dit rien d\'une valeur absente', () => {
    expect(formatHoursDecimal(null)).toBe('')
  })
})
