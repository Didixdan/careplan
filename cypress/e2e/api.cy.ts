import { cleanup, cleanupTags, freeDate, today, weekStart } from '../support/e2e'

/**
 * L'API depuis le navigateur : permissions, transitions de statut, et le contenu des exports.
 *
 * Ces vérifications passaient par des scripts Node : elles vivent ici, avec les mêmes
 * assertions, mais dans l'environnement réel — cookie de session compris.
 */
describe('API : permissions et statuts', () => {
  const created: string[] = []
  cleanup(created)

  it('refuse une lecture sans session', () => {
    cy.clearCookies()
    cy.request({ url: `/api/appointments?date=${today()}`, failOnStatusCode: false })
      .its('status').should('equal', 401)
  })

  it('refuse l’écriture à une famille, et ses exports', () => {
    cy.signIn('viewer')

    cy.request({
      method: 'POST',
      url: '/api/appointments',
      failOnStatusCode: false,
      body: { date: freeDate(), start: '09:00', end: '10:00', tags: ['Interdit'], status: 'planned', beneficiaryId: 'x', primaryAssistantId: 'y' },
    }).its('status').should('equal', 403)

    cy.request({ url: `/api/exports/cesu?month=${freeDate().slice(0, 7)}`, failOnStatusCode: false })
      .its('status').should('equal', 403)
    cy.request({ url: `/api/exports/week?week=${freeDate()}`, failOnStatusCode: false })
      .its('status').should('equal', 403)
  })

  it('ne montre à un aidant que ses propres créneaux, avec SES métriques', () => {
    cy.signIn('assistant')

    cy.request('/api/appointments/options').then((options) => {
      const me = options.body.assistants[0].name

      cy.request(`/api/appointments?month=${today().slice(0, 7)}`).then((response) => {
        for (const appointment of response.body as { primaryAssistant: string, coAssistants: string[] }[]) {
          const all = [appointment.primaryAssistant, ...appointment.coAssistants]
          expect(all).to.include(me)
        }
      })

      // Son récapitulatif porte les MÊMES métriques que celui de l'admin, sur son périmètre :
      // ses heures par bénéficiaire, le taux qui compose SON montant, et le volume restant de
      // la famille (heures de tous les aidants). Un créneau à lui rend le contrôle déterministe :
      // le mois interrogé contient forcément une de ses lignes.
      const date = freeDate()

      cy.createFreeAppointment({
        date, tags: ['Vérif métriques aidant'], status: 'planned',
        beneficiaryId: options.body.beneficiaries[0].id, primaryAssistantId: options.body.assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.request(`/api/appointments/summary?month=${date.slice(0, 7)}`).then((response) => {
          const lines = response.body.byBeneficiary as {
            id: string
            referenceMinutes: number | null
            referenceForecastMinutes?: number
            hourlyRateCents?: number | null
          }[]

          const line = lines.find(item => item.id === options.body.beneficiaries[0].id)

          expect(line, 'son bénéficiaire apparaît dans ses lignes').to.not.equal(undefined)
          expect(line!.referenceForecastMinutes, 'volume consommé, tous aidants').to.not.equal(undefined)
          expect(line!.hourlyRateCents, 'le taux de sa rémunération').to.not.equal(undefined)
        })
      })
    })
  })

  it('applique les actions rapides et refuse les états finaux', () => {
    cy.signIn('admin')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), tags: ['Vérif API statut'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id, start, end }) => {
        created.push(id)

        cy.request({ method: 'PATCH', url: `/api/appointments/${id}/status`, body: { status: 'completed' } })
          .its('status').should('equal', 200)
        cy.request(`/api/appointments?date=${today()}`).its('body')
          .should((list) => {
            const rows = list as { id: string, status: string }[]
            expect(rows.find(row => row.id === id)?.status).to.equal('completed')
          })

        // « Réalisé » est un état final : l'action rapide ne peut plus en sortir.
        cy.request({ method: 'PATCH', url: `/api/appointments/${id}/status`, body: { status: 'planned' }, failOnStatusCode: false })
          .its('status').should('equal', 409)

        // La modification complète, elle, reste la porte de sortie.
        cy.request({
          method: 'PATCH',
          url: `/api/appointments/${id}`,
          body: {
            date: today(), start, end, tags: ['Vérif API statut'],
            status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
          },
        }).its('status').should('equal', 200)

        cy.request({ method: 'PATCH', url: `/api/appointments/${id}/status`, body: { status: 'en_cours' }, failOnStatusCode: false })
          .its('status').should('equal', 400)
      })
    })
  })
})

describe('API : les exports', () => {
  const created: string[] = []
  const MONTH = freeDate(21).slice(0, 7)
  cleanup(created)

  it('sert un CSV cohérent avec les données', () => {
    cy.signIn('admin')
    cy.request('/api/beneficiaries').then((beneficiaries) => {
      const target = beneficiaries.body[0]

      cy.referenceLists().then(({ assistants }) => {
        // Deux heures : la durée est ce que vérifie l'export, pas l'heure de la journée.
        cy.createFreeAppointment({
          date: `${MONTH}-05`, tags: ['Vérif export'],
          status: 'completed', beneficiaryId: target.id, primaryAssistantId: assistants[0].id,
        }, 2).then(({ id }) => {
          created.push(id)

          cy.request(`/api/exports/cesu?month=${MONTH}`).then((response) => {
            expect(response.headers['content-type']).to.contain('text/csv')
            expect(response.headers['content-disposition']).to.contain(`CESU-${MONTH}.csv`)

            const csv = response.body as unknown as string
            const lines = csv.split('\r\n')

            expect(lines[0]).to.contain('Période;Aidant;Bénéficiaire')
            // La colonne des kilomètres ferme la ligne : elle suit les montants.
            expect(lines[0]?.endsWith(';Km')).to.equal(true)
            // Deux heures, écrites dans les deux formes : décimale pour un tableur, h:min pour le CESU.
            expect(csv).to.contain('2,00;2 h 00')
            // Le taux affiché est celui du bénéficiaire, tel que l'API le renvoie.
            const rate = target.hourlyRateCents
            expect(csv).to.contain(rate === null ? 'À saisir' : `${(rate / 100).toFixed(2).replace('.', ',')}`)
            // Le total de l'aidant est bien là, et il porte ses kilomètres (ici : aucun).
            expect(csv).to.contain('Total aidant')
            expect(csv).to.contain(';0,00')
          })
        })
      })
    })
  })

  it('sert la semaine avec ses statuts et son total', () => {
    cy.signIn('admin')
    const week = freeDate(21)

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: week, tags: ['Vérif semaine ; export', 'Vérif second tag'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }, 1.5).then(({ id }) => {
        created.push(id)

        cy.request(`/api/exports/week?week=${week}`).then((response) => {
          const csv = response.body as unknown as string

          expect(csv).to.contain('Semaine;Aidant(s);Date;Jour')
          // La colonne des tags remplace l'ancien intitulé, à la même place.
          expect(csv).to.contain(';Bénéficiaire;Tags;Statut')
          expect(csv).to.contain('1 h 30;1,50')
          expect(csv).to.contain('Planifié')
          // TOUS les tags du créneau, joints, et mis entre guillemets dès que l'un contient
          // un point-virgule.
          expect(csv).to.contain('"Vérif semaine ; export, Vérif second tag"')
          expect(csv).to.contain('Total semaine (hors annulés)')
        })
      })
    })
  })

  it('refuse une période mal formée', () => {
    cy.signIn('admin')
    cy.request({ url: '/api/exports/cesu?month=2027-13', failOnStatusCode: false }).its('status').should('equal', 400)
    cy.request({ url: '/api/exports/cesu', failOnStatusCode: false }).its('status').should('equal', 400)
    cy.request({ url: '/api/exports/week?week=2027-02-30', failOnStatusCode: false }).its('status').should('equal', 400)
  })

  it('raconte la même chose que la liste des créneaux', () => {
    cy.signIn('admin')
    const params = `month=${MONTH}`

    cy.request(`/api/appointments?${params}`).then((list) => {
      const minutes = (start: string, end: string) => {
        const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
        const raw = toMinutes(end) - toMinutes(start)
        return raw > 0 ? raw : raw + 1440
      }

      const declared = list.body
        .filter((a: { status: string }) => a.status === 'completed')
        .reduce((total: number, a: { start: string, end: string }) => total + minutes(a.start, a.end), 0)

      cy.request(`/api/appointments/summary?${params}`).then((summary) => {
        expect(summary.body.totals.declaredMinutes).to.equal(declared)
        expect(summary.body.totals.toValidateMinutes).to.be.at.least(0)
      })
    })
  })
})

/**
 * Copie d'une semaine : ce qui est refusé, et ce qui est écrit.
 *
 * La copie REMPLACE la semaine cible : elle porte donc sur des semaines que personne d'autre
 * n'utilise (8 et 9 semaines), jamais sur la semaine du seed ni sur la zone de `freeDate()`.
 */
describe('API : copie d\'une semaine', () => {
  const created: string[] = []
  // Les tags du scénario repartent avec lui : `tags.cy.ts` attend une liste de suggestions
  // COURTE, et un catalogue laissé sale lui ferait rater son compte (voir `cleanupTags`).
  const tagNames: string[] = []
  cleanup(created)
  cleanupTags(tagNames)

  const SOURCE = freeDate(56)
  const TARGET = freeDate(63)
  /** Une semaine que personne n'utilise : le refus d'une source vide se vérifie sur elle. */
  const EMPTY = freeDate(700)

  it('refuse la copie à une famille', () => {
    cy.signIn('viewer')

    cy.request({ url: `/api/appointments/copy?source=${SOURCE}&target=${TARGET}`, failOnStatusCode: false })
      .its('status').should('equal', 403)

    cy.request({
      method: 'POST',
      url: '/api/appointments/copy',
      failOnStatusCode: false,
      body: { source: SOURCE, target: TARGET, replace: true },
    }).its('status').should('equal', 403)
  })

  it('refuse une copie mal formée et une source vide', () => {
    cy.signIn('admin')

    // Date inexistante, et paramètre manquant : la réponse doit dire quoi corriger.
    cy.request({ url: `/api/appointments/copy?source=2027-02-30&target=${TARGET}`, failOnStatusCode: false })
      .its('status').should('equal', 400)
    cy.request({ url: `/api/appointments/copy?source=${SOURCE}`, failOnStatusCode: false })
      .its('status').should('equal', 400)

    // Copier une semaine sur elle-même n'est pas une copie : c'est une remise à « Planifié ».
    cy.request({ url: `/api/appointments/copy?source=${SOURCE}&target=${SOURCE}`, failOnStatusCode: false })
      .its('status').should('equal', 400)

    // Une source VIDE ne doit rien supprimer : c'est le cas qui viderait une semaine par
    // accident. On vérifie d'abord que la semaine est bien vide, sinon le 409 ne prouverait rien.
    //
    // L'APERÇU, lui, répond 200 et annonce 0 créneau : c'est ce que lit l'écran pour désactiver
    // son bouton. Refuser dès la lecture rendrait la modale muette au lieu de l'expliquer.
    cy.request(`/api/appointments?week=${EMPTY}`).its('body').should((rows) => {
      expect(rows).to.have.length(0)
    })
    cy.request(`/api/appointments/copy?source=${EMPTY}&target=${TARGET}`).then((preview) => {
      expect(preview.body.sourceCount).to.equal(0)
    })

    // Seule la COPIE refuse, et c'est ce refus qui garantit que la cible n'est jamais vidée.
    cy.request({
      method: 'POST',
      url: '/api/appointments/copy',
      failOnStatusCode: false,
      body: { source: EMPTY, target: TARGET },
    }).its('status').should('equal', 409)
  })

  it('n\'écrit rien sans confirmation, puis remplace la semaine cible', () => {
    cy.signIn('admin')
    tagNames.push('Vérif copie API origine', 'Vérif copie API occupation')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: SOURCE, tags: ['Vérif copie API origine'], status: 'planned',
        beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => created.push(id))

      cy.createFreeAppointment({
        date: TARGET, tags: ['Vérif copie API occupation'], status: 'planned',
        beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        // Sans `replace`, le serveur refuse : un écran périmé ne supprime rien tout seul.
        cy.request({
          method: 'POST',
          url: '/api/appointments/copy',
          failOnStatusCode: false,
          body: { source: SOURCE, target: TARGET },
        }).its('status').should('equal', 409)

        cy.request(`/api/appointments?week=${weekStart(TARGET)}`).its('body').should((rows) => {
          expect(rows, 'la cible est intacte').to.have.length(1)
          expect(rows[0].status).to.equal('planned')
        })

        cy.request({
          method: 'POST',
          url: '/api/appointments/copy',
          body: { source: SOURCE, target: TARGET, replace: true },
        }).then((response) => {
          expect(response.body).to.deep.equal({ copied: 1, deleted: 1 })
        })

        cy.request(`/api/appointments?week=${weekStart(TARGET)}`).its('body').then((rows) => {
          expect(rows.map((row: { status: string }) => row.status)).to.deep.equal(['planned'])
          for (const row of rows) created.push(row.id as string)
        })
      })
    })
  })

  it('ne copie, pour un aidant, que ses propres créneaux', () => {
    tagNames.push('Vérif copie aidant', 'Vérif copie collègue')

    // Son identifiant de profil se lit depuis SON compte : la route `options` ne lui montre
    // que lui-même.
    cy.signIn('assistant')
    cy.request('/api/appointments/options').then((options) => {
      const me = options.body.assistants[0]

      cy.signIn('admin')
      cy.referenceLists().then(({ beneficiaries, assistants }) => {
        const colleague = assistants.find(assistant => assistant.id !== me.id)!

        cy.createFreeAppointment({
          date: SOURCE, tags: ['Vérif copie aidant'], status: 'planned',
          beneficiaryId: beneficiaries[0].id, primaryAssistantId: me.id,
        }).then(({ id }) => created.push(id))

        cy.createFreeAppointment({
          date: SOURCE, tags: ['Vérif copie collègue'], status: 'planned',
          beneficiaryId: beneficiaries[0].id, primaryAssistantId: colleague.id,
        }).then(({ id }) => created.push(id))

        // L'aidant ne voit, dans l'aperçu, que le créneau dont il est l'aidant PRINCIPAL.
        cy.signIn('assistant')
        cy.request(`/api/appointments/copy?source=${SOURCE}&target=${TARGET}`).then((preview) => {
          expect(preview.body.sourceCount).to.equal(1)
          expect(preview.body.cancelled).to.deep.equal([])
        })

        cy.request({
          method: 'POST',
          url: '/api/appointments/copy',
          body: { source: SOURCE, target: TARGET },
        }).then((response) => {
          expect(response.body).to.deep.equal({ copied: 1, deleted: 0 })
        })

        // Relu par l'ADMIN : le créneau du collègue n'a pas été recopié.
        cy.signIn('admin')
        cy.request(`/api/appointments?week=${weekStart(TARGET)}`).its('body').then((rows) => {
          expect(rows).to.have.length(1)
          expect(rows[0].primaryAssistantId).to.equal(me.id)
          created.push(rows[0].id as string)
        })
      })
    })
  })
})
