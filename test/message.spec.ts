import { describe, expect, it } from 'vitest'
import type { Appointment, Status } from '~~/shared/types/planning'
import { week } from '~/utils/date'
import { beneficiaryWeekMessage } from '~/utils/message'

/**
 * Message envoyé aux familles.
 *
 * C'est le seul livrable du projet qui sort de l'application pour aller chez quelqu'un
 * d'autre : il doit être juste, lisible sur un téléphone, et ne pas annoncer une visite qui
 * n'aura pas lieu. Le test compare donc le texte entier, au caractère près.
 */
function appointment(options: {
  date: string
  start: string
  end: string
  title?: string
  assistant?: string
  status?: Status
}): Appointment {
  const assistant = options.assistant ?? 'Camille Roussel'
  return {
    id: `${options.date}-${options.start}`,
    date: options.date,
    start: options.start,
    end: options.end,
    title: options.title ?? 'Aide à la toilette',
    status: options.status ?? 'planned',
    beneficiary: 'Élise Dupont',
    beneficiaryId: 'benef-1',
    primaryAssistant: assistant,
    primaryAssistantId: 'assist-1',
    color: 'assistant-5',
    coAssistants: [],
    coAssistantIds: [],
  }
}

const dates = week('2026-09-30')

describe('beneficiaryWeekMessage', () => {
  it('écrit un message prêt à envoyer', () => {
    const message = beneficiaryWeekMessage({
      beneficiaryName: 'Élise Dupont',
      dates,
      appointments: [
        appointment({ date: '2026-09-30', start: '14:00', end: '15:30', title: 'Courses', assistant: 'Sofia Lambert' }),
        appointment({ date: '2026-09-28', start: '09:00', end: '11:00' }),
      ],
    })

    expect(message).toBe([
      'Bonjour,',
      '',
      '🗓️ Planning de la semaine du lundi 28 septembre au dimanche 4 octobre',
      'Élise Dupont',
      '',
      '• lundi 28 septembre · 09:00 – 11:00 · Aide à la toilette (Camille)',
      '• mercredi 30 septembre · 14:00 – 15:30 · Courses (Sofia)',
      '',
      '⏱️ Total de la semaine : 3 h 30',
    ].join('\n'))
  })

  it('n\'annonce jamais un passage annulé', () => {
    const message = beneficiaryWeekMessage({
      beneficiaryName: 'Élise Dupont',
      dates,
      appointments: [
        appointment({ date: '2026-09-28', start: '09:00', end: '10:00' }),
        appointment({ date: '2026-09-29', start: '09:00', end: '10:00', title: 'Annulé', status: 'cancelled' }),
      ],
    })

    expect(message).not.toContain('Annulé')
    expect(message).toContain('Total de la semaine : 1 h 00')
  })

  it('signale un passage qui franchit minuit', () => {
    // Sans la mention, « 22:00 – 01:00 » ressemble à une faute de frappe.
    const message = beneficiaryWeekMessage({
      beneficiaryName: 'Élise Dupont',
      dates,
      appointments: [appointment({ date: '2026-10-01', start: '22:00', end: '01:00', title: 'Veille' })],
    })

    expect(message).toContain('· 22:00 – 01:00 (lendemain) · Veille (Camille)')
    expect(message).toContain('Total de la semaine : 3 h 00')
  })

  it('trie les passages dans l\'ordre du calendrier', () => {
    const message = beneficiaryWeekMessage({
      beneficiaryName: 'Élise Dupont',
      dates,
      appointments: [
        appointment({ date: '2026-10-02', start: '09:00', end: '10:00', title: 'Vendredi' }),
        appointment({ date: '2026-09-28', start: '14:00', end: '15:00', title: 'Lundi après-midi' }),
        appointment({ date: '2026-09-28', start: '09:00', end: '10:00', title: 'Lundi matin' }),
      ],
    })

    expect(message.indexOf('Lundi matin')).toBeLessThan(message.indexOf('Lundi après-midi'))
    expect(message.indexOf('Lundi après-midi')).toBeLessThan(message.indexOf('Vendredi'))
  })

  it('ne dit rien d\'une semaine sans passage', () => {
    // Un message vide ne s'envoie pas : c'est à l'écran de ne rien proposer.
    expect(beneficiaryWeekMessage({ beneficiaryName: 'Élise Dupont', dates, appointments: [] })).toBe('')
    expect(beneficiaryWeekMessage({
      beneficiaryName: 'Élise Dupont',
      dates,
      appointments: [appointment({ date: '2026-09-28', start: '09:00', end: '10:00', status: 'cancelled' })],
    })).toBe('')
  })

  it('nomme l\'aidant par son prénom', () => {
    const message = beneficiaryWeekMessage({
      beneficiaryName: 'Robert Bernard',
      dates,
      appointments: [appointment({ date: '2026-09-28', start: '09:00', end: '10:00', assistant: 'Yves Marchand' })],
    })

    expect(message).toContain('(Yves)')
    expect(message).not.toContain('Yves Marchand')
    expect(message).toContain('Robert Bernard')
  })
})
