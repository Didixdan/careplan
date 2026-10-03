import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_COLORS,
  ASSISTANT_COLOR_LABELS,
  defaultAssistantColor,
  isAssistantColor,
} from '~/utils/colors'

/**
 * Couleurs d'aidant.
 *
 * Contrat : la base stockera un IDENTIFIANT (`assistant-3`), jamais un code
 * hexadécimal. Ces tests verrouillent le fait que la validation refuse tout ce qui
 * n'est pas l'un des huit identifiants — une couleur libre casserait le contraste
 * garanti et la distinction des teintes.
 */
describe('ASSISTANT_COLORS', () => {
  it('expose exactement huit teintes', () => {
    expect(ASSISTANT_COLORS).toHaveLength(8)
  })

  it('n\'a aucun doublon', () => {
    expect(new Set(ASSISTANT_COLORS).size).toBe(ASSISTANT_COLORS.length)
  })

  it('suit la convention de nommage attendue par les jetons CSS', () => {
    // `--color-assistant-N` : le nom doit rester utilisable tel quel en CSS.
    for (const color of ASSISTANT_COLORS) {
      expect(color).toMatch(/^assistant-[1-8]$/)
    }
  })
})

describe('ASSISTANT_COLOR_LABELS', () => {
  it('couvre les huit teintes', () => {
    for (const color of ASSISTANT_COLORS) {
      expect(ASSISTANT_COLOR_LABELS[color]).toBeTruthy()
    }
  })

  it('n\'a aucun libellé vide', () => {
    const libelles = Object.values(ASSISTANT_COLOR_LABELS)
    expect(libelles.every(label => label.trim().length > 0)).toBe(true)
  })
})

describe('isAssistantColor', () => {
  it('accepte les huit identifiants', () => {
    for (const color of ASSISTANT_COLORS) {
      expect(isAssistantColor(color)).toBe(true)
    }
  })

  it('rejette un identifiant hors plage', () => {
    expect(isAssistantColor('assistant-9')).toBe(false)
    expect(isAssistantColor('assistant-0')).toBe(false)
  })

  it('rejette une couleur libre, qui casserait le contraste garanti', () => {
    expect(isAssistantColor('#ff0000')).toBe(false)
    expect(isAssistantColor('oklch(50% 0.1 200)')).toBe(false)
    expect(isAssistantColor('rouge')).toBe(false)
  })

  it('rejette ce qui n\'est pas une chaîne', () => {
    expect(isAssistantColor(null)).toBe(false)
    expect(isAssistantColor(undefined)).toBe(false)
    expect(isAssistantColor(3)).toBe(false)
    expect(isAssistantColor({})).toBe(false)
  })
})

describe('defaultAssistantColor', () => {
  it('est déterministe : un même nom donne toujours la même couleur', () => {
    // Sans cela, la couleur d'un aidant changerait à chaque rechargement.
    expect(defaultAssistantColor('Camille R.')).toBe(defaultAssistantColor('Camille R.'))
  })

  it('renvoie toujours un identifiant valide', () => {
    const noms = ['A', 'Sofia Lambert', 'Jean-Pierre', 'éàü', '', 'x'.repeat(200)]
    for (const lastName of noms) {
      expect(isAssistantColor(defaultAssistantColor(lastName))).toBe(true)
    }
  })

  it('répartit des noms différents sur plusieurs teintes', () => {
    const noms = ['Camille', 'Sofia', 'Nadia', 'Yves', 'Marc', 'Léa', 'Hugo', 'Inès']
    const obtenues = new Set(noms.map(defaultAssistantColor))
    // On ne peut pas exiger une répartition parfaite d'un hachage, mais une
    // fonction qui renverrait toujours la même teinte serait inutilisable.
    expect(obtenues.size).toBeGreaterThan(1)
  })

  it('accepte une chaîne vide sans planter', () => {
    expect(isAssistantColor(defaultAssistantColor(''))).toBe(true)
  })
})
