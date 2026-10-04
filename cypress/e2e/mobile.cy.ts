/**
 * Écran étroit : c'est là que la barre de navigation basse doit rester utilisable, et que rien
 * ne doit déborder horizontalement. Le seul endroit où 360 px sont réellement mesurés.
 */
describe('Mobile (360 × 740)', () => {
  beforeEach(() => {
    cy.viewport(360, 740)
    cy.signIn('admin')
  })

  it('garde la navigation basse complète et atteignable', () => {
    cy.visit('/')

    cy.get('.app-bottom-nav').should('be.visible')
    // Jour, Semaine, Mois, Aidants, Bénéficiaires, Tags — les six entrées de l'admin.
    cy.get('.app-bottom-nav__item').should('have.length', 6)
    // La colonne latérale laisse la place : les deux navigations ne cohabitent pas.
    cy.get('.app-sidebar').should('not.be.visible')

    cy.get('.app-bottom-nav').contains('Mois').click()
    cy.location('pathname').should('equal', '/month')

    cy.get('.app-bottom-nav').contains('Semaine').click()
    cy.location('pathname').should('equal', '/week')

    cy.get('.app-bottom-nav').contains('Jour').click()
    cy.location('pathname').should('equal', '/')
  })

  it('ne déborde pas horizontalement', () => {
    for (const path of ['/', '/month', '/week']) {
      cy.visit(path)
      cy.document().then((document) => {
        // Une tolérance d'un pixel : les navigateurs arrondissent les largeurs fractionnaires.
        expect(document.documentElement.scrollWidth).to.be.at.most(361)
      })
    }
  })
})
