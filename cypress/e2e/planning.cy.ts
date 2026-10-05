import { cleanup, today } from '../support/e2e'

/**
 * Les actions rapides et la modale, dans un vrai navigateur.
 *
 * C'est ici que se vérifient les trois choses qu'aucun test de fonction ne peut voir :
 * un double-tap n'enchaîne pas deux transitions, la modale se ferme sur Échap, et le focus
 * ne s'échappe pas pendant qu'elle est ouverte.
 */
describe('Vue jour : actions rapides et modale', () => {
  const created: string[] = []
  cleanup(created)

  /** Un créneau planifié AUJOURD'HUI, pour que la vue jour (qui affiche toujours aujourd'hui) le montre. */
  function planToday(tag: string) {
    return cy.referenceLists().then(({ beneficiaries, assistants }) => {
      return cy
        .createFreeAppointment({
          date: today(),
          tags: [tag],
          status: 'planned',
          beneficiaryId: beneficiaries[0].id,
          primaryAssistantId: assistants[0].id,
        })
        .then(({ id }) => {
          created.push(id)
          return cy.wrap(id)
        })
    })
  }

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('marque un passage réalisé sans ouvrir la modale', () => {
    planToday('Vérif action rapide')
    cy.visit('/day')

    const card = () => cy.contains('.creneau-horaire', 'Vérif action rapide')
    card().should('contain', 'Planifié')

    card().find('[aria-label="Marquer comme réalisé"]').click()

    // Aucune modale ne s'est ouverte, et le badge suit tout seul.
    cy.get('[role="dialog"]').should('not.exist')
    card().should('contain', 'Réalisé')
    // L'action disparaît : « Réalisé » est un état final, on n'y touche plus par action rapide.
    card().find('[aria-label="Marquer comme réalisé"]').should('not.exist')
    card().find('[aria-label="Annuler le créneau"]').should('not.exist')
  })

  it('ne peut pas enchaîner deux transitions du même doigt', () => {
    planToday('Vérif double appui')
    cy.visit('/day')

    const card = () => cy.contains('.creneau-horaire', 'Vérif double appui')
    card().find('[aria-label="Marquer comme réalisé"]').click()
    // Le second clic n'a plus de cible : la carte n'offre plus d'action rapide.
    card().find('[aria-label="Marquer comme réalisé"]').should('not.exist')
    card().should('contain', 'Réalisé')
  })

  it('ferme la modale sur Échap, en rendant le défilement à la page', () => {
    planToday('Vérif Échap')
    cy.visit('/day')

    cy.contains('.creneau-horaire', 'Vérif Échap').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.document().its('body.style.overflow').should('equal', 'hidden')

    cy.get('body').type('{esc}')

    cy.get('[role="dialog"]').should('not.exist')
    cy.document().its('body.style.overflow').should('not.equal', 'hidden')
  })

  it('garde le focus dans la modale, et le rend à la carte', () => {
    planToday('Vérif focus')
    cy.visit('/day')

    cy.contains('.creneau-horaire', 'Vérif focus').click()
    cy.get('[role="dialog"]').should('be.visible')

    // À l'ouverture, le focus va au premier CHAMP — pas à la croix de fermeture : on n'ouvre
    // pas un formulaire pour le refermer.
    cy.focused().should('have.id', 'appointment-beneficiary')

    // La boucle du piège à focus : sur le DERNIER élément, une tabulation revient au premier.
    // On déclenche l'événement comme le ferait le navigateur, faute de pouvoir simuler Tab.
    cy.get('[role="dialog"]')
      .find('button:not([disabled]), input:not([disabled]), select:not([disabled])')
      .last()
      .focus()
    cy.get('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    cy.focused().should('have.attr', 'aria-label', 'Fermer')

    // Et dans l'autre sens : Maj+Tab depuis le premier repart au dernier.
    cy.get('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true })
    cy.focused().should('not.have.attr', 'aria-label', 'Fermer')

    // Fermer rend le focus à ce qui l'avait ouvert — la carte, pas le vide.
    cy.get('body').type('{esc}')
    cy.get('[role="dialog"]').should('not.exist')
    cy.focused().should('contain', 'Vérif focus')
  })
})
