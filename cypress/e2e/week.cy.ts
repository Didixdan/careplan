import { cleanup, today, weekStart } from '../support/e2e'

/**
 * Vue semaine : sept colonnes, et le parcours au clavier — ce qu'un écran tactile ne montre pas.
 */
describe('Vue semaine', () => {
  const created: string[] = []
  cleanup(created)

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('affiche sept colonnes, quel que soit le mois', () => {
    cy.visit(`/week?week=${weekStart(today())}`)
    cy.get('.semaine__colonne').should('have.length', 7)
  })

  it('ouvre la modale au clavier, sur Entrée', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), title: 'Vérif clavier',
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit(`/week?week=${weekStart(today())}`)
        cy.contains('.creneau-horaire', 'Vérif clavier').focus()
        cy.focused().trigger('keydown', { key: 'Enter' })

        cy.get('[role="dialog"]').should('be.visible')
        cy.get('#appointment-title').should('have.value', 'Vérif clavier')
      })
    })
  })

  it('ouvre la modale au clavier, sur Espace', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), title: 'Vérif espace',
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit(`/week?week=${weekStart(today())}`)
        cy.contains('.creneau-horaire', 'Vérif espace').focus()
        cy.focused().trigger('keydown', { key: ' ' })

        cy.get('[role="dialog"]').should('be.visible')
      })
    })
  })
})
