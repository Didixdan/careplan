import { ACCOUNTS } from '../support/e2e'

/**
 * Connexion et rôles : le premier mur de l'application.
 */
describe('Connexion', () => {
  it('ramène un visiteur sans session vers /login', () => {
    cy.visit('/')
    cy.location('pathname').should('equal', '/login')
  })

  it('refuse un mot de passe faux, sans dire lequel est faux', () => {
    cy.visit('/login')
    cy.get('#email').type(ACCOUNTS.admin)
    cy.get('#password').type('mauvais-mot-de-passe')
    cy.contains('button', 'Se connecter').click()

    cy.contains('Identifiants invalides.').should('be.visible')
    cy.location('pathname').should('equal', '/login')
  })

  it('ouvre le planning à l’administrateur, avec ses écrans de gestion', () => {
    cy.signIn('admin')
    cy.visit('/')
    cy.contains('a', 'Bénéficiaires').should('exist')
    cy.contains('a', 'Aidants').should('exist')
  })

  it('n’expose pas les écrans de gestion à un aidant', () => {
    cy.signIn('assistant')
    cy.visit('/')
    cy.contains('a', 'Bénéficiaires').should('not.exist')

    cy.visit('/assistants')
    cy.location('pathname').should('not.equal', '/assistants')
  })

  it('déconnecte et ramène à la connexion', () => {
    cy.signIn('admin')
    cy.visit('/')
    cy.get('[aria-label="Se déconnecter"]').click()
    cy.location('pathname').should('equal', '/login')
  })
})
