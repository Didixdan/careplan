import { cleanup, cleanupTags, freeDate, revealCard, today } from '../support/e2e'

/**
 * Tags : le vocabulaire partagé qui remplace l'ancien intitulé libre.
 *
 * Ce que ce fichier vérifie et qu'aucun test de fonction ne peut voir : l'autocomplete
 * (suggestions, création à la volée), la règle « au moins un tag » à l'API, le dédoublonnage
 * par la casse, la propagation d'un renommage, et le refus de supprimer un tag utilisé.
 */
describe('Tags : API', () => {
  const created: string[] = []
  const createdTags: string[] = []
  cleanup(created)
  cleanupTags(createdTags)

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('refuse un créneau sans tag', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.request({
        method: 'POST',
        url: '/api/appointments',
        failOnStatusCode: false,
        body: {
          date: freeDate(40), start: '09:00', end: '10:00', tags: [], status: 'planned',
          beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
        },
      }).then((response) => {
        expect(response.status).to.equal(400)
        expect(JSON.stringify(response.body)).to.contain('tag')
      })
    })
  })

  /**
   * Le contrat du catalogue en une fois : unicité par clé, réutilisation par un créneau qui
   * envoie une autre graphie, et suppression réservée aux tags que personne ne porte.
   */
  it('dédoublonne par clé, réutilise l’existant et ne supprime qu’un tag libre', () => {
    createdTags.push('Vérif Casse', 'Vérif libre')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.request({ method: 'POST', url: '/api/tags', body: { name: 'Vérif Casse' } })
        .its('status').should('equal', 200)

      // Un doublon SAISI À LA MAIN est refusé : c'est une erreur qu'il vaut mieux voir.
      cy.request({
        method: 'POST', url: '/api/tags', body: { name: 'vérif casse' }, failOnStatusCode: false,
      }).its('status').should('equal', 409)

      // Un créneau qui envoie « vérif casse » adopte le tag EXISTANT, avec sa graphie : c'est
      // ce qui évite les doublons invisibles.
      cy.createFreeAppointment({
        date: freeDate(40), tags: ['vérif casse'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.request(`/api/appointments?date=${freeDate(40)}`).its('body').should((list) => {
          const rows = list as { id: string, tags: { name: string }[] }[]
          expect(rows.find(row => row.id === id)?.tags.map(tag => tag.name)).to.deep.equal(['Vérif Casse'])
        })

        // `then` et non `should` : un `should` peut rejouer son rappel, et une commande Cypress
        // n'a rien à y faire.
        cy.request('/api/tags').its('body').then((tags) => {
          const catalogue = tags as { id: string, name: string }[]
          expect(catalogue.filter(tag => tag.name.toLowerCase() === 'vérif casse'), 'un seul tag pour les deux graphies').to.have.length(1)

          // Un tag porté par un créneau ne se supprime pas : retirer les liens en silence
          // modifierait un passage que personne n'a demandé de toucher.
          const used = catalogue.find(tag => tag.name === 'Vérif Casse')
          cy.request({ method: 'DELETE', url: `/api/tags/${used!.id}`, failOnStatusCode: false })
            .then((response) => {
              expect(response.status).to.equal(409)
              expect(JSON.stringify(response.body)).to.contain('utilis')
            })
        })
      })

      // Un tag que personne ne porte, lui, disparaît sans rien changer d'autre.
      cy.request({ method: 'POST', url: '/api/tags', body: { name: 'Vérif libre' } })
        .its('body.id')
        .then((freeId) => {
          cy.request({ method: 'DELETE', url: `/api/tags/${freeId}` }).its('status').should('equal', 200)
        })
    })
  })

  it('réserve le catalogue ET l’écran de gestion à l’administrateur', () => {
    cy.signIn('assistant')

    // L'aidant LIT le catalogue : le formulaire en a besoin pour son autocomplete…
    cy.request('/api/tags').its('status').should('equal', 200)
    // …mais il ne réorganise pas le vocabulaire de tout le monde, et l'écran lui est fermé.
    cy.request({
      method: 'POST', url: '/api/tags', body: { name: 'Vérif interdit' }, failOnStatusCode: false,
    }).its('status').should('equal', 403)

    cy.visit('/tags')
    cy.location('pathname').should('not.equal', '/tags')
  })
})

describe('Tags : écran', () => {
  const created: string[] = []
  const createdTags: string[] = []
  cleanup(created)
  cleanupTags(createdTags)

  beforeEach(() => {
    cy.signIn('admin')
  })

  it('propose le catalogue et ajoute le tag choisi au clavier', () => {
    createdTags.push('Vérif suggestion')

    cy.request({ method: 'POST', url: '/api/tags', body: { name: 'Vérif suggestion' } })

    cy.visit('/day')
    cy.get('[aria-label="Nouveau créneau"]').click()
    cy.get('#appointment-beneficiary').select(1)

    // Le bouton reste fermé tant qu'aucun tag n'est choisi : l'écran n'annonce pas une action
    // que le serveur refusera.
    cy.contains('button', 'Enregistrer').should('be.disabled')

    // La liste est dans le flux : jamais rognée par le corps de la modale qui défile.
    cy.get('#appointment-tags').type('vérif sug')
    cy.get('.tags-field__option').should('contain', 'Vérif suggestion')

    // Flèche bas + Entrée : le parcours clavier retient la suggestion.
    cy.get('#appointment-tags').type('{downarrow}{enter}')
    cy.get('.tags-field__puce').should('contain', 'Vérif suggestion')
    cy.contains('button', 'Enregistrer').should('not.be.disabled')

    cy.get('#appointment-date').clear().type(freeDate(40))
    cy.get('#appointment-start').clear().type('09:00')
    cy.get('#appointment-end').clear().type('10:00')
    cy.contains('button', 'Enregistrer').click()
    cy.get('[role="dialog"]').should('not.exist')

    cy.request(`/api/appointments?date=${freeDate(40)}`).its('body').then((list) => {
      const rows = list as { id: string, tags: { name: string }[] }[]
      const mine = rows.find(row => row.tags.some(tag => tag.name === 'Vérif suggestion'))
      expect(mine, 'créneau créé avec le tag suggéré').to.not.equal(undefined)
      created.push(mine!.id)
    })
  })

  it('ne montre que trois tags sur une carte, et compte les autres', () => {
    createdTags.push('Vérif 1', 'Vérif 2', 'Vérif 3', 'Vérif 4')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(),
        tags: ['Vérif 1', 'Vérif 2', 'Vérif 3', 'Vérif 4'],
        status: 'planned',
        beneficiaryId: beneficiaries[0].id,
        primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)

        cy.visit('/day')
        revealCard('Vérif 1')

        cy.contains('.creneau-horaire', 'Vérif 1').within(() => {
          // Trois pastilles de tags, plus la quatrième qui COMPTE le reste : « +1 ».
          cy.get('.tag-chip').should('have.length', 4)
          cy.get('.tag-chip--plus').should('contain', '+1')
        })
      })
    })
  })

  it('propage un renommage à tous les créneaux', () => {
    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: today(), tags: ['Vérif avant renommage'],
        status: 'planned', beneficiaryId: beneficiaries[0].id, primaryAssistantId: assistants[0].id,
      }).then(({ id }) => {
        created.push(id)
        // Le créneau pointe la LIGNE du tag : c'est son nom final qui restera à nettoyer.
        createdTags.push('Vérif après renommage')

        cy.visit('/tags')
        cy.contains('.card', 'Vérif avant renommage').within(() => {
          cy.contains('button', 'Renommer').click()
        })
        cy.get('#tag-name').clear().type('Vérif après renommage')
        cy.contains('button', 'Enregistrer').click()

        cy.contains('.card', 'Vérif après renommage').should('be.visible')

        cy.visit('/day')
        cy.contains('.creneau-horaire', 'Vérif après renommage').should('be.visible')
        cy.contains('Vérif avant renommage').should('not.exist')
      })
    })
  })

  it('crée un tag même quand la recherche renvoie des voisins', () => {
    // « Vérif » sera créé à l'enregistrement : il rejoint la liste à nettoyer.
    createdTags.push('Vérif alpha existant', 'Vérif beta existant', 'Vérif')

    // Deux tags dont le nom contient la frappe : la liste proposera des VOISINS, et il faut
    // quand même pouvoir créer le tag exact que l'on veut.
    cy.request({ method: 'POST', url: '/api/tags', body: { name: 'Vérif alpha existant' } })
    cy.request({ method: 'POST', url: '/api/tags', body: { name: 'Vérif beta existant' } })

    cy.visit('/day')
    cy.get('[aria-label="Nouveau créneau"]').click()
    cy.get('#appointment-beneficiary').select(1)

    cy.get('#appointment-tags').type('Vérif')
    cy.get('.tags-field__option').then(($options) => {
      // Deux suggestions… puis la création, EN DERNIER : « Entrée » ne doit jamais créer par
      // accident quand une suggestion existe.
      expect($options).to.have.length(3)
      expect($options.last()).to.contain('Créer « Vérif »')
    })

    // Descendre jusqu'à la création, puis valider.
    cy.get('#appointment-tags').type('{downarrow}{downarrow}{enter}')
    cy.get('.tags-field__puce').should('contain', 'Vérif')

    // Contre-épreuve : sur un nom qui correspond à une suggestion, « Entrée » CHOISIT le tag
    // existant au lieu d'en créer un approximatif (le serveur tranche, plus bas).
    cy.get('#appointment-tags').type('Vérif alpha')
    cy.get('.tags-field__option--creation').should('contain', 'Créer « Vérif alpha »')
    cy.get('#appointment-tags').type('{enter}')
    cy.get('.tags-field__puce').should('contain', 'Vérif alpha existant')

    cy.get('#appointment-date').clear().type(freeDate(40))
    cy.get('#appointment-start').clear().type('09:00')
    cy.get('#appointment-end').clear().type('10:00')
    cy.contains('button', 'Enregistrer').click()
    cy.get('[role="dialog"]').should('not.exist')

    cy.request(`/api/appointments?date=${freeDate(40)}`).its('body').then((list) => {
      const rows = list as { id: string, tags: { name: string }[] }[]
      const mine = rows.find(row => row.tags.some(tag => tag.name === 'Vérif'))
      expect(mine, 'créneau créé').to.not.equal(undefined)
      // Les deux tags, dans l'ordre d'ajout : le neuf « Vérif » ET l'existant choisi.
      expect(mine!.tags.map(tag => tag.name)).to.deep.equal(['Vérif', 'Vérif alpha existant'])
      created.push(mine!.id)
    })
  })
})
