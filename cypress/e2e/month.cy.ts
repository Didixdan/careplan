import { cleanup, today, weekStart } from '../support/e2e'

/**
 * Récapitulatif du mois et exports : les chiffres, et ce que chaque rôle a le droit d'en faire.
 */
describe('Mois : récapitulatif et exports', () => {
  const created: string[] = []
  cleanup(created)

  it('montre les trois chiffres de la synthèse, « à vérifier » séparé', () => {
    cy.signIn('admin')
    cy.visit('/month')

    cy.get('.synthese__libelle').then(($labels) => {
      const labels = [...$labels].map(label => label.textContent?.trim())

      expect(labels).to.include('à déclarer')
      expect(labels).to.include('à vérifier')
    })
  })

  it('propose l’export CESU à l’administrateur, et à lui seul', () => {
    cy.signIn('admin')
    cy.visit('/month')
    cy.get('a[href*="/api/exports/cesu?month="]').should('exist')

    cy.signIn('viewer')
    cy.visit('/month')
    cy.get('a[href*="/api/exports/cesu?month="]').should('not.exist')
  })

  it('prépare un message par famille, prêt à copier', () => {
    cy.signIn('admin')
    cy.visit(`/week?week=${weekStart(today())}`)

    const blocks = () => cy.get('.export__texte')
    blocks().should('have.length.at.least', 1)
    cy.contains('button', 'Copier pour').should('exist')

    // Le message dit ce qu'il doit dire : une semaine, un total d'heures.
    blocks().first().invoke('text').should('match', /Planning de la semaine/)
    blocks().first().invoke('text').should('match', /Total de la semaine/)
  })

  it('copie réellement le message dans le presse-papiers', () => {
    cy.signIn('admin')

    // Le presse-papiers d'un navigateur n'existe pas toujours en test : on le remplace.
    cy.visit(`/week?week=${weekStart(today())}`)
    cy.window().then((window) => {
      const writeText = cy.stub().as('clipboard').resolves()
      Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
    })

    // Le message est replié dans un dépliant : on l'ouvre comme le ferait la personne avant
    // de cliquer — le bouton n'existe à l'écran qu'une fois le dépliant ouvert.
    cy.get('.export__resume').should('have.length.at.least', 1)
    cy.get('.export__resume').first().click()
    cy.contains('button', 'Copier pour').first().click()

    cy.get('@clipboard').should('have.been.calledOnce')
    cy.get('@clipboard').should('have.been.calledWithMatch', /Planning de la semaine/)
    cy.contains('button', 'Copié').should('be.visible')
  })

  it('ne propose aucun export à la famille', () => {
    cy.signIn('viewer')
    cy.visit(`/week?week=${weekStart(today())}`)

    cy.contains('Exporter la semaine').should('not.exist')
    cy.get('.export__texte').should('not.exist')
    cy.get('a[href*="/api/exports/week"]').should('not.exist')
  })
})
