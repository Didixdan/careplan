import { describe, expect, it } from 'vitest'
import { assistantFixtures, beneficiaryFixtures, buildAppointments, buildTags } from '~~/server/db/fixtures'
import { durationInMinutes } from '~/utils/duration'
import { checkTagNames, tagKey } from '~/utils/tags'

/**
 * Données de référence (fixtures).
 *
 * Elles ne sont pas du code jetable : les vues sont construites POUR elles, et
 * elles portent volontairement les cas qui cassent une vue mal conçue (passage de
 * minuit, journée vide, chevauchements, co-assistant). Si un de ces cas disparaît, une
 * vue peut se remettre à mal se comporter sans que rien ne le signale.
 */
describe('buildAppointments', () => {
  const appointments = buildAppointments('2025-03-14')
  const assistantBySlug = new Map(assistantFixtures.map(a => [a.slug, a]))
  const beneficiaryBySlug = new Map(beneficiaryFixtures.map(b => [b.slug, b]))

  it('produit des créneaux', () => {
    expect(appointments.length).toBeGreaterThan(0)
  })

  it('attribue à chaque créneau une date de la semaine demandée', () => {
    const dates = new Set(appointments.map(c => c.date))
    // La semaine du 14 mars 2025 va du lundi 10 au dimanche 16.
    for (const date of dates) {
      expect(date >= '2025-03-10' && date <= '2025-03-16').toBe(true)
    }
  })

  it('donne un identifiant unique à chaque créneau', () => {
    // Deux créneaux de même identifiant feraient un rendu de liste instable.
    const ids = appointments.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('référence des aidants et bénéficiaires valides', () => {
    for (const c of appointments) {
      expect(assistantBySlug.has(c.primaryAssistantSlug)).toBe(true)
      expect(beneficiaryBySlug.has(c.beneficiarySlug)).toBe(true)
      for (const slug of c.coAssistantSlugs) {
        expect(assistantBySlug.has(slug)).toBe(true)
      }
    }
  })

  it('couvre les quatre statuts, pour que les badges soient tous visibles', () => {
    const statuses = new Set(appointments.map(c => c.status))
    expect(statuses).toEqual(new Set(['planned', 'completed', 'to_validate', 'cancelled']))
  })

  it('contient au moins un créneau avec un co-assistant', () => {
    expect(appointments.some(c => c.coAssistantSlugs.length > 0)).toBe(true)
  })

  it('n\'utilise que des couleurs d\'aidant valides', () => {
    for (const assistant of assistantFixtures) {
      expect(assistant.color).toMatch(/^assistant-[1-8]$/)
    }
  })

  it('contient un créneau qui passe minuit', () => {
    // Sans ce cas, une régression sur `durationInMinutes` passerait inaperçue dans les vues.
    const nocturne = appointments.filter(c => (durationInMinutes(c.start, c.end) ?? 0) > 0 && c.start > c.end)
    expect(nocturne.length).toBeGreaterThan(0)
  })

  it('donne une durée exploitable à chaque créneau', () => {
    for (const c of appointments) {
      const duration = durationInMinutes(c.start, c.end)
      expect(duration).not.toBeNull()
      expect(duration).toBeGreaterThan(0)
    }
  })

  it('laisse une journée entièrement vide, pour que la colonne vide soit testée', () => {
    const byDate = new Map<string, number>()
    for (const c of appointments) {
      byDate.set(c.date, (byDate.get(c.date) ?? 0) + 1)
    }
    const days = ['2025-03-10', '2025-03-11', '2025-03-12', '2025-03-13', '2025-03-14', '2025-03-15', '2025-03-16']
    const vides = days.filter(day => !byDate.has(day))
    expect(vides).toHaveLength(1)
  })

  it('contient des créneaux qui se chevauchent sur une même journée', () => {
    // Cas qui révèle une vue incapable de gérer deux créneaux simultanés.
    const byDate = new Map<string, typeof appointments>()
    for (const c of appointments) {
      byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])
    }
    const chevauchement = [...byDate.values()].some((day) => {
      const sorted = [...day].sort((a, b) => a.start.localeCompare(b.start))
      return sorted.some((appointment, index) => {
        const next = sorted[index + 1]
        return next !== undefined && next.start < appointment.end
      })
    })
    expect(chevauchement).toBe(true)
  })

  it('est déterministe : deux appels donnent le même résultat', () => {
    expect(buildAppointments('2025-03-14')).toEqual(buildAppointments('2025-03-14'))
  })

  it('donne au moins un tag à chaque créneau', () => {
    // L'application refuse d'enregistrer un créneau sans tag : le jeu de données ne peut pas
    // contenir un cas qu'aucune saisie ne produirait.
    for (const c of appointments) {
      expect(checkTagNames(c.tags), `créneau ${c.id}`).toBeNull()
    }
  })

  it('contient un créneau à plus de trois tags, pour que le « +N » soit visible', () => {
    // La carte n'en montre que trois : sans ce cas, la règle ne serait exercée nulle part.
    expect(appointments.some(c => c.tags.length > 3)).toBe(true)
  })
})

describe('buildTags', () => {
  const catalogue = buildTags()
  const appointments = buildAppointments('2025-03-14')

  it('contient exactement les tags des créneaux', () => {
    const used = new Set(appointments.flatMap(c => c.tags))
    expect(new Set(catalogue)).toEqual(used)
  })

  it('dédoublonne par clé, comme l’application', () => {
    // Deux graphies d'une même clé ne doivent pas produire deux lignes au catalogue.
    expect(new Set(catalogue.map(tagKey)).size).toBe(catalogue.length)
  })

  it('est trié par nom, accents compris', () => {
    const sorted = [...catalogue].sort((a, b) => a.localeCompare(b, 'fr'))
    expect(catalogue).toEqual(sorted)
  })
})
