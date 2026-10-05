import { describe, expect, it } from 'vitest'
import type { Appointment, Status, SummaryLine, WeekIncomeLine } from '~~/shared/types/planning'
import { durationInMinutes } from '~/utils/duration'
import {
  DECLARED_STATUSES,
  exceedsReference,
  forecastByBeneficiary,
  forecastMinutes,
  forecastSummary,
  incomeGroups,
  incomeTotals,
  referenceExceeded,
  referenceRemaining,
  remainingMinutes,
  summarise,
  summariseByAssistant,
  summariseByBeneficiary,
  summariseByDay,
  summariseByPair,
  toIncomeLine,
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
  assistantColor?: Appointment['assistantColor']
  beneficiaryColor?: Appointment['beneficiaryColor']
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
    assistantColor: options.assistantColor ?? 'assistant-5',
    beneficiaryColor: options.beneficiaryColor ?? null,
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

  it('porte la couleur du bénéficiaire sur sa ligne, et rien quand il n\'en a pas', () => {
    // Une ligne parle d'une seule personne : elle porte donc SA couleur. Le `null` du
    // bénéficiaire sans couleur devient une ligne sans rail, jamais une teinte inventée.
    const lines = summariseByBeneficiary([
      appointment({ beneficiaryId: 'benef-1', beneficiary: 'Élise Dupont', beneficiaryColor: 'assistant-6' }),
      appointment({ beneficiaryId: 'benef-2', beneficiary: 'Robert Bernard', start: '14:00', end: '15:00' }),
    ])

    expect(lines[0]?.color).toBe('assistant-6')
    expect(lines[1]?.color).toBeUndefined()
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

/**
 * Une ligne de revenu, à zéro : chaque test ne remplit que ce qu'il interroge. Le taux est
 * `null` par défaut — « pas encore saisi » est le cas qu'on oublie de traiter.
 */
function incomeLine(overrides: Partial<WeekIncomeLine> = {}): WeekIncomeLine {
  return {
    assistantId: 'assist-1',
    assistantName: 'Camille Roussel',
    assistantColor: 'assistant-5',
    beneficiaryId: 'benef-1',
    beneficiaryName: 'Élise Dupont',
    beneficiaryColor: 'assistant-7',
    declaredMinutes: 0,
    toValidateMinutes: 0,
    plannedMinutes: 0,
    minutes: 0,
    passages: 0,
    toValidatePassages: 0,
    hourlyRateCents: null,
    amountCents: null,
    declaredAmountCents: null,
    ...overrides,
  }
}

describe('summariseByPair', () => {
  it('crédite les DEUX aidants d\'un binôme, et le bénéficiaire une seule fois', () => {
    const pairs = summariseByPair([
      appointment({
        start: '09:00',
        end: '11:00',
        coAssistantIds: ['assist-2'],
        coAssistants: ['Damien Martin'],
      }),
    ])

    expect(pairs.map(pair => pair.assistantId)).toEqual(['assist-1', 'assist-2'])
    // Chacun déclare les heures qu'il a faites : deux lignes de 120 min pour UNE plage.
    expect(pairs.map(pair => pair.declaredMinutes)).toEqual([120, 120])
    // Le bénéficiaire, lui, n'est compté qu'une fois.
    expect(new Set(pairs.map(pair => pair.beneficiaryId)).size).toBe(1)
  })

  it('crée une ligne PAR bénéficiaire, à son taux, pour un même aidant', () => {
    const pairs = summariseByPair([
      appointment({ start: '09:00', end: '10:00' }),
      appointment({ start: '14:00', end: '15:30', beneficiaryId: 'benef-2', beneficiary: 'Robert Bernard' }),
    ])

    expect(pairs.map(pair => [pair.beneficiaryId, pair.declaredMinutes])).toEqual([
      ['benef-1', 60],
      ['benef-2', 90],
    ])
  })

  it('porte la couleur de chaque personne, et aucune pour un co-aidant', () => {
    const pairs = summariseByPair([
      appointment({ beneficiaryColor: 'assistant-7', coAssistantIds: ['assist-2'], coAssistants: ['Damien Martin'] }),
    ])

    expect(pairs[0]).toMatchObject({ assistantColor: 'assistant-5', beneficiaryColor: 'assistant-7' })
    // Le DTO ne transporte jamais la couleur d'un co-aidant : sa ligne n'a donc aucun rail.
    expect(pairs[1]!.assistantColor).toBeUndefined()
  })

  it('écarte un couple dont tous les créneaux sont annulés', () => {
    // Un revenu à 0 € n'est pas une information : c'est du bruit dans un tableau de bord.
    expect(summariseByPair([appointment({ status: 'cancelled' })])).toEqual([])
  })

  it('range « à vérifier » et « prévu » dans le prévisionnel, hors du réalisé', () => {
    const pairs = summariseByPair([
      appointment({ start: '08:00', end: '09:00', status: 'completed' }),
      appointment({ start: '10:00', end: '11:00', status: 'to_validate' }),
      appointment({ start: '12:00', end: '13:00', status: 'planned' }),
    ])

    expect(pairs[0]).toMatchObject({
      declaredMinutes: 60,
      toValidateMinutes: 60,
      plannedMinutes: 60,
      passages: 1,
      toValidatePassages: 1,
    })
  })

  it('trie par aidant puis par bénéficiaire', () => {
    const pairs = summariseByPair([
      appointment({ assistantId: 'assist-2', assistant: 'Zoé Adam', beneficiaryId: 'benef-2', beneficiary: 'Bernard' }),
      appointment({ assistantId: 'assist-1', assistant: 'Zoé Adam', beneficiaryId: 'benef-1', beneficiary: 'Albert' }),
      appointment({ assistantId: 'assist-3', assistant: 'Alice Colin', beneficiaryId: 'benef-1', beneficiary: 'Albert' }),
    ])

    expect(pairs.map(pair => `${pair.assistantName}/${pair.beneficiaryName}`)).toEqual([
      'Alice Colin/Albert',
      'Zoé Adam/Albert',
      'Zoé Adam/Bernard',
    ])
  })

  it('ne compte qu\'une fois un aidant principal aussi co-assistant de son créneau', () => {
    const pairs = summariseByPair([
      appointment({ coAssistantIds: ['assist-1'], coAssistants: ['Camille Roussel'] }),
    ])

    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.declaredMinutes).toBe(60)
  })
})

describe('toIncomeLine', () => {
  const pair = summariseByPair([
    appointment({ start: '09:00', end: '10:00', status: 'completed' }),
    appointment({ start: '14:00', end: '15:00', status: 'to_validate' }),
    appointment({ start: '16:00', end: '17:00', status: 'planned' }),
    appointment({ start: '18:00', end: '19:00', status: 'cancelled' }),
  ])[0]!

  it('porte les heures PRÉVISIONNELLES du couple, annulés exclus', () => {
    // 1 h réalisée + 1 h à vérifier + 1 h prévue ; l'annulé ne compte pas.
    expect(toIncomeLine(pair, null).minutes).toBe(180)
  })

  it('chiffre le prévisionnel et le réalisé au taux du bénéficiaire', () => {
    const line = toIncomeLine(pair, 2000)

    expect(line.hourlyRateCents).toBe(2000)
    expect(line.amountCents).toBe(6000) // 3 h × 20,00 €/h
    expect(line.declaredAmountCents).toBe(2000) // 1 h réalisée
  })

  it('n\'invente aucun montant sans taux, et distingue « non saisi » de « non communiqué »', () => {
    // `null` : le taux n'est pas saisi — le champ EXISTE, et l'écran écrit « À saisir ».
    const missing = toIncomeLine(pair, null)
    expect(missing.hourlyRateCents).toBeNull()
    expect(missing.amountCents).toBeNull()

    // `undefined` : le taux n'est pas communiqué à ce rôle — le champ DISPARAÎT, donc l'écran
    // masque le bloc au lieu d'annoncer un montant qu'il n'a pas le droit de montrer.
    const hidden = toIncomeLine(pair)
    expect(Object.keys(hidden)).not.to.include('hourlyRateCents')
    expect(hidden.amountCents).toBeNull()
    expect(hidden.declaredAmountCents).toBeNull()
  })
})

describe('incomeTotals', () => {
  it('additionne les lignes quand tous les taux sont saisis', () => {
    const totals = incomeTotals([
      incomeLine({ hourlyRateCents: 3875, amountCents: 3875, declaredMinutes: 60, declaredAmountCents: 3875 }),
      incomeLine({ beneficiaryId: 'benef-2', hourlyRateCents: 2000, amountCents: 3000, toValidateMinutes: 90 }),
    ])

    expect(totals).toEqual({ amountCents: 6875, declaredAmountCents: 3875, missingRateCount: 0 })
  })

  it('ne présente JAMAIS un total partiel : un taux non saisi rend le montant `null`', () => {
    const totals = incomeTotals([
      incomeLine({ hourlyRateCents: 3875, amountCents: 3875 }),
      incomeLine({ beneficiaryId: 'benef-2', hourlyRateCents: null }),
    ])

    expect(totals.amountCents).toBeNull()
    expect(totals.missingRateCount).toBe(1)
  })

  it('ne compte pas un taux NON COMMUNIQUÉ comme manquant', () => {
    // Un lecteur ne reçoit pas le champ : il n'y a aucun montant à annoncer, mais rien de
    // « manquant » non plus — sinon l'écran écrirait « À saisir » là où il n'a pas le droit
    // de montrer un montant.
    const totals = incomeTotals([incomeLine({ hourlyRateCents: undefined })])

    expect(totals.amountCents).toBeNull()
    expect(totals.missingRateCount).toBe(0)
  })

  it('dit « rien de réalisé » (0 €), et non « montant inconnu », quand rien n\'est fait', () => {
    const totals = incomeTotals([incomeLine({ hourlyRateCents: 3875, amountCents: 3875, plannedMinutes: 60 })])

    expect(totals.amountCents).toBe(3875)
    expect(totals.declaredAmountCents).toBe(0)
  })

  it('laisse le réalisé chiffré même si une ligne ENCORE PRÉVUE manque un taux', () => {
    const totals = incomeTotals([
      incomeLine({ hourlyRateCents: 3875, amountCents: 3875, declaredMinutes: 60, declaredAmountCents: 3875 }),
      incomeLine({ beneficiaryId: 'benef-2', hourlyRateCents: null, plannedMinutes: 60 }),
    ])

    expect(totals.amountCents).toBeNull()
    expect(totals.declaredAmountCents).toBe(3875)
  })

  it('rend le réalisé `null` si une ligne RÉALISÉE manque un taux', () => {
    const totals = incomeTotals([
      incomeLine({ hourlyRateCents: null, declaredMinutes: 60, declaredAmountCents: null }),
    ])

    expect(totals.declaredAmountCents).toBeNull()
  })

  it('ne dit rien d\'une liste vide', () => {
    expect(incomeTotals([])).toEqual({ amountCents: null, declaredAmountCents: 0, missingRateCount: 0 })
  })
})

describe('incomeGroups', () => {
  it('groupe par aidant en gardant l\'ordre reçu', () => {
    const groups = incomeGroups([
      incomeLine({ minutes: 60, hourlyRateCents: 3875, amountCents: 3875, declaredMinutes: 60, declaredAmountCents: 3875 }),
      incomeLine({ beneficiaryId: 'benef-2', minutes: 60, hourlyRateCents: 2000, amountCents: 2000, plannedMinutes: 60 }),
      incomeLine({ assistantId: 'assist-2', assistantName: 'Damien Martin', minutes: 60, hourlyRateCents: 1000, amountCents: 1000, plannedMinutes: 60 }),
    ])

    expect(groups.map(group => group.assistantName)).toEqual(['Camille Roussel', 'Damien Martin'])
    expect(groups[0]!.lines).toHaveLength(2)
    expect(groups[0]!.amountCents).toBe(5875)
    expect(groups[0]!.minutes).toBe(120)
    expect(groups[0]!.declaredMinutes).toBe(60)
  })

  it('rend le sous-total d\'un aidant `null` dès qu\'une de ses lignes manque un taux', () => {
    const groups = incomeGroups([
      incomeLine({ hourlyRateCents: 3875, amountCents: 3875 }),
      incomeLine({ beneficiaryId: 'benef-2', hourlyRateCents: null, plannedMinutes: 60 }),
    ])

    expect(groups[0]!.amountCents).toBeNull()
    expect(groups[0]!.missingRateCount).toBe(1)
  })

  it('ne renvoie aucun groupe pour aucune ligne', () => {
    expect(incomeGroups([])).toEqual([])
  })
})
