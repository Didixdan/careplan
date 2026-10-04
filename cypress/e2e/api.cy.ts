import { cleanup, freeDate, today } from '../support/e2e'

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
