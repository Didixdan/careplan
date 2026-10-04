import { describe, expect, it } from 'vitest'
import type { Appointment } from '~~/shared/types/planning'
import { applyMove, applyStatus } from '~/utils/appointments'

function appointment(id: string, date: string, start: string, end: string): Appointment {
  return {
    id,
    date,
    start,
    end,
    tags: [{ id: 'tag-courses', name: 'Courses' }],
    status: 'planned',
    beneficiary: 'Élise Dupont',
    beneficiaryId: 'benef-1',
    primaryAssistant: 'Camille Roussel',
    primaryAssistantId: 'assistant-camille',
    color: 'assistant-5',
    coAssistants: [],
    coAssistantIds: [],
  }
}

const LIST = [
  appointment('a', '2025-03-10', '09:00', '10:00'),
  appointment('b', '2025-03-10', '14:00', '15:00'),
]

describe('applyMove', () => {
  it('déplace le créneau visé et laisse les autres intacts', () => {
    const moved = applyMove(LIST, 'b', { date: '2025-03-11', start: '15:30', end: '16:30' })

    expect(moved[1]).toMatchObject({ id: 'b', date: '2025-03-11', start: '15:30', end: '16:30' })
    expect(moved[0]).toBe(LIST[0])
    expect(moved[0]!.start).toBe('09:00')
  })

  it('renvoie une nouvelle liste, jamais la même référence', () => {
    // Invariant de réactivité : `useAsyncData` renvoie une référence SUPERFICIELLE.
    // Muter la liste en place ne redessinerait rien ; seul un nouveau tableau compte.
    const moved = applyMove(LIST, 'a', { date: '2025-03-10', start: '09:15', end: '10:15' })

    expect(moved).not.toBe(LIST)
    expect(LIST[0]!.start).toBe('09:00')
  })

  it('ne touche à rien quand l\'identifiant est absent', () => {
    const moved = applyMove(LIST, 'inconnu', { date: '2025-03-12', start: '08:00', end: '09:00' })

    expect(moved).toHaveLength(2)
    expect(moved.map(a => a.start)).toEqual(['09:00', '14:00'])
  })
})

describe('applyStatus', () => {
  it('change le statut du créneau visé et laisse les autres intacts', () => {
    const updated = applyStatus(LIST, 'b', 'completed')

    expect(updated[1]).toMatchObject({ id: 'b', status: 'completed' })
    expect(updated[0]).toBe(LIST[0])
  })

  it('ne touche à aucun autre champ', () => {
    const updated = applyStatus(LIST, 'a', 'cancelled')

    expect(updated[0]).toEqual({ ...LIST[0], status: 'cancelled' })
  })

  it('renvoie une nouvelle liste, jamais la même référence', () => {
    // Invariant de réactivité, et ici il est fonctionnel : sans nouveau tableau, la carte ne
    // se redessinerait pas et les boutons d'action rapide resteraient ceux de l'ancien état.
    const updated = applyStatus(LIST, 'a', 'completed')

    expect(updated).not.toBe(LIST)
    expect(LIST[0]!.status).toBe('planned')
  })

  it('ne touche à rien quand l\'identifiant est absent', () => {
    const updated = applyStatus(LIST, 'inconnu', 'cancelled')

    expect(updated.map(a => a.status)).toEqual(['planned', 'planned'])
  })
})
