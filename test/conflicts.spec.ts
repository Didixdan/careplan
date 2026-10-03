import { describe, expect, it } from 'vitest'
import { conflictingIds } from '~/utils/conflicts'

/**
 * Chevauchement par aidant.
 *
 * C'est LA règle que le serveur fait respecter, et celle que l'aperçu du glisser-déposer
 * réutilise. Le cas qui a motivé son écriture en minutes absolues : un créneau de nuit
 * (22:00 → 01:00) déborde sur le lendemain, donc deux créneaux de DATES DIFFÉRENTES
 * peuvent se recouvrir. Une comparaison « même date » le laissait passer.
 */

function booked(id: string, date: string, start: string, end: string, assistantIds: string[] = ['camille']) {
  return { id, date, start, end, assistantIds }
}

function draft(date: string, start: string, end: string, assistantIds: string[] = ['camille']) {
  return { date, start, end, assistantIds }
}

describe('conflictingIds', () => {
  it('détecte un chevauchement le même jour, avec un aidant commun', () => {
    const others = [booked('a', '2025-03-10', '09:30', '10:30')]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00'), others)).toEqual(['a'])
  })

  it('ne compte pas un contact de bornes', () => {
    const others = [booked('a', '2025-03-10', '09:00', '10:00')]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00'), others)).toEqual([])
  })

  it('ignore un créneau qui ne partage aucun aidant', () => {
    const others = [booked('a', '2025-03-10', '10:00', '11:00', ['yves'])]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00', ['camille']), others)).toEqual([])
  })

  it('compare les CO-AIDANTS, pas seulement l\'aidant principal', () => {
    // Le créneau se déplace sur le créneau d'un binôme : le co-aidant suffit à refuser.
    const others = [booked('a', '2025-03-10', '10:00', '11:00', ['camille', 'nadia'])]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00', ['nadia']), others)).toEqual(['a'])
  })

  it('détecte une nuit contre le lendemain matin', () => {
    // 22:00 → 01:00 le 10 mars : la fin appartient au 11 mars.
    const others = [booked('a', '2025-03-11', '00:30', '01:30')]
    expect(conflictingIds(draft('2025-03-10', '22:00', '01:00'), others)).toEqual(['a'])
  })

  it('détecte un créneau du matin contre une nuit commencée la veille', () => {
    const others = [booked('a', '2025-03-10', '22:00', '01:00')]
    expect(conflictingIds(draft('2025-03-11', '00:30', '01:30'), others)).toEqual(['a'])
  })

  it('ignore une nuit deux jours plus tôt', () => {
    const others = [booked('a', '2025-03-10', '22:00', '01:00')]
    expect(conflictingIds(draft('2025-03-12', '09:00', '10:00'), others)).toEqual([])
  })

  it('traverse un changement de mois', () => {
    const others = [booked('a', '2024-02-29', '00:30', '02:00')]
    expect(conflictingIds(draft('2024-02-28', '22:00', '01:00'), others)).toEqual(['a'])
  })

  it('ne conflicte jamais sur une plage inexploitable', () => {
    // Durée nulle des deux côtés : rien ne doit être signalé plutôt qu'un faux positif.
    const others = [booked('a', '2025-03-10', '09:00', '11:00')]
    expect(conflictingIds(draft('2025-03-10', '10:00', '10:00'), others)).toEqual([])

    const broken = [booked('a', '2025-03-10', '10:00', '10:00')]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00'), broken)).toEqual([])
  })

  it('renvoie TOUS les créneaux en conflit', () => {
    const others = [
      booked('a', '2025-03-10', '09:30', '10:30'),
      booked('b', '2025-03-10', '10:30', '12:00'),
      booked('c', '2025-03-10', '15:00', '16:00'),
    ]
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00'), others)).toEqual(['a', 'b'])
  })

  it('ne signale rien sans autre créneau', () => {
    expect(conflictingIds(draft('2025-03-10', '10:00', '11:00'), [])).toEqual([])
  })
})
