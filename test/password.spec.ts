import { describe, expect, it } from 'vitest'
import { scryptHash, scryptVerify } from '~~/server/utils/password'

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
