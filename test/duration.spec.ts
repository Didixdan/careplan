import { describe, expect, it } from 'vitest'
import {
  parseTime,
  durationInMinutes,
  formatDuration,
  addMinutesToTime,
  durationProportion,
} from '~/utils/duration'

/**
 * Durées de créneaux.
 *
 * Le cas critique est le PASSAGE DE MINUIT : un créneau de 22:00 à 01:00 dure
 * 3 heures. Sans traitement, la soustraction donne −21 h et tous les créneaux de
 * nuit — fréquents en aide à domicile — sont faux. Ce test est la seule chose qui
 * empêche une régression silencieuse sur ce point.
 */
describe('parseTime', () => {
  it('convertit une heure en minutes depuis minuit', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('08:30')).toBe(510)
    expect(parseTime('23:59')).toBe(1439)
  })

  it('accepte une heure sans zéro initial', () => {
    expect(parseTime('8:05')).toBe(485)
  })

  it('ignore les secondes', () => {
    expect(parseTime('08:30:45')).toBe(510)
  })

  it('tolère les espaces autour', () => {
    expect(parseTime('  09:15  ')).toBe(555)
  })

  it('rejette les heures hors bornes', () => {
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('08:60')).toBeNull()
    expect(parseTime('99:99')).toBeNull()
  })

  it('rejette les formats non conformes', () => {
    expect(parseTime('8h30')).toBeNull()
    expect(parseTime('08')).toBeNull()
    expect(parseTime('')).toBeNull()
  })

  it('rejette une valeur absente', () => {
    expect(parseTime(null)).toBeNull()
    expect(parseTime(undefined)).toBeNull()
  })
})

describe('durationInMinutes', () => {
  it('calcule une durée ordinaire', () => {
    expect(durationInMinutes('08:00', '10:00')).toBe(120)
    expect(durationInMinutes('11:30', '13:00')).toBe(90)
    expect(durationInMinutes('14:00', '14:30')).toBe(30)
  })

  it('gère le passage de minuit', () => {
    // 22:00 → 01:00 : la soustraction naïve donnerait −1260.
    expect(durationInMinutes('22:00', '01:00')).toBe(180)
    expect(durationInMinutes('23:30', '00:30')).toBe(60)
    expect(durationInMinutes('23:59', '00:01')).toBe(2)
  })

  it('rejette une durée nulle, qui signale une saisie erronée', () => {
    expect(durationInMinutes('08:00', '08:00')).toBeNull()
  })

  it('rejette une heure invalide', () => {
    expect(durationInMinutes('08:00', '25:00')).toBeNull()
    expect(durationInMinutes('hier', '10:00')).toBeNull()
    expect(durationInMinutes(null, '10:00')).toBeNull()
    expect(durationInMinutes('08:00', undefined)).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formate moins d\'une heure en minutes', () => {
    expect(formatDuration(30)).toBe('30 min')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('formate les heures pleines avec les minutes à zéro', () => {
    // Le « 00 » n'est pas cosmétique : sans lui, les colonnes de durées ne
    // s'alignent plus verticalement dans une journée.
    expect(formatDuration(120)).toBe('2 h 00')
    expect(formatDuration(180)).toBe('3 h 00')
  })

  it('formate les heures incomplètes', () => {
    expect(formatDuration(90)).toBe('1 h 30')
    expect(formatDuration(510)).toBe('8 h 30')
  })

  it('formate zéro', () => {
    expect(formatDuration(0)).toBe('0 min')
  })

  it('affiche un tiret pour une valeur inexploitable', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-30)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('durationProportion', () => {
  it('calcule un pourcentage de la référence', () => {
    expect(durationProportion(60, 240)).toBe(25)
    expect(durationProportion(120, 240)).toBe(50)
    expect(durationProportion(30, 240)).toBe(13)
  })

  it('borne à 100 % un créneau plus long que la référence', () => {
    // La barre doit remplir sans déborder de la carte.
    expect(durationProportion(600, 240)).toBe(100)
  })

  it('renvoie 0 sur une entrée inexploitable', () => {
    expect(durationProportion(0, 240)).toBe(0)
    expect(durationProportion(null, 240)).toBe(0)
    expect(durationProportion(120, 0)).toBe(0)
    expect(durationProportion(120, -10)).toBe(0)
  })
})

describe('addMinutesToTime', () => {
  it('avance dans la journée', () => {
    expect(addMinutesToTime('08:00', 90)).toBe('09:30')
    expect(addMinutesToTime('08:00', 0)).toBe('08:00')
  })

  it('passe minuit et revient au début de journée', () => {
    expect(addMinutesToTime('23:30', 60)).toBe('00:30')
    expect(addMinutesToTime('22:00', 180)).toBe('01:00')
  })

  it('remainder cohérente avec durationInMinutes', () => {
    // Aller-retour : la fin calculée doit redonner la durée de départ.
    const start = '22:00'
    const duration = 180
    const end = addMinutesToTime(start, duration)
    expect(end).not.toBeNull()
    expect(durationInMinutes(start, end)).toBe(duration)
  })

  it('rejette une heure de départ invalide', () => {
    expect(addMinutesToTime('25:00', 30)).toBeNull()
    expect(addMinutesToTime('abc', 30)).toBeNull()
  })
})
