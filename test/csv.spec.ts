import { describe, expect, it } from 'vitest'
import { toCsv } from '~/utils/csv'

/**
 * Sérialisation CSV.
 *
 * Le fichier produit part chez un comptable ou dans un tableur : un séparateur mal choisi, un
 * BOM oublié ou un champ non échappé ne lèvent aucune erreur — ils produisent un fichier qui
 * s'ouvre et qui est faux.
 */
describe('toCsv', () => {
  it('commence par le BOM UTF-8, sans quoi Excel casse les accents', () => {
    expect(toCsv([['Élise']]).startsWith('\uFEFF')).toBe(true)
  })

  it('sépare par des points-virgules', () => {
    expect(toCsv([['a', 'b', 'c']])).toContain('a;b;c')
  })

  it('finit les lignes par CRLF', () => {
    expect(toCsv([['a'], ['b']])).toBe('\uFEFFa\r\nb\r\n')
  })

  it('échappe un champ qui contient le séparateur', () => {
    expect(toCsv([['Courses ; retour']])).toContain('"Courses ; retour"')
  })

  it('double les guillemets internes', () => {
    expect(toCsv([['Le "grand" ménage']])).toContain('"Le ""grand"" ménage"')
  })

  it('échappe un champ qui contient un saut de ligne', () => {
    expect(toCsv([['deux\nlignes']])).toContain('"deux\nlignes"')
  })

  it('n\'échappe pas ce qui n\'en a pas besoin', () => {
    expect(toCsv([['Élise Dupont']])).toBe('\uFEFFÉlise Dupont\r\n')
  })

  it('écrit les valeurs absentes comme des cellules vides', () => {
    expect(toCsv([[null, undefined, '', 0]])).toBe('\uFEFF;;;0\r\n')
  })

  it('écrit les nombres tels quels', () => {
    expect(toCsv([[12, 3.5]])).toContain('12;3.5')
  })
})
