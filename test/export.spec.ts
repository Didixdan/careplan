import { describe, expect, it } from 'vitest'
import { ASSISTANT_TOTAL_LABEL, cesuCsv, MISSING_RATE, weekCsv, WEEK_TOTAL_LABEL } from '~/utils/export'
import { week } from '~/utils/date'

/**
 * Constructeurs des exports.
 *
 * Ils sont testés au caractère près : un CSV faux ne lève rien, il produit un montant faux
 * dans une déclaration. Les deux pièges verrouillés ici sont « un taux manquant » (le total
 * doit le dire, pas l'ignorer) et « un créneau annulé » (il s'affiche, mais il ne se totalise
 * pas).
 */
describe('cesuCsv', () => {
  const lines = [
    { assistantName: 'Camille Roussel', beneficiaryName: 'Élise Dupont', declaredMinutes: 750, toValidateMinutes: 0, passages: 5, hourlyRateCents: 1650 },
    { assistantName: 'Camille Roussel', beneficiaryName: 'Robert Bernard', declaredMinutes: 240, toValidateMinutes: 30, passages: 2, hourlyRateCents: null },
    { assistantName: 'Sofia Lambert', beneficiaryName: 'Lucie Petit', declaredMinutes: 180, toValidateMinutes: 0, passages: 1, hourlyRateCents: 1550 },
  ]

  const expected = [
    'Période;Aidant;Bénéficiaire;Heures (décimal);Durée (h:min);Passages;Heures à vérifier (décimal);Taux horaire (€);Montant (€);Km',
    '2026-10;Camille Roussel;Élise Dupont;12,50;12 h 30;5;0,00;16,50;206,25;',
    `2026-10;Camille Roussel;Robert Bernard;4,00;4 h 00;2;0,50;${MISSING_RATE};${MISSING_RATE};`,
    `2026-10;Camille Roussel;${ASSISTANT_TOTAL_LABEL};16,50;16 h 30;7;0,50;${MISSING_RATE};${MISSING_RATE};0,00`,
    '2026-10;Sofia Lambert;Lucie Petit;3,00;3 h 00;1;0,00;15,50;46,50;',
    `2026-10;Sofia Lambert;${ASSISTANT_TOTAL_LABEL};3,00;3 h 00;1;0,00;15,50;46,50;0,00`,
  ].join('\r\n')

  it('écrit une ligne par bénéficiaire, puis le total de l\'aidant', () => {
    expect(cesuCsv('2026-10', lines)).toBe(`\uFEFF${expected}\r\n`)
  })

  it('ne met les kilomètres que sur le total de l\'aidant', () => {
    // Un kilomètre déclaré à la journée ne s'attribue à aucun bénéficiaire : la colonne reste
    // vide sur les lignes de détail, et remplie — même à zéro — sur le total.
    const csv = cesuCsv('2026-10', [lines[2]!], { 'Sofia Lambert': 42.5 })
    const [header, detail, total] = csv.split('\r\n')

    expect(header).toContain(';Km')
    expect(detail).toContain('46,50;')
    expect(detail?.endsWith(';')).toBe(true)
    expect(total).toContain(';42,50')
  })

  it('dit « À saisir » plutôt que d\'inventer un montant', () => {
    const csv = cesuCsv('2026-10', [lines[1]!])

    expect(csv).toContain(`;${MISSING_RATE};${MISSING_RATE}`)
    // Les heures restent justes : c'est le montant qui manque, pas le travail.
    expect(csv).toContain('4,00;4 h 00;2;0,50')
  })

  it('calcule le total de l\'aidant en additionnant les sous-totaux', () => {
    // 12 h 30 à 16,50 €/h + 4 h sans taux : le montant du mois ne peut pas être complet.
    const csv = cesuCsv('2026-10', lines.slice(0, 2))
    const total = csv.split('\r\n').find(line => line.includes(ASSISTANT_TOTAL_LABEL))

    expect(total).toContain('16,50;16 h 30;7')
  })

  it('garde le taux quand l\'aidant n\'a qu\'un taux dans le mois', () => {
    const csv = cesuCsv('2026-10', [lines[2]!])

    expect(csv).toContain(`Sofia Lambert;${ASSISTANT_TOTAL_LABEL};3,00;3 h 00;1;0,00;15,50;46,50`)
  })

  it('trie les aidants et leurs bénéficiaires', () => {
    const csv = cesuCsv('2026-10', [...lines].reverse())
    const rows = csv.split('\r\n').slice(1, 4)

    expect(rows[0]).toContain('Camille Roussel;Élise Dupont')
    expect(rows[1]).toContain('Camille Roussel;Robert Bernard')
    expect(rows[2]).toContain(ASSISTANT_TOTAL_LABEL)
  })

  it('produit un en-tête seul quand le mois n\'a rien', () => {
    const csv = cesuCsv('2026-10', [])

    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1)
  })
})

describe('weekCsv', () => {
  const dates = week('2026-09-30')
  const lines = [
    { date: '2026-09-28', start: '09:00', end: '11:00', assistantNames: ['Camille Roussel'], beneficiaryName: 'Élise Dupont', tags: ['Aide à la toilette'], status: 'completed' as const },
    { date: '2026-09-28', start: '11:00', end: '11:30', assistantNames: ['Camille Roussel'], beneficiaryName: 'Élise Dupont', tags: ['Passage court', 'Traitement'], status: 'to_validate' as const },
    { date: '2026-09-30', start: '08:00', end: '10:00', assistantNames: ['Sofia Lambert'], beneficiaryName: 'Lucie Petit', tags: ['Courses'], status: 'planned' as const },
    { date: '2026-10-01', start: '22:00', end: '01:00', assistantNames: ['Nadia Benali'], beneficiaryName: 'Lucie Petit', tags: ['Veille'], status: 'planned' as const },
    { date: '2026-10-02', start: '14:00', end: '15:00', assistantNames: ['Camille Roussel'], beneficiaryName: 'Élise Dupont', tags: ['Annulé'], status: 'cancelled' as const },
  ]

  const expected = [
    'Semaine;Aidant(s);Date;Jour;Début;Fin;Durée (h:min);Heures (décimal);Bénéficiaire;Tags;Statut',
    '28 septembre – 4 octobre 2026;Camille Roussel;2026-09-28;lundi;09:00;11:00;2 h 00;2,00;Élise Dupont;Aide à la toilette;Réalisé',
    '28 septembre – 4 octobre 2026;Camille Roussel;2026-09-28;lundi;11:00;11:30;30 min;0,50;Élise Dupont;Passage court, Traitement;À vérifier',
    '28 septembre – 4 octobre 2026;Sofia Lambert;2026-09-30;mercredi;08:00;10:00;2 h 00;2,00;Lucie Petit;Courses;Planifié',
    '28 septembre – 4 octobre 2026;Nadia Benali;2026-10-01;jeudi;22:00;01:00;3 h 00;3,00;Lucie Petit;Veille;Planifié',
    '28 septembre – 4 octobre 2026;Camille Roussel;2026-10-02;vendredi;14:00;15:00;;;Élise Dupont;Annulé;Annulé',
    `28 septembre – 4 octobre 2026;Camille Roussel;;;;;2 h 30;2,50;;${WEEK_TOTAL_LABEL};`,
    `28 septembre – 4 octobre 2026;Nadia Benali;;;;;3 h 00;3,00;;${WEEK_TOTAL_LABEL};`,
    `28 septembre – 4 octobre 2026;Sofia Lambert;;;;;2 h 00;2,00;;${WEEK_TOTAL_LABEL};`,
  ].join('\r\n')

  it('liste les passages de la semaine et les totaux par aidant', () => {
    expect(weekCsv(dates, lines)).toBe(`\uFEFF${expected}\r\n`)
  })

  it('affiche un passage annulé sans le totaliser', () => {
    const csv = weekCsv(dates, [lines[4]!])

    expect(csv).toContain('Annulé;Annulé')
    // Aucune durée : le passage n'a pas eu lieu, il ne compte pas.
    expect(csv).toContain(';;Élise Dupont;Annulé;Annulé')
    expect(csv).toContain(`${WEEK_TOTAL_LABEL}`)
    expect(csv.split('\r\n').at(-2)).toContain('0 min;0,00')
  })

  it('compte un créneau de nuit sur sa durée réelle', () => {
    const csv = weekCsv(dates, [lines[3]!])

    expect(csv).toContain(';22:00;01:00;3 h 00;3,00;')
  })

  it('crédite les DEUX aidants d\'un binôme', () => {
    // Sinon les heures d'un co-aidant disparaîtraient de sa propre semaine : il était là.
    const binome = [{ ...lines[2]!, assistantNames: ['Camille Roussel', 'Nadia Benali'] }]
    const csv = weekCsv(dates, binome)
    const totals = csv.split('\r\n').filter(row => row.includes(WEEK_TOTAL_LABEL))

    expect(csv).toContain('Camille Roussel, Nadia Benali')
    expect(totals).toHaveLength(2)
    expect(totals.every(row => row.includes('2 h 00;2,00'))).toBe(true)
  })

  it('porte TOUS les tags d’un créneau, pas les trois de la carte', () => {
    // La carte n'en montre que trois : l'export ne doit pas hériter de cette limite.
    const csv = weekCsv(dates, [lines[1]!])

    expect(csv).toContain(';Passage court, Traitement;À vérifier')
  })

  it('échappe un tag qui contient un point-virgule', () => {
    // C'est le nom du tag qui vient de la saisie : l'échappement CSV le protège
    // (docs/pieges.md §16).
    const csv = weekCsv(dates, [{ ...lines[0]!, tags: ['Courses ; retour'] }])

    expect(csv).toContain('"Courses ; retour"')
  })

  it('produit un en-tête seul quand la semaine est vide', () => {
    const csv = weekCsv(dates, [])

    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1)
  })
})
