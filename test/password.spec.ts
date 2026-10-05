import { describe, expect, it } from 'vitest'
import { generatePassword, PASSWORD_ALPHABET, scryptHash, scryptVerify } from '~~/server/utils/password'

describe('scryptHash / scryptVerify', () => {
  it('accepte un mot de passe correct', () => {
    const hash = scryptHash('careplan')
    expect(scryptVerify('careplan', hash)).toBe(true)
  })

  it('rejette un mot de passe incorrect', () => {
    const hash = scryptHash('careplan')
    expect(scryptVerify('mauvais', hash)).toBe(false)
  })

  it('génère un sel unique à chaque appel', () => {
    const first = scryptHash('careplan')
    const second = scryptHash('careplan')
    expect(first).not.toBe(second)
    expect(scryptVerify('careplan', first)).toBe(true)
    expect(scryptVerify('careplan', second)).toBe(true)
  })
})

describe('generatePassword', () => {
  it('produit 16 caractères par défaut, et la longueur demandée sinon', () => {
    expect(generatePassword()).toHaveLength(16)
    expect(generatePassword(24)).toHaveLength(24)
  })

  it('n\'utilise que l\'alphabet, donc AUCUN caractère ambigu', () => {
    // Le test lit l'alphabet EXPORTÉ, il ne le recopie pas : y remettre un « O » ferait échouer
    // les deux assertions, et c'est exactement la règle à tenir.
    const password = generatePassword(64)
    expect([...password].every(character => PASSWORD_ALPHABET.includes(character))).toBe(true)
    expect(password).not.toMatch(/[0O1Il]/)
  })

  it('ne se répète pas d\'un appel à l\'autre', () => {
    expect(generatePassword()).not.toBe(generatePassword())
  })

  it('produit un mot de passe que l\'application sait vérifier', () => {
    // Le seul contrat qui compte : ce que le script écrit, la page de connexion l'accepte.
    const password = generatePassword()
    expect(scryptVerify(password, scryptHash(password))).toBe(true)
  })
})
