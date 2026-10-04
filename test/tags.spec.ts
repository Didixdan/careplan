import { describe, expect, it } from 'vitest'
import {
  canonicalTagName,
  checkTagNames,
  cleanTagNames,
  commitTag,
  creatableTagName,
  MAX_TAGS,
  SUGGESTION_LIMIT,
  tagKey,
  tagLine,
  tagOptionCount,
  tagOptions,
  visibleTags,
  VISIBLE_TAGS,
} from '~/utils/tags'

/**
 * Règles des tags : ce qui est un doublon, ce qu'une carte montre, ce que l'autocomplete
 * propose, et comment on écrit plusieurs tags. Une erreur ici ne se voit pas à l'écran : elle
 * se voit dans la base, sous forme de deux tags qui devraient n'en faire qu'un.
 *
 * Les cas d'un même comportement sont groupés dans un seul `it` : c'est le COMPORTEMENT qui est
 * verrouillé, et un fichier qui répète vingt fois la même forme se lit mal à la relecture.
 */

describe('tagKey', () => {
  it('ignore la casse, les espaces de bord et les espaces internes multiples', () => {
    expect(tagKey('Courses')).toBe('courses')
    expect(tagKey('  courses  ')).toBe('courses')
    expect(tagKey('COURSES')).toBe('courses')
    expect(tagKey('Préparation   du dîner')).toBe('préparation du dîner')
    expect(tagKey('Aide\tà la\n toilette')).toBe('aide à la toilette')
    expect(tagKey('   ')).toBe('')
  })

  it('CONSERVE les accents : « préparation » et « preparation » sont deux tags', () => {
    // Pas de repli des accents : la règle doit rester reproductible en SQL sans `unaccent`.
    expect(tagKey('Préparation')).not.toBe(tagKey('Preparation'))
  })
})

describe('cleanTagNames', () => {
  it('retire les vides, normalise, et garde la première graphie dans l’ordre d’arrivée', () => {
    expect(cleanTagNames(['  Aide   à la toilette ', '', '   '])).toEqual(['Aide à la toilette'])
    // C'est celui que la personne vient de saisir qui est affiché.
    expect(cleanTagNames(['Courses', 'courses', 'Habillage'])).toEqual(['Courses', 'Habillage'])
    expect(cleanTagNames(['A', 'a', 'A ', ' a', 'B'])).toEqual(['A', 'B'])
  })

  it('renvoie une liste vide sans entrée exploitable', () => {
    expect(cleanTagNames([])).toEqual([])
    expect(cleanTagNames(['', '  '])).toEqual([])
  })
})

describe('visibleTags', () => {
  it('montre tout quand il y a la place, et rien quand il n’y a rien', () => {
    expect(visibleTags(['Courses', 'Habillage'])).toEqual({ shown: ['Courses', 'Habillage'], hidden: 0 })
    expect(visibleTags(['Courses', 'Habillage', 'Repas']).hidden).toBe(0)
    expect(visibleTags([])).toEqual({ shown: [], hidden: 0 })
  })

  it('montre les trois PREMIERS et COMPTE le reste, au lieu de le laisser croire absent', () => {
    expect(visibleTags(['Repas', 'Courses', 'Habillage', 'Veille']))
      .toEqual({ shown: ['Repas', 'Courses', 'Habillage'], hidden: 1 })
    expect(visibleTags(['a', 'b', 'c', 'd', 'e']).hidden).toBe(2)
    expect(visibleTags(['a', 'b', 'c'], 1)).toEqual({ shown: ['a'], hidden: 2 })
    expect(VISIBLE_TAGS).toBe(3)
  })
})

describe('tagLine', () => {
  it('joint les tags d’une seule façon, sans toucher à leur contenu', () => {
    expect(tagLine(['Courses', 'Habillage'])).toBe('Courses, Habillage')
    expect(tagLine(['Courses'])).toBe('Courses')
    expect(tagLine([])).toBe('')
    // C'est l'échappement du CSV (docs/pieges.md §16) qui protège ce cas, pas nous.
    expect(tagLine(['Courses ; retour'])).toBe('Courses ; retour')
  })
})

describe('canonicalTagName', () => {
  const catalogue = [{ name: 'Courses' }, { name: 'Aide à la toilette' }]

  it('adopte la graphie du catalogue, et se contente de nettoyer un tag inconnu', () => {
    expect(canonicalTagName('  courses ', catalogue)).toBe('Courses')
    expect(canonicalTagName('AIDE À LA TOILETTE', catalogue)).toBe('Aide à la toilette')
    expect(canonicalTagName('  Veille   de nuit ', catalogue)).toBe('Veille de nuit')
  })
})

describe('checkTagNames', () => {
  it('accepte une liste exploitable, doublons déduits', () => {
    expect(checkTagNames(['Courses'])).toBeNull()
    expect(checkTagNames(['Courses', 'courses'])).toBeNull()
  })

  it('refuse une liste vide, y compris remplie de vide', () => {
    // Un créneau doit décrire ce qu'on y fait : au moins un tag, comme l'intitulé avant lui.
    expect(checkTagNames([])).toBe('empty')
    expect(checkTagNames(['', '   '])).toBe('empty')
  })

  it('refuse au-delà de MAX_TAGS — sur le NETTOYÉ, pas sur la saisie', () => {
    const eleven = Array.from({ length: MAX_TAGS + 1 }, (_, index) => `Tag ${index}`)

    expect(checkTagNames(eleven)).toBe('too-many')
    expect(checkTagNames(eleven.slice(0, MAX_TAGS))).toBeNull()
    // Onze saisies dont dix distinctes : c'est le nettoyé qui compte.
    expect(checkTagNames([...eleven.slice(0, MAX_TAGS), 'Tag 0'])).toBeNull()
  })
})

describe('creatableTagName', () => {
  const catalogue = [{ name: 'Aide à la toilette' }, { name: 'Courses' }]

  it('propose de créer un nom que le catalogue ne connaît pas', () => {
    // Le cas qui compte : la recherche renvoie des suggestions VOISINES, mais aucune qui
    // corresponde — sans cette règle, on ne pourrait jamais créer ce tag-là.
    expect(creatableTagName('Aide aux courses', catalogue, [])).toBe('Aide aux courses')
    expect(creatableTagName('  Veille   de nuit  ', catalogue, [])).toBe('Veille de nuit')
    // Un créneau qui porte déjà d'autres tags n'empêche pas d'en créer un de plus.
    expect(creatableTagName('Repas', catalogue, ['Courses'])).toBe('Repas')
  })

  it('ne propose rien pour une frappe vide, un tag existant ou un tag déjà retenu', () => {
    expect(creatableTagName('', catalogue, [])).toBeNull()
    expect(creatableTagName('   ', catalogue, [])).toBeNull()
    // Le tag existe : il faut le CHOISIR, avec sa graphie — « courses » renverrait « Courses ».
    expect(creatableTagName('Courses', catalogue, [])).toBeNull()
    expect(creatableTagName('  AIDE À LA TOILETTE ', catalogue, [])).toBeNull()
    expect(creatableTagName('repas', catalogue, ['Repas'])).toBeNull()
  })
})

describe('tagOptions et commitTag', () => {
  const catalogue = [
    { id: 'a', name: 'Aide à la toilette' },
    { id: 'b', name: 'Aide aux courses' },
    { id: 'c', name: 'Courses' },
  ]

  it('propose les suggestions PUIS la création, dans cet ordre', () => {
    const options = tagOptions('aide', catalogue, [])

    expect(options.matches.map(tag => tag.name)).toEqual(['Aide à la toilette', 'Aide aux courses'])
    // « aide » n'existe pas tel quel : il est créable, et la création ferme la liste.
    expect(options.creation).toBe('aide')
    expect(tagOptionCount(options)).toBe(3)
  })

  it('classe le nom EXACT d’abord, puis les préfixes, puis le reste', () => {
    // Taper « Courses » et valider doit choisir « Courses », pas « Aide aux courses ».
    expect(tagOptions('Courses', catalogue, []).matches.map(tag => tag.name))
      .toEqual(['Courses', 'Aide aux courses'])
    // « Courses » commence par « cou » ; « Aide aux courses » ne fait que le contenir.
    expect(tagOptions('cou', catalogue, []).matches.map(tag => tag.name))
      .toEqual(['Courses', 'Aide aux courses'])
    // Le nom exact n'est pas créable : il existe.
    expect(tagOptions('Courses', catalogue, []).creation).toBeNull()
  })

  it('garde « Entrée » sur la première SUGGESTION, jamais sur la création', () => {
    // C'est le piège corrigé : sans cet ordre, « Entrée » créerait « Aide » au lieu de choisir
    // « Aide à la toilette ».
    const options = tagOptions('aide', catalogue, [])

    expect(commitTag(options, 0, 'aide')).toBe('Aide à la toilette')
    expect(commitTag(options, 1, 'aide')).toBe('Aide aux courses')
    expect(commitTag(options, 2, 'aide')).toBe('aide')
  })

  it('crée quand la recherche ne renvoie rien, et borne le curseur', () => {
    const options = tagOptions('Veille de nuit', catalogue, [])

    expect(options.matches).toEqual([])
    expect(options.creation).toBe('Veille de nuit')
    // Seule ligne de la liste, donc « Entrée » la prend.
    expect(commitTag(options, 0, 'Veille de nuit')).toBe('Veille de nuit')

    // Un index qui ne désigne plus rien ne doit pas rendre « Entrée » inerte : il retombe sur
    // la dernière ligne, ici la création.
    expect(commitTag(tagOptions('aide', catalogue, []), 7, 'aide')).toBe('aide')
  })

  it('ne choisit rien au hasard : champ vide, ligne non surlignée, liste vide', () => {
    // Le catalogue s'affiche aussi champ vide (on le découvre) : « Entrée » n'y prend pas la
    // première ligne, sinon un tag s'ajouterait sans que personne ne l'ait demandé…
    expect(commitTag(tagOptions('', catalogue, []), 0, '')).toBeNull()
    // …mais une ligne réellement surlignée est un choix.
    expect(commitTag(tagOptions('', catalogue, []), 2, '')).toBe('Courses')
    expect(commitTag({ matches: [], creation: null }, 3, '')).toBeNull()
  })

  it('écarte ce qui est déjà retenu, et liste tout le catalogue sur une frappe vide', () => {
    const options = tagOptions('aide', catalogue, ['Aide aux courses'])
    expect(options.matches.map(tag => tag.name)).toEqual(['Aide à la toilette'])

    const empty = tagOptions('', catalogue, [])
    expect(empty.matches).toHaveLength(3)
    expect(empty.creation).toBeNull()
  })

  it('borne le nombre de suggestions', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `t${index}`, name: `Tag ${index}` }))
    expect(tagOptions('tag', many, []).matches).toHaveLength(SUGGESTION_LIMIT)
  })
})

describe('MAX_TAGS', () => {
  it('borne le nombre de tags d’un créneau', () => {
    expect(MAX_TAGS).toBeGreaterThan(VISIBLE_TAGS)
    expect(MAX_TAGS).toBe(10)
  })
})
