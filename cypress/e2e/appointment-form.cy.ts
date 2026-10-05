import { cleanup, freeDate, revealCard } from '../support/e2e'

/**
 * Création, édition et suppression par la modale : le parcours complet d'un créneau, tel qu'on
 * le fait au doigt.
 */
describe('Créneau : créer, modifier, supprimer', () => {
  const created: string[] = []
  cleanup(created)

  const DAY = freeDate(21)

  beforeEach(() => {
    cy.signIn('admin')
    // La suppression demande confirmation : on répond oui, le test ne porte pas là-dessus.
    cy.on('window:confirm', () => true)
  })

  it('crée un créneau depuis la modale', () => {
    // C'est la MODALE qui crée : elle a donc besoin d'une plage libre avant de l'envoyer. On
    // demande au serveur de valider une plage, on relâche la place, et on la lui redonne.
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.findFreeSlot({
        date: DAY, tags: ['Sonde plage libre'], status: 'planned',
        beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }, 2).then(({ start, end }) => {
        cy.visit('/day')
        cy.get('[aria-label="Nouveau créneau"]').click()
        cy.get('[role="dialog"]').should('be.visible')

        cy.get('#appointment-beneficiary').select(1)
        cy.get('#appointment-date').clear().type(DAY)
        cy.get('#appointment-start').clear().type(start)
        cy.get('#appointment-end').clear().type(end)
        // Un tag INCONNU du catalogue : il est créé à l'enregistrement, c'est le parcours
        // de l'autocomplete. `{enter}` prend le texte tapé faute de suggestion.
        cy.get('#appointment-tags').type('Vérif création{enter}')
        cy.get('.tags-field__puce').should('contain', 'Vérif création')
        cy.contains('button', 'Enregistrer').click()

        cy.get('[role="dialog"]').should('not.exist')
        // La semaine visée contient le créneau : la vue semaine le montre.
        cy.visit(`/week?week=${DAY}`)
        cy.contains('Vérif création').should('be.visible')

        cy.request(`/api/appointments?date=${DAY}`).then((response) => {
          const [appointment] = response.body
          expect(appointment.tags.map((tag: { name: string }) => tag.name)).to.deep.equal(['Vérif création'])
          created.push(appointment.id)
        })
      })
    })
  })

  it('modifie un créneau existant', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: DAY, tags: ['Avant modification'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit(`/week?week=${DAY}`)
        revealCard('Avant modification')
        cy.contains('Avant modification').click()
        // Le formulaire s'ouvre avec le tag existant en pastille : on le retire (la pastille est
        // le bouton de retrait), puis on en saisit un autre.
        cy.get('[aria-label="Retirer « Avant modification »"]').click()
        cy.get('.tags-field__puce').should('not.exist')
        cy.get('#appointment-tags').type('Après modification{enter}')
        cy.contains('button', 'Enregistrer').click()
        cy.get('[role="dialog"]').should('not.exist')

        cy.contains('Après modification').should('be.visible')
        cy.contains('Avant modification').should('not.exist')
      })
    })
  })

  it('supprime un créneau après confirmation', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: DAY, tags: ['À supprimer'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        cy.visit(`/week?week=${DAY}`)
        revealCard('À supprimer')
        cy.contains('À supprimer').click()
        cy.contains('button', 'Supprimer').click()

        cy.get('[role="dialog"]').should('not.exist')
        cy.contains('À supprimer').should('not.exist')
        // CE créneau a disparu — et lui seul : la journée n'a aucune raison d'être vide, un
        // autre scénario peut y avoir laissé quelque chose.
        cy.request({ url: `/api/appointments?date=${DAY}`, failOnStatusCode: false })
          .its('body')
          .should((rows) => {
            const ids = (rows as { id: string }[]).map(row => row.id)
            expect(ids).to.not.include(id)
          })
        // L'écran vient de le supprimer — mais si le test s'arrête AVANT, ce nettoyage est le
        // seul qui reste : sans lui, le créneau survivrait à l'échec et bloquerait le jour pour
        // toutes les exécutions suivantes (`DELETE` sur un créneau absent ne gêne personne).
        created.push(id)
      })
    })
  })
})
