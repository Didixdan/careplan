import { cleanup, today } from '../support/e2e'

/**
 * Kilomètres déclarés du jour : la saisie, et ce qu'elle devient.
 *
 * Le scénario crée son propre passage — la vue jour affiche toujours aujourd'hui, et
 * aujourd'hui peut être le jour vide du seed — puis mesure AVANT et APRÈS : le seed pose déjà
 * des kilomètres, donc une valeur absolue serait fausse dès qu'on change de mois.
 */
describe('Kilomètres du jour', () => {
  const created: string[] = []
  cleanup(created)

  /** Les kilomètres du mois pour un aidant, tels que le récapitulatif les compte. */
  function monthlyFor(assistantId: string): Cypress.Chainable<number> {
    return cy.request(`/api/appointments/summary?month=${today().slice(0, 7)}`)
      .its('body.byAssistant')
      .then((lines: { id: string, travelKilometers?: number }[]) => {
        return cy.wrap(lines.find(line => line.id === assistantId)?.travelKilometers ?? 0)
      })
  }

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('saisit les kilomètres du jour et les retrouve dans le récapitulatif', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      const mine = assistants[0]!

      cy.createFreeAppointment({
        date: today(),
        title: 'Vérif kilomètres',
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: mine.id,
      }).then(({ id }) => {
        created.push(id)

        monthlyFor(mine.id).then((before) => {
          cy.visit('/')

          // La ligne n'apparaît que pour les aidants du jour, et le champ est le sien.
          cy.contains('Kilomètres').should('be.visible')
          cy.get(`#mileage-${mine.id}`).clear().type('12,5{enter}')

          // Le relevé est enregistré côté serveur…
          cy.request(`/api/mileage?date=${today()}`).its('body').should((entries) => {
            const rows = entries as { assistantId: string, kilometers: number }[]
            expect(rows.find(row => row.assistantId === mine.id)?.kilometers).to.equal(12.5)
          })

          // …et le récapitulatif du mois l'a pris en compte, exactement une fois.
          monthlyFor(mine.id).should('equal', before + 12.5)
        })
      })
    })
  })

  it('affiche les kilomètres sur la ligne de l\'aidant dans le récapitulatif', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      const mine = assistants[0]!

      cy.createFreeAppointment({
        date: today(),
        title: 'Vérif kilomètres',
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: mine.id,
      }).then(({ id }) => {
        created.push(id)

        cy.request({ method: 'PUT', url: `/api/mileage/${today()}`, body: { assistantId: mine.id, kilometers: 7.5 } })
        cy.visit('/month')

        // La ligne de l'aidant : son nom, ses chiffres, et son contexte (les kilomètres y sont).
        cy.contains('.recap__ligne', mine.name).should('contain', '7,5 km')
      })
    })
  })

  it('efface le relevé quand le champ est vidé', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      const mine = assistants[0]!

      cy.createFreeAppointment({
        date: today(),
        title: 'Vérif kilomètres',
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: mine.id,
      }).then(({ id }) => {
        created.push(id)

        cy.request({ method: 'PUT', url: `/api/mileage/${today()}`, body: { assistantId: mine.id, kilometers: 4 } })
        cy.visit('/')
        cy.get(`#mileage-${mine.id}`).clear().type('{enter}')

        cy.request(`/api/mileage?date=${today()}`).its('body').should((entries) => {
          const rows = entries as { assistantId: string }[]
          expect(rows.find(row => row.assistantId === mine.id)).to.equal(undefined)
        })
      })
    })
  })

  it('refuse la saisie à une famille, et la borne à 1000 km', () => {
    cy.signIn('viewer')
    cy.request({ url: `/api/mileage?date=${today()}`, failOnStatusCode: false })
      .its('status').should('equal', 403)

    cy.signIn('admin')
    cy.request('/api/appointments/options').then((options) => {
      const mine = options.body.assistants[0].id

      cy.request({
        method: 'PUT',
        url: `/api/mileage/${today()}`,
        body: { assistantId: mine, kilometers: 125000 },
        failOnStatusCode: false,
      }).its('status').should('equal', 400)

      cy.request({
        method: 'PUT',
        url: `/api/mileage/${today()}`,
        body: { assistantId: mine, kilometers: 12.567 },
      }).its('status').should('equal', 200)

      // Deux décimales, pas plus : la valeur est arrondie à l'écriture.
      cy.request(`/api/mileage?date=${today()}`).its('body').should((entries) => {
        const rows = entries as { assistantId: string, kilometers: number }[]
        expect(rows.find(row => row.assistantId === mine)?.kilometers).to.equal(12.57)
      })

      cy.request({ method: 'PUT', url: `/api/mileage/${today()}`, body: { assistantId: mine, kilometers: 0 } })
    })
  })
})
