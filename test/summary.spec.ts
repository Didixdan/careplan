import { describe, expect, it } from 'vitest'
import type { Appointment, Status, SummaryLine } from '~~/shared/types/planning'
import { durationInMinutes } from '~/utils/duration'
import {
  DECLARED_STATUSES,
  exceedsReference,
  forecastByBeneficiary,
  forecastMinutes,
  forecastSummary,
  referenceExceeded,
  referenceRemaining,
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
    tags: [{ id: 'tag-courses', name: 'Courses' }],
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

/**
 * Une ligne du récapitulatif de bénéficiaire, à zéro : chaque test ne remplit que ce qu'il
 * interroge. `referenceMinutes` est `null` par défaut — « aucun volume saisi » est le cas
 * qu'on oublie de traiter, donc celui qui doit être le plus facile à écrire.
 */
function beneficiaryLine(overrides: Partial<SummaryLine> = {}): SummaryLine {
  return {
    id: 'benef-1',
    name: 'Élise Dupont',
    declaredMinutes: 0,
    toValidateMinutes: 0,
    plannedMinutes: 0,
    passages: 0,
    toValidatePassages: 0,
    referenceMinutes: null,
    ...overrides,
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

/**
 * Solde prévisionnel du mois : combien d'heures restent à planifier, et ce que le mois coûtera.
 *
 * Deux règles s'y croisent, et une erreur sur l'une des deux se voit sur un virement : un
 * montant se calcule au taux DU bénéficiaire concerné, et un taux manquant rend le total
 * « À saisir » plutôt que faux.
 */
describe('forecastMinutes', () => {
  it('additionne réalisé, à vérifier et prévu', () => {
    expect(forecastMinutes({ declaredMinutes: 120, toValidateMinutes: 30, plannedMinutes: 180 })).toBe(330)
  })

  it('ignore ce qui est annulé, qui n\'entre dans aucun cumul', () => {
    // Un créneau annulé sort en amont (`addAppointment`) : il ne compte nulle part.
    const totals = summarise([appointment({ status: 'cancelled' })])
    expect(forecastMinutes(totals)).toBe(0)
  })
})

describe('forecastByBeneficiary', () => {
  it('calcule le montant au taux DU bénéficiaire', () => {
    const [line] = forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 120, hourlyRateCents: 1650 }),
    ])

    // 2 h à 16,50 € = 33,00 €.
    expect(line?.amountCents).toBe(3300)
    expect(line?.forecastMinutes).toBe(120)
  })

  it('n\'invente pas un prix sans taux saisi', () => {
    const [saisi, communique] = forecastByBeneficiary([
      beneficiaryLine({ hourlyRateCents: null }),
      beneficiaryLine({ id: 'benef-2', hourlyRateCents: undefined }),
    ])

    expect(saisi?.amountCents).toBeNull()
    // Non communiqué à ce rôle : même résultat, mais l'écran n'écrira pas « À saisir ».
    expect(communique?.amountCents).toBeNull()
  })

  it('compte le prévisionnel dans le solde, pas le seul réalisé', () => {
    const [line] = forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 240, plannedMinutes: 120, referenceMinutes: 600 }),
    ])

    // 600 − (240 + 120) = 240, et non 600 − 240.
    expect(line?.balanceMinutes).toBe(240)
  })

  it('devient négatif en cas de dépassement', () => {
    const [line] = forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 480, plannedMinutes: 180, referenceMinutes: 600 }),
    ])

    expect(line?.balanceMinutes).toBe(-60)
  })

  it('ne dit rien sans volume autorisé', () => {
    // Lire `null` comme 0 ferait paraître tout le monde en dépassement.
    const [line] = forecastByBeneficiary([beneficiaryLine({ referenceMinutes: null })])
    expect(line?.balanceMinutes).toBeNull()
  })

  it('calcule le solde sur les heures prévisionnelles de TOUS les aidants', () => {
    const [line] = forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 120, referenceMinutes: 600, referenceForecastMinutes: 480 }),
    ])

    // 600 − 480 (tous aidants) = 120, et non 600 − 120 (les miennes).
    expect(line?.balanceMinutes).toBe(120)
    // Les heures de la ligne, elles, restent les siennes : c'est ce qui compose son montant.
    expect(line?.forecastMinutes).toBe(120)
  })
})

/**
 * Le volume autorisé appartient au BÉNÉFICIAIRE : quand le serveur fournit les heures de tous
 * les aidants (ligne d'un aidant, qui ne voit que ses passages), c'est elles qui le consomment.
 * Sans ces tests, un aidant lirait « reste 6 h 30 » alors qu'il ne reste que 1 h 30.
 */
describe('referenceRemaining et referenceExceeded', () => {
  it('utilise les heures de la ligne quand elle est complète', () => {
    const line = beneficiaryLine({ declaredMinutes: 120, referenceMinutes: 600 })

    expect(referenceRemaining(line)).toBe(480)
    expect(referenceExceeded(line)).toBe(false)
  })

  it('utilise les heures de TOUS les aidants quand le serveur les fournit', () => {
    // L'aidant n'a fait que 2 h, mais le volume est consommé par tout le monde.
    const complete = beneficiaryLine({ declaredMinutes: 120, referenceMinutes: 600, referenceDeclaredMinutes: 600 })
    expect(referenceRemaining(complete)).toBe(0)
    expect(referenceExceeded(complete)).toBe(false)

    const depasse = beneficiaryLine({ declaredMinutes: 120, referenceMinutes: 600, referenceDeclaredMinutes: 660 })
    expect(referenceRemaining(depasse)).toBe(-60)
    expect(referenceExceeded(depasse)).toBe(true)
  })

  it('ne dit rien sans volume autorisé', () => {
    expect(referenceRemaining(beneficiaryLine({ referenceMinutes: null }))).toBeNull()
    expect(referenceExceeded(beneficiaryLine({ referenceMinutes: null }))).toBe(false)
  })
})

describe('forecastSummary', () => {
  it('additionne les heures et les montants du mois', () => {
    const summary = forecastSummary(forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 120, hourlyRateCents: 1650, referenceMinutes: 600 }),
      beneficiaryLine({ id: 'benef-2', name: 'Robert Bernard', plannedMinutes: 60, hourlyRateCents: 1550, referenceMinutes: 300 }),
    ]))

    // 2 h à 16,50 € + 1 h à 15,50 € = 48,50 €.
    expect(summary.amountCents).toBe(4850)
    expect(summary.missingRateCount).toBe(0)
    expect(summary.balanceMinutes).toBe(720)
    expect(summary.withoutVolumeCount).toBe(0)
    expect(summary.exceededCount).toBe(0)
  })

  it('rend le montant « À saisir » dès qu\'un taux manque', () => {
    // Un total partiel présenté comme complet finirait sur une déclaration.
    const summary = forecastSummary(forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 120, hourlyRateCents: 1650 }),
      beneficiaryLine({ id: 'benef-2', name: 'Robert Bernard', declaredMinutes: 60, hourlyRateCents: null }),
    ]))

    expect(summary.amountCents).toBeNull()
    expect(summary.missingRateCount).toBe(1)
  })

  it('ne totalise le solde que des bénéficiaires qui ont un volume', () => {
    const summary = forecastSummary(forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 120, referenceMinutes: 600 }),
      beneficiaryLine({ id: 'benef-2', name: 'Robert Bernard', declaredMinutes: 60, referenceMinutes: null }),
    ]))

    expect(summary.balanceMinutes).toBe(480)
    expect(summary.withoutVolumeCount).toBe(1)
  })

  it('ne dit RIEN d\'un mois sans ligne, au lieu de dire 0 €', () => {
    // C'est le cas d'un aidant : le serveur ne lui envoie aucune ligne par bénéficiaire, donc
    // un montant à 0 € serait un mensonge — et les heures, elles, viennent des cumuls.
    const summary = forecastSummary([])

    expect(summary.amountCents).toBeNull()
    expect(summary.balanceMinutes).toBeNull()
    expect(summary.withoutVolumeCount).toBe(0)
  })

  it('ne prétend à aucun solde quand aucun volume n\'est saisi', () => {
    const summary = forecastSummary(forecastByBeneficiary([beneficiaryLine({ referenceMinutes: null })]))

    expect(summary.balanceMinutes).toBeNull()
    expect(summary.withoutVolumeCount).toBe(1)
  })

  it('compte les bénéficiaires en dépassement', () => {
    const summary = forecastSummary(forecastByBeneficiary([
      beneficiaryLine({ declaredMinutes: 660, referenceMinutes: 600 }),
      beneficiaryLine({ id: 'benef-2', name: 'Robert Bernard', declaredMinutes: 600, referenceMinutes: 600 }),
    ]))

    expect(summary.exceededCount).toBe(1)
    expect(summary.balanceMinutes).toBe(-60)
  })
})
