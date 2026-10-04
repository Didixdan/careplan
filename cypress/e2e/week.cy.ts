import { cleanup, freeDate, today, weekStart } from '../support/e2e'

/**
 * Vue semaine : sept blocs de jour empilés (1, 2 puis 3 par ligne), chacun borné et défilant,
 * et le parcours au clavier — ce qu'un écran tactile ne montre pas.
 */
describe('Vue semaine', () => {
  const created: string[] = []
  cleanup(created)

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('affiche sept blocs de jour, quel que soit le mois', () => {
    cy.visit(`/week?week=${weekStart(today())}`)
    cy.get('.semaine__colonne').should('have.length', 7)
  })

  it('ne défile plus en horizontal', () => {
    cy.visit(`/week?week=${weekStart(today())}`)

    cy.get('.semaine__grille').then(($grille) => {
      const grille = $grille[0] as HTMLElement
      // Un pixel de tolérance : les navigateurs arrondissent les largeurs fractionnaires.
      expect(grille.scrollWidth).to.be.at.most(grille.clientWidth + 1)
    })
  })

  it('borne le cadre d’un jour, qui défile pour lui-même', () => {
    const date = freeDate()

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date, tags: ['Vérif cadre'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit(`/week?week=${weekStart(date)}`)

        const day = () => cy.contains('.semaine__colonne', 'Vérif cadre')

        day().find('.semaine__corps').then(($corps) => {
          const corps = $corps[0] as HTMLElement
          // Borné (quatre heures) ET avec de quoi défiler : la grille fait 1440 px. Sans la
          // borne, la page ferait 10 000 px ; sans contenu, le cadre capterait le geste.
          expect(corps.scrollHeight).to.be.greaterThan(corps.clientHeight)
        })

        // Le passage est dans le cadre, et l'en-tête du jour reste visible au-dessus.
        cy.contains('.creneau-horaire', 'Vérif cadre').should('be.visible')
        day().find('.semaine__entete').should('be.visible')
      })
    })
  })

  it('n’affiche pas de cadre défilant sur un jour vide', () => {
    // Loin de tout : ni le seed (semaine courante) ni les scénarios qui créent leurs propres
    // créneaux (`freeDate`, à trois semaines) n'écrivent ici.
    cy.visit(`/week?week=${freeDate(400)}`)

    cy.get('.semaine__colonne').should('have.length', 7)
    // Un cadre borné sans contenu capterait le geste du doigt pour rien (docs/pieges.md §13).
    cy.get('.semaine__vide').should('have.length', 7)
    cy.get('.semaine__corps').should('not.exist')
  })

  it('ouvre la modale au clavier, sur Entrée', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), tags: ['Vérif clavier'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit(`/week?week=${weekStart(today())}`)
        cy.contains('.creneau-horaire', 'Vérif clavier').focus()
        cy.focused().trigger('keydown', { key: 'Enter' })

        cy.get('[role="dialog"]').should('be.visible')
        // Le formulaire s'ouvre avec les tags du créneau, en pastilles.
        cy.get('.tags-field__puce').should('contain', 'Vérif clavier')
      })
    })
  })

  it('ouvre la modale au clavier, sur Espace', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), tags: ['Vérif espace'],
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
