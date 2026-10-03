import { describe, expect, it } from 'vitest'
import type { Appointment, Status } from '~~/shared/types/planning'
import { durationInMinutes } from '~/utils/duration'
import {
  DECLARED_STATUSES,
  exceedsReference,
  remainingMinutes,
  summarise,
  summariseByAssistant,
  summariseByBeneficiary,
  summariseByDay,
} from '~/utils/summary'

/**
 * Agrégation d'un mois d'heures.
 *
 * C'est le calcul qui part sur une déclaration CESU : une erreur ici n'est pas un défaut
 * d'affichage, c'est un montant faux. Les trois règles à verrouiller sont donc testées une
 * par une — ce qui se déclare, comment un binôme se compte, et à quel jour appartient un
 * créneau de nuit.
 */

interface Options {
  date?: string
  start?: string
  end?: string
  status?: Status
  assistantId?: string
  assistant?: string
  beneficiaryId?: string
  beneficiary?: string
  color?: Appointment['color']
  coAssistantIds?: string[]
  coAssistants?: string[]
}

function appointment(options: Options = {}): Appointment {
  return {
    id: `${options.date ?? '2026-10-02'}-${options.start ?? '09:00'}-${options.assistantId ?? 'assist-1'}`,
    date: options.date ?? '2026-10-02',
    start: options.start ?? '09:00',
    end: options.end ?? '10:00',
    title: 'Passage',
    status: options.status ?? 'completed',
    beneficiary: options.beneficiary ?? 'Élise Dupont',
    beneficiaryId: options.beneficiaryId ?? 'benef-1',
    primaryAssistant: options.assistant ?? 'Camille Roussel',
    primaryAssistantId: options.assistantId ?? 'assist-1',
    color: options.color ?? 'assistant-5',
    coAssistants: options.coAssistants ?? [],
    coAssistantIds: options.coAssistantIds ?? [],
  }
}

describe('DECLARED_STATUSES', () => {
  it('ne déclare QUE le réalisé', () => {
    // Le seul endroit à changer si la convention de déclaration évolue. « À vérifier »
    // (`to_validate`) en est exclu : durée ou réalité incertaine, donc pas déclarable.
    expect(DECLARED_STATUSES).toEqual(['completed'])
  })

  it('n\'exclut pas « à vérifier » du récapitulatif', () => {
    // Il est hors total, mais il a son propre cumul — il ne doit pas disparaître.
    expect(DECLARED_STATUSES).not.toContain('to_validate')
  })
})

describe('summarise', () => {
  const month = [
    appointment({ start: '08:00', end: '10:00', status: 'completed' }),
    appointment({ start: '14:00', end: '14:30', status: 'to_validate' }),
    appointment({ start: '16:00', end: '19:00', status: 'planned' }),
    appointment({ start: '20:00', end: '21:00', status: 'cancelled' }),
  ]

  it('ne déclare que le réalisé, et met « à vérifier » à part', () => {
    expect(summarise(month)).toEqual({
      declaredMinutes: 120, // le passage réalisé, et lui seul
      toValidateMinutes: 30, // hors total : on ne déclare pas une heure incertaine
      plannedMinutes: 180,
      passages: 1,
      toValidatePassages: 1,
    })
  })

  it('tient l\'invariant : déclaré + à vérifier + prévisionnel + annulé = tout', () => {
    const totals = summarise(month)
    const all = month.reduce((n, a) => n + (durationInMinutes(a.start, a.end) ?? 0), 0)

    expect(totals.declaredMinutes + totals.toValidateMinutes + totals.plannedMinutes).toBeLessThan(all)
    expect(all).toBe(120 + 30 + 180 + 60)
  })

  it('ne mélange jamais « à vérifier » avec le déclaré', () => {
    // Le piège que ce test verrouille : une heure incertaine ne doit pas partir en déclaration.
    const totals = summarise(month)
    expect(totals.toValidateMinutes).toBeGreaterThan(0)
    expect(totals.declaredMinutes).toBe(120)
  })

  it('renvoie des zéros sur une liste vide', () => {
    expect(summarise([])).toEqual({
      declaredMinutes: 0,
      toValidateMinutes: 0,
      plannedMinutes: 0,
      passages: 0,
      toValidatePassages: 0,
    })
  })

  it('ignore une durée inexploitable plutôt que de propager un NaN', () => {
    const totals = summarise([appointment({ start: '09:00', end: '09:00' })])
    expect(totals.declaredMinutes).toBe(0)
    expect(Number.isNaN(totals.declaredMinutes)).toBe(false)
  })

  it('compte un créneau de nuit sur sa durée réelle', () => {
    // 22:00 → 01:00 : 3 h, pas −21 h.
    expect(summarise([appointment({ start: '22:00', end: '01:00' })]).declaredMinutes).toBe(180)
  })
})

describe('summariseByAssistant', () => {
  it('crédite AUSSI le co-aidant', () => {
    const binome = appointment({
      start: '08:00',
      end: '12:00',
      coAssistantIds: ['assist-9'],
      coAssistants: ['Nadia Benali'],
    })

    const lines = summariseByAssistant([binome])

    expect(lines).toHaveLength(2)
    expect(lines.every(line => line.declaredMinutes === 240)).toBe(true)
    expect(lines.map(line => line.name)).toEqual(['Camille Roussel', 'Nadia Benali'])
  })

  it('ne donne la couleur qu\'à l\'aidant principal', () => {
    // Le DTO ne porte que sa couleur : la ligne du co-aidant n'aura pas de rail, et la
    // couleur n'est jamais le seul porteur d'information.
    const lines = summariseByAssistant([appointment({ coAssistantIds: ['assist-9'], coAssistants: ['Nadia Benali'] })])

    expect(lines[0]?.color).toBe('assistant-5')
    expect(lines[1]?.color).toBeUndefined()
  })

  it('ne compte qu\'une fois une personne présente comme principale ET co-aidante', () => {
    const lines = summariseByAssistant([appointment({ coAssistantIds: ['assist-1'], coAssistants: ['Camille Roussel'] })])

    expect(lines).toHaveLength(1)
    expect(lines[0]?.declaredMinutes).toBe(60)
    expect(lines[0]?.passages).toBe(1)
  })

  it('trie par nom, accents compris', () => {
    const lines = summariseByAssistant([
      appointment({ assistantId: 'assist-3', assistant: 'Yves Marchand' }),
      appointment({ assistantId: 'assist-2', assistant: 'Élodie Fabre' }),
      appointment({ assistantId: 'assist-1', assistant: 'Camille Roussel' }),
    ])

    // En français, « Élodie » se lit avec les E : elle passe avant « Yves ».
    expect(lines.map(line => line.name)).toEqual(['Camille Roussel', 'Élodie Fabre', 'Yves Marchand'])
  })

  it('fait apparaître une personne dont tous les créneaux sont annulés, à zéro', () => {
    // « Rien ce mois-ci » est une information ; une personne absente de la liste est un doute.
    const lines = summariseByAssistant([appointment({ status: 'cancelled' })])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ declaredMinutes: 0, plannedMinutes: 0, passages: 0 })
  })

  it('renvoie une liste vide sans créneau', () => {
    expect(summariseByAssistant([])).toEqual([])
  })
})

describe('summariseByBeneficiary', () => {
  it('compte un binôme UNE seule fois pour le bénéficiaire', () => {
    // Le volume d'heures autorisé n'est pas une réserve qu'un binôme consommerait deux fois.
    const binome = appointment({
      start: '08:00',
      end: '12:00',
      coAssistantIds: ['assist-9'],
      coAssistants: ['Nadia Benali'],
    })

    const lines = summariseByBeneficiary([binome])

    expect(lines).toHaveLength(1)
    expect(lines[0]?.declaredMinutes).toBe(240)
    expect(lines[0]?.color).toBeUndefined()
  })

  it('sépare deux bénéficiaires et trie par nom', () => {
    const lines = summariseByBeneficiary([
      appointment({ beneficiaryId: 'benef-2', beneficiary: 'Robert Bernard' }),
      appointment({ beneficiaryId: 'benef-1', beneficiary: 'Élise Dupont', start: '14:00', end: '15:00' }),
    ])

    // En français, l'accent ne change pas la lettre : « Élise » se lit avec les E, donc
    // avant « Robert ».
    expect(lines.map(line => line.name)).toEqual(['Élise Dupont', 'Robert Bernard'])
    expect(lines.map(line => line.declaredMinutes)).toEqual([60, 60])
  })
})

describe('summariseByDay', () => {
  it('trie les journées et ne garde que celles qui ont un créneau', () => {
    const days = summariseByDay([
      appointment({ date: '2026-10-05', start: '09:00', end: '11:00' }),
      appointment({ date: '2026-10-01', start: '09:00', end: '10:00' }),
      appointment({ date: '2026-10-05', start: '14:00', end: '15:00', status: 'planned' }),
    ])

    expect(days.map(day => day.date)).toEqual(['2026-10-01', '2026-10-05'])
    expect(days[0]?.declaredMinutes).toBe(60)
    expect(days[1]).toMatchObject({ declaredMinutes: 120, plannedMinutes: 60, passages: 1 })
  })

  it('attribue un créneau de nuit au jour de son DÉBUT', () => {
    // 22:00 → 01:00 le 31 octobre : tout le créneau appartient à octobre, jamais coupé
    // entre deux mois.
    const days = summariseByDay([appointment({ date: '2026-10-31', start: '22:00', end: '01:00' })])

    expect(days).toHaveLength(1)
    expect(days[0]?.date).toBe('2026-10-31')
    expect(days[0]?.declaredMinutes).toBe(180)
  })

  it('renvoie une liste vide sans créneau', () => {
    expect(summariseByDay([])).toEqual([])
  })
})

/**
 * Confrontation à la référence contractuelle : le volume d'heures autorisé d'un bénéficiaire
 * est ce qui borne la déclaration. Un dépassement doit se voir, et une référence absente ne
 * doit surtout pas être lue comme un zéro — sinon tout paraîtrait en dépassement.
 */
describe('remainingMinutes et exceedsReference', () => {
  it('calcule ce qu\'il reste', () => {
    expect(remainingMinutes({ declaredMinutes: 240, referenceMinutes: 600 })).toBe(360)
  })

  it('devient négatif en cas de dépassement', () => {
    expect(remainingMinutes({ declaredMinutes: 660, referenceMinutes: 600 })).toBe(-60)
    expect(exceedsReference({ declaredMinutes: 660, referenceMinutes: 600 })).toBe(true)
  })

  it('ne signale aucun dépassement à l\'exact', () => {
    expect(remainingMinutes({ declaredMinutes: 600, referenceMinutes: 600 })).toBe(0)
    expect(exceedsReference({ declaredMinutes: 600, referenceMinutes: 600 })).toBe(false)
  })

  it('ne dit rien sans référence saisie', () => {
    // Le piège : lire `null` comme 0 afficherait « dépassement » sur tout le monde.
    expect(remainingMinutes({ declaredMinutes: 240, referenceMinutes: 0 })).toBe(-240)
    expect(remainingMinutes({ declaredMinutes: 240, referenceMinutes: null })).toBeNull()
    expect(exceedsReference({ declaredMinutes: 240, referenceMinutes: null })).toBe(false)
  })
})
