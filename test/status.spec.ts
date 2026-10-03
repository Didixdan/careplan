import { describe, expect, it } from 'vitest'
import {
  isStatus,
  QUICK_ACTION_LABELS,
  QUICK_TRANSITIONS,
  quickTransitions,
  STATUS_LABELS,
  STATUSES,
  STATUS_TONES,
} from '~/utils/status'

/**
 * Statuts d'un créneau.
 *
 * Le type interdit déjà un statut sans libellé ; ce test verrouille le fait que les
 * tableaux publiés couvrent EXACTEMENT les valeurs stockées en base, et que le garde-fou
 * d'écriture reconnaît ces valeurs. Un statut oublié produirait un badge vide, sans
 * erreur de build.
 */
describe('statuts', () => {
  it('donne un libellé FRANÇAIS à chaque statut', () => {
    for (const status of STATUSES) {
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0)
      // Un libellé resté en anglais (la valeur de la base) serait un oubli de traduction.
      expect(STATUS_LABELS[status]).not.toBe(status)
    }
  })

  it('donne une tonalité de badge à chaque statut', () => {
    for (const status of STATUSES) {
      expect(STATUS_TONES[status]).toBeTruthy()
    }
  })

  it('ne déclare ni libellé ni tonalité en trop', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...STATUSES].sort())
    expect(Object.keys(STATUS_TONES).sort()).toEqual([...STATUSES].sort())
  })

  it('reconnaît les valeurs stockées en base', () => {
    expect(isStatus('planned')).toBe(true)
    expect(isStatus('to_validate')).toBe(true)
  })

  it('refuse une valeur inventée', () => {
    expect(isStatus('validé')).toBe(false)
    expect(isStatus('')).toBe(false)
    expect(isStatus(null)).toBe(false)
    expect(isStatus(3)).toBe(false)
  })
})

/**
 * Actions rapides : la machine à états demandée, au mot près.
 *
 * C'est elle que le serveur fait respecter (409 hors de cette table) et que les cartes
 * affichent. Une transition en trop ici ouvrirait une action que personne n'a demandée ;
 * une transition manquante obligerait à repasser par la modale.
 */
describe('actions rapides', () => {
  it('propose les deux sorties d\'un créneau planifié', () => {
    expect(quickTransitions('planned')).toEqual(['completed', 'cancelled'])
  })

  it('propose de revenir en planifié depuis « à valider »', () => {
    expect(quickTransitions('to_validate')).toEqual(['planned', 'cancelled'])
  })

  it('ne propose RIEN depuis un état final', () => {
    // `completed` et `cancelled` sont des états finaux : en sortir demande la modale.
    expect(quickTransitions('completed')).toEqual([])
    expect(quickTransitions('cancelled')).toEqual([])
  })

  it('déclare une entrée par statut, sans exception', () => {
    expect(Object.keys(QUICK_TRANSITIONS).sort()).toEqual([...STATUSES].sort())
  })

  it('ne propose jamais d\'atteindre « à valider » en action rapide', () => {
    // « À valider » est un état posé par les heures réalisées, pas un geste de saisie.
    for (const status of STATUSES) {
      expect(quickTransitions(status)).not.toContain('to_validate')
    }
  })

  it('écrit chaque libellé du point de vue de l\'action, pas du statut visé', () => {
    for (const status of STATUSES) {
      expect(QUICK_ACTION_LABELS[status]).not.toBe(STATUS_LABELS[status])
      expect(QUICK_ACTION_LABELS[status]).toMatch(/^(Marquer|Remettre|Annuler)/)
    }
  })
})
