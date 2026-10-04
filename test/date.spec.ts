import { describe, expect, it } from 'vitest'
import {
  addDays,
  today,
  longDate,
  isToday,
  isCivilDate,
  shortDay,
  longDay,
  weekLabel,
  startOfWeek,
  longMonth,
  dayOfMonth,
  week,
  dayIndex,
  isCivilMonth,
  monthOf,
  monthStart,
  monthAfter,
  shiftMonth,
  monthLabel,
  weekShift,
} from '~/utils/date'

/**
 * Dates civiles : des chaînes `'YYYY-MM-DD'`, sans fuseau.
 *
 * Ces tests existent parce que le piège de ce module est silencieux : un `Date`
 * manipulé par erreur décale les créneaux d'un jour selon le fuseau du serveur,
 * et rien ne le signale avant qu'un planning s'affiche au mauvais jour.
 */
describe('isCivilDate', () => {
  it('accepte une date valide', () => {
    expect(isCivilDate('2025-03-14')).toBe(true)
  })

  it('accepte le 29 février d\'une année bissextile', () => {
    expect(isCivilDate('2024-02-29')).toBe(true)
  })

  it('rejette un 29 février hors année bissextile', () => {
    // 2025 n'est pas bissextile : `new Date` normalizeait au 1er mars, ce qui
    // ferait glisser un créneau sur le mauvais jour sans aucune erreur.
    expect(isCivilDate('2025-02-29')).toBe(false)
  })

  it('rejette un mois ou un jour hors bornes', () => {
    expect(isCivilDate('2025-13-01')).toBe(false)
    expect(isCivilDate('2025-04-31')).toBe(false)
    expect(isCivilDate('2025-00-10')).toBe(false)
  })

  it('rejette un format non conforme', () => {
    expect(isCivilDate('14/03/2025')).toBe(false)
    expect(isCivilDate('2025-3-14')).toBe(false)
    expect(isCivilDate('abc')).toBe(false)
    expect(isCivilDate('')).toBe(false)
  })

  it('rejette ce qui n\'est pas une chaîne', () => {
    expect(isCivilDate(null)).toBe(false)
    expect(isCivilDate(undefined)).toBe(false)
    expect(isCivilDate(20250314)).toBe(false)
  })
})

describe('addDays', () => {
  it('avance dans le même mois', () => {
    expect(addDays('2025-03-14', 3)).toBe('2025-03-17')
  })

  it('recule dans le même mois', () => {
    expect(addDays('2025-03-14', -3)).toBe('2025-03-11')
  })

  it('franchit une fin de mois', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
  })

  it('franchit une fin d\'année', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
  })

  it('franchit une année bissextile', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
  })

  it('remainder stable sur un décalage nul', () => {
    expect(addDays('2025-03-14', 0)).toBe('2025-03-14')
  })

  it('traverse une année entière', () => {
    expect(addDays('2025-03-14', 365)).toBe('2026-03-14')
  })
})

describe('startOfWeek', () => {
  // 2025-03-10 est un lundi : repère de référence.
  it('renvoie le même jour pour un lundi', () => {
    expect(startOfWeek('2025-03-10')).toBe('2025-03-10')
  })

  it('remonte au lundi pour chaque jour de la semaine', () => {
    expect(startOfWeek('2025-03-11')).toBe('2025-03-10') // mardi
    expect(startOfWeek('2025-03-12')).toBe('2025-03-10') // mercredi
    expect(startOfWeek('2025-03-13')).toBe('2025-03-10') // jeudi
    expect(startOfWeek('2025-03-14')).toBe('2025-03-10') // vendredi
    expect(startOfWeek('2025-03-15')).toBe('2025-03-10') // samedi
    expect(startOfWeek('2025-03-16')).toBe('2025-03-10') // dimanche
  })

  it('rattache le dimanche à la semaine qui se termine, pas à la suivante', () => {
    // Cas le plus facile à inverser : `getUTCDay()` renvoie 0 pour dimanche.
    expect(longDay('2025-03-16')).toBe('dimanche')
    expect(startOfWeek('2025-03-16')).toBe('2025-03-10')
  })

  it('franchit un changement de mois', () => {
    expect(startOfWeek('2025-03-02')).toBe('2025-02-24') // dimanche 2 mars
  })
})

describe('week', () => {
  it('renvoie sept dates, du lundi au dimanche', () => {
    const days = week('2025-03-14')
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2025-03-10')
    expect(days[6]).toBe('2025-03-16')
  })

  it('conserve l\'ordre croissant', () => {
    const days = week('2025-03-14')
    const sorted = [...days].sort()
    expect(days).toEqual(sorted)
  })

  it('enjambe un changement de mois', () => {
    const days = week('2025-03-02')
    expect(days[0]).toBe('2025-02-24')
    expect(days[6]).toBe('2025-03-02')
  })

  it('enjambe un changement d\'année', () => {
    const days = week('2026-01-01')
    expect(days[0]).toBe('2025-12-29')
    expect(days[6]).toBe('2026-01-04')
  })

  it('est idempotente : une date de la semaine redonne la même semaine', () => {
    const depuisJeudi = week('2025-03-13')
    const depuisDimanche = week('2025-03-16')
    expect(depuisDimanche).toEqual(depuisJeudi)
  })
})

describe('libellés', () => {
  it('extrait les composantes d\'une date', () => {
    expect(dayOfMonth('2025-03-04')).toBe('4')
    expect(shortDay('2025-03-14')).toBe('ven')
    expect(longDay('2025-03-14')).toBe('vendredi')
    expect(longMonth('2025-03-14')).toBe('mars')
    expect(longDate('2025-03-14')).toBe('vendredi 14 mars')
  })

  it('abrège une semaine sur un mois identique', () => {
    expect(weekLabel(week('2025-03-14'))).toBe('10 – 16 mars 2025')
  })

  it('nomme les deux mois quand ils diffèrent', () => {
    expect(weekLabel(week('2025-03-02'))).toBe('24 février – 2 mars 2025')
  })

  it('nomme les deux années quand elles diffèrent', () => {
    const label = weekLabel(week('2026-01-01'))
    expect(label).toContain('décembre')
    expect(label).toContain('janvier')
    expect(label).toContain('2025')
    expect(label).toContain('2026')
  })

  it('renvoie une chaîne vide sur une liste vide', () => {
    expect(weekLabel([])).toBe('')
  })
})

describe('today', () => {
  it('produit une date civile valide', () => {
    expect(isCivilDate(today())).toBe(true)
  })

  it('est cohérente avec isToday', () => {
    expect(isToday(today())).toBe(true)
    expect(isToday('1999-01-01')).toBe(false)
  })
})

/**
 * Distance en jours. Sert à comparer deux créneaux sur une échelle absolue : un créneau de
 * nuit (22:00 → 01:00) déborde sur le lendemain, donc une comparaison « même date » le
 * raterait. Un décalage d'un jour de trop refuserait un créneau valide — panne silencieuse.
 */
describe('dayIndex', () => {
  it('avance exactement d\'un jour par jour', () => {
    expect(dayIndex('2025-03-11') - dayIndex('2025-03-10')).toBe(1)
  })

  it('franchit un changement de mois', () => {
    expect(dayIndex('2025-03-01') - dayIndex('2025-02-28')).toBe(1)
  })

  it('franchit un changement d\'année', () => {
    expect(dayIndex('2026-01-01') - dayIndex('2025-12-31')).toBe(1)
  })

  it('compte le 29 février d\'une année bissextile', () => {
    expect(dayIndex('2024-03-01') - dayIndex('2024-02-29')).toBe(1)
    expect(dayIndex('2025-03-01') - dayIndex('2025-02-28')).toBe(1)
  })

  it('est ancré sur l\'époque', () => {
    expect(dayIndex('1970-01-01')).toBe(0)
  })

  it('reste entier : un minuit UTC, jamais une heure locale', () => {
    // Une heure d'été rendrait un résultat fractionnaire et fausserait les comparaisons.
    expect(Number.isInteger(dayIndex('2025-03-30'))).toBe(true)
    expect(Number.isInteger(dayIndex('2025-10-26'))).toBe(true)
  })
})

/**
 * Mois civils. La lecture mensuelle du récapitulatif en dépend : un mois mal formé qui
 * passerait pour valide donnerait des totaux faux, sans erreur — exactement ce qu'un
 * récapitulatif de déclaration ne peut pas se permettre.
 */
describe('isCivilMonth', () => {
  it('accepte un mois à deux chiffres', () => {
    expect(isCivilMonth('2026-10')).toBe(true)
    expect(isCivilMonth('2026-01')).toBe(true)
    expect(isCivilMonth('2026-12')).toBe(true)
  })

  it('rejette un mois hors bornes', () => {
    expect(isCivilMonth('2026-13')).toBe(false)
    expect(isCivilMonth('2026-00')).toBe(false)
  })

  it('rejette un mois sans zéro initial', () => {
    // `'2026-1'` trierait et se comparerait mal : on exige la forme complète.
    expect(isCivilMonth('2026-1')).toBe(false)
  })

  it('rejette une date complète et un format court', () => {
    expect(isCivilMonth('2026-10-02')).toBe(false)
    expect(isCivilMonth('26-10')).toBe(false)
  })

  it('rejette ce qui n\'est pas une chaîne', () => {
    expect(isCivilMonth(null)).toBe(false)
    expect(isCivilMonth(202610)).toBe(false)
    expect(isCivilMonth(undefined)).toBe(false)
  })
})

describe('monthOf', () => {
  it('extrait le mois d\'une date', () => {
    expect(monthOf('2026-10-02')).toBe('2026-10')
    expect(monthOf('2026-01-31')).toBe('2026-01')
  })
})

describe('monthStart', () => {
  it('renvoie le premier jour du mois', () => {
    expect(monthStart('2026-10')).toBe('2026-10-01')
  })
})

describe('monthAfter', () => {
  it('renvoie le premier jour du mois suivant', () => {
    expect(monthAfter('2026-10')).toBe('2026-11-01')
  })

  it('franchit le changement d\'année', () => {
    expect(monthAfter('2026-12')).toBe('2027-01-01')
  })

  it('passe février sans se tromper sur les années bissextiles', () => {
    expect(monthAfter('2024-02')).toBe('2024-03-01')
    expect(monthAfter('2025-02')).toBe('2025-03-01')
  })
})

describe('shiftMonth', () => {
  it('avance et recule d\'un mois', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
    expect(shiftMonth('2026-10', -1)).toBe('2026-09')
  })

  it('franchit les deux changements d\'année', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('accepte un décalage de plusieurs mois', () => {
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
    expect(shiftMonth('2026-10', 15)).toBe('2028-01')
  })

  it('ne change rien avec un décalage nul', () => {
    expect(shiftMonth('2026-10', 0)).toBe('2026-10')
  })
})

describe('monthLabel', () => {
  it('écrit le mois en toutes lettres', () => {
    expect(monthLabel('2026-10')).toBe('octobre 2026')
    expect(monthLabel('2026-01')).toBe('janvier 2026')
    expect(monthLabel('2026-12')).toBe('décembre 2026')
  })
})

/**
 * Décalage d'une semaine à l'autre, pour la copie de semaine.
 *
 * Un décalage faux d'un jour recopierait un créneau sur le mauvais jour de la semaine
 * cible : le planning aurait l'air correct, avec un passage le mardi au lieu du lundi.
 * Les cas testés sont ceux qui cassent un calcul fait « à la main » : deux références qui
 * ne sont pas des lundis, et un franchissement de mois ou d'année.
 */
describe('weekShift', () => {
  it('vaut 0 pour deux dates de la même semaine, même si ce ne sont pas des lundis', () => {
    expect(weekShift('2025-03-10', '2025-03-16')).toBe(0)
    expect(weekShift('2025-03-14', '2025-03-11')).toBe(0)
  })

  it('avance de 7 jours par semaine', () => {
    expect(weekShift('2025-03-10', '2025-03-17')).toBe(7)
    expect(weekShift('2025-03-10', '2025-03-31')).toBe(21)
  })

  it('recule d\'autant, avec un signe négatif', () => {
    expect(weekShift('2025-03-17', '2025-03-10')).toBe(-7)
  })

  it('franchit un changement de mois', () => {
    expect(weekShift('2025-02-24', '2025-03-03')).toBe(7)
  })

  it('franchit un changement d\'année', () => {
    expect(weekShift('2025-12-29', '2026-01-05')).toBe(7)
  })

  it('enjambe l\'année bissextile sans perdre de jour', () => {
    expect(weekShift('2024-02-26', '2024-03-04')).toBe(7)
  })
})
