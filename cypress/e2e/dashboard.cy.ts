import { cleanup, cleanupBeneficiaries, today } from '../support/e2e'

interface BeneficiaryRow {
  id: string
  color: string | null
}

/**
 * Tableau de bord : l'index de l'application, la semaine en un coup d'œil.
 *
 * Le scénario crée ses propres bénéficiaires et créneaux — la semaine du seed ne prouve rien sur
 * le calcul d'un revenu — puis les supprime. Les montants sont donc ceux qu'il a posés, jamais une
 * valeur du jeu de démonstration : un taux du seed changerait le total sans prévenir.
 */
describe('Tableau de bord', () => {
  const created: string[] = []
  const beneficiaries: string[] = []
  /** L'aidant dont le scénario des kilomètres a écrit un relevé, à effacer après lui. */
  let declaredFor = ''
  // Les créneaux partent AVANT les bénéficiaires : le serveur refuse (409) de supprimer un
  // bénéficiaire qui a encore des créneaux, et Mocha exécute les `afterEach` dans leur ordre
  // d'enregistrement.
  cleanup(created)
  cleanupBeneficiaries(beneficiaries)

  /**
   * Le relevé repart avec le scénario : le laisser fausserait le cumul du mois d'un autre test.
   * L'écriture à zéro EFFACE la ligne (`PUT /api/mileage/:date`), c'est la règle du domaine.
   */
  afterEach(() => {
    if (!declaredFor) return

    const assistantId = declaredFor
    declaredFor = ''
    cy.request({ method: 'PUT', url: `/api/mileage/${today()}`, body: { assistantId, kilometers: 0 } })
  })

  /** Un bénéficiaire créé par l'API d'administration : un taux connu, une couleur connue. */
  function createBeneficiary(
    firstName: string,
    hourlyRateCents: number | null,
  ): Cypress.Chainable<BeneficiaryRow> {
    return cy
      .request({
        method: 'POST',
        url: '/api/beneficiaries',
        body: {
          firstName,
          lastName: 'Tableau',
          address: null,
          hourlyRateCents,
          authorizedMinutesMonth: null,
          color: 'assistant-7',
        },
      })
      .its('body')
      .then((body: BeneficiaryRow) => {
        beneficiaries.push(body.id)
        return cy.wrap(body)
      })
  }

  it('est l’index : « Tableau de bord » en tête du menu, et « CarePlan » y ramène', () => {
    cy.signIn('admin')
    // Le premier bouton du menu, c'est celui de la barre BASSE (téléphone) : en desktop, la
    // navigation passe par la colonne latérale, qui n'a pas d'ordre de prio.
    cy.viewport(360, 740)
    cy.visit('/day')

    // Depuis n'importe quel écran, le premier bouton du menu est le tableau de bord.
    cy.get('.app-bottom-nav__item').first().should('contain', 'Tableau de bord')

    // Le logotype est un lien, dans l'en-tête comme dans la colonne.
    cy.get('.app-header__title').should('have.attr', 'href', '/')
    cy.get('.app-sidebar__brand').should('have.attr', 'href', '/')

    cy.get('.app-header__title').click()
    cy.location('pathname').should('equal', '/')
    cy.get('.app-bottom-nav').find('[aria-current="page"]').should('contain', 'Tableau de bord')

    // « Jour » mène bien à la vue jour, qui reste dans le menu.
    cy.get('.app-bottom-nav').contains('Jour').click()
    cy.location('pathname').should('equal', '/day')
    cy.get('.app-bottom-nav').find('[aria-current="page"]').should('contain', 'Jour')
  })

  it('récapitule les sept jours et affiche le calcul du revenu', () => {
    cy.signIn('admin')

    createBeneficiary('Zoé Calcul', 1200).then((beneficiary) => {
      cy.referenceLists().then(({ assistants }) => {
        cy.createFreeAppointment({
          date: today(),
          tags: ['Courses'],
          status: 'planned',
          beneficiaryId: beneficiary.id,
          primaryAssistantId: assistants[0]!.id,
        }, 1).then(({ id, start, end }) => {
          created.push(id)

          cy.visit('/')

          // Un bloc par jour, y compris les jours sans passage (« Aucun passage »).
          cy.get('.tableau__jour').should('have.length', 7)

          // La ligne du créneau : les heures, puis le nom du bénéficiaire avec sa couleur.
          cy.contains('.tableau__creneau', 'Zoé Calcul').within(() => {
            cy.get('.tableau__heures').should('contain', start).and('contain', end)
            cy.get('.tableau__rail')
              .should('have.attr', 'style')
              .and('contain', 'var(--color-assistant-7)')
          })

          // Le calcul est AFFICHÉ en toutes lettres, et le montant le suit : 1 h à 12,00 €/h.
          cy.contains('.tableau__revenu', 'Zoé Calcul').within(() => {
            cy.get('.tableau__calcul').should('contain', '1,00 h').and('contain', '12,00 €/h')
            cy.get('.tableau__montant').should('contain', '12,00 €')
          })

          cy.contains('.tableau__total-libelle', 'Total par semaine').should('be.visible')
        })
      })
    })
  })

  it('écrit « À saisir » plutôt que de présenter un total partiel', () => {
    cy.signIn('admin')

    createBeneficiary('Lucie Sans Taux', null).then((beneficiary) => {
      cy.referenceLists().then(({ assistants }) => {
        cy.createFreeAppointment({
          date: today(),
          tags: ['Courses'],
          status: 'planned',
          beneficiaryId: beneficiary.id,
          primaryAssistantId: assistants[0]!.id,
        }, 1).then(({ id }) => {
          created.push(id)

          cy.visit('/')

          cy.contains('.tableau__revenu', 'Lucie Sans Taux').within(() => {
            cy.get('.tableau__calcul').should('contain', 'taux à saisir')
            cy.get('.tableau__montant').should('contain', 'À saisir')
          })

          // Le total de la semaine aussi : un chiffre amputé finirait sur une déclaration.
          cy.contains('.tableau__total-libelle', 'Total par semaine')
            .parent()
            .should('contain', 'À saisir')
        })
      })
    })
  })

  it('cumule les kilomètres déclarés dans la semaine', () => {
    cy.signIn('admin')

    cy.referenceLists().then(({ assistants }) => {
      const mine = assistants[0]!

      cy.request({ method: 'PUT', url: `/api/mileage/${today()}`, body: { assistantId: mine.id, kilometers: 12.5 } })
      declaredFor = mine.id

      cy.visit('/')
      cy.contains('.tableau__km', mine.name).should('contain', '12,5 km')
    })
  })

  it('montre « Mes revenus prévus » à un aidant, pour lui seul', () => {
    cy.signIn('assistant')

    // Un aidant ne reçoit, dans ses listes de référence, que son propre profil.
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(),
        tags: ['Courses'],
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: assistants[0]!.id,
      }, 1).then(({ id }) => {
        created.push(id)

        cy.visit('/')

        cy.contains('.eyebrow', 'Mes revenus prévus').should('be.visible')
        // Un seul groupe : ses bénéficiaires, jamais ceux d'un collègue.
        cy.get('.tableau__groupe').should('have.length', 1)
      })
    })
  })

  it('ne montre ni revenus ni kilomètres à une famille', () => {
    cy.signIn('viewer')
    cy.visit('/')

    // Le taux n'est pas communiqué à ce rôle : le DTO tranche, et l'écran masque le bloc au lieu
    // d'écrire « À saisir » là où aucun montant n'a le droit d'être montré.
    cy.get('.tableau__revenu').should('not.exist')
    cy.get('.tableau__total').should('not.exist')
    cy.get('.tableau__km').should('not.exist')

    // La semaine, elle, reste lisible.
    cy.get('.tableau__jour').should('have.length', 7)
  })

  it('change de semaine avec les flèches, et revient à la semaine en cours', () => {
    cy.signIn('admin')
    cy.visit('/')

    cy.get('.recap__titre').parent().invoke('text').then((label) => {
      cy.get('[aria-label="Semaine précédente"]').click()
      cy.get('.recap__titre').parent().invoke('text').should('not.equal', label)

      cy.contains('button', 'Cette semaine').click()
      cy.get('.recap__titre').parent().invoke('text').should('equal', label)
    })
  })
})
