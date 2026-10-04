import { cleanup, cleanupTags, freeDate, shift, today, weekStart } from '../support/e2e'

interface WeekRow {
  id: string
  date: string
  start: string
  end: string
  status: string
  beneficiary: string
  tags: { name: string }[]
  coAssistantIds: string[]
}

/** Les créneaux d'une semaine, lus par l'API : la source de vérité, jamais l'écran. */
function readWeek(week: string): Cypress.Chainable<WeekRow[]> {
  return cy.request(`/api/appointments?week=${week}`).its('body')
}

/**
 * Copie complète d'une semaine sur une autre.
 *
 * Trois précautions, apprises des scénarios existants :
 * - **Jamais la semaine du seed, ni la zone des autres scénarios.** La copie REMPLACE la
 *   semaine cible : les semaines 8 et 9 sont choisies parce que personne n'y écrit.
 * - **Jamais de date figée** : tout est calculé depuis `today()`.
 * - **Jamais de données supposées** : ce que le test veut vérifier, il le crée, puis il le
 *   supprime — y compris ce que la copie a créé, dont il ne connaît pas les identifiants.
 */
describe('Copie d\'une semaine', () => {
  const created: string[] = []
  const tagNames: string[] = []
  cleanup(created)
  cleanupTags(tagNames)

  /** Semaine source et semaine cible du scénario : deux semaines lointaines et libres. */
  const SOURCE = freeDate(56)
  const TARGET = freeDate(63)
  const SOURCE_WEEK = weekStart(SOURCE)
  const TARGET_WEEK = weekStart(TARGET)

  /**
   * Rattache au nettoyage ce que la COPIE a créé. Elle ne rend pas les identifiants : on relit
   * la semaine cible, exactement comme le ferait la page.
   */
  function track(week: string) {
    readWeek(week).then((rows) => {
      for (const row of rows) created.push(row.id)
    })
  }

  it('recopie la semaine source, remet les statuts à « Planifié » et signale les annulés', () => {
    cy.signIn('admin')
    tagNames.push('Vérif copie annulée', 'Vérif copie prévue')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      // Un annulé et un réalisé : ce que la copie doit signaler, et ce qu'elle doit remettre
      // en prévisionnel. Copier « Réalisé » inventerait des heures à déclarer au CESU.
      cy.createFreeAppointment({
        date: SOURCE,
        tags: ['Vérif copie annulée'],
        status: 'cancelled',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: assistants[0]!.id,
      }).then(({ id }) => created.push(id))

      cy.createFreeAppointment({
        date: SOURCE,
        tags: ['Vérif copie prévue'],
        status: 'completed',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: assistants[1]!.id,
      }).then(({ id }) => created.push(id))

      cy.visit(`/week?week=${TARGET_WEEK}`)
      cy.contains('button', 'Copier une semaine').click()

      // La semaine PRÉCÉDENTE est proposée par défaut : c'est le geste de tous les jours, et
      // c'est la source de ce scénario. Le champ porte une DATE, pas une semaine — c'est le
      // lundi de la semaine source qui est proposé.
      cy.get('#copy-source').should('have.value', SOURCE_WEEK)

      // L'annulation est signalée AVANT l'écriture : elle peut être ponctuelle.
      cy.get('.modale__panneau').should('contain', '1 annulé dans la source')
      cy.get('.semaine__copie-liste li').should('have.length', 1)
      cy.get('.semaine__copie-liste').should('contain', beneficiaries[0]!.name)

      cy.get('.modale__pied').contains('button', 'Copier').click()

      // On attend le compte rendu avant de relire l'API : la copie est une requête en vol, et
      // lire plus tôt interrogerait la base avant l'écriture.
      cy.get('.modale__panneau').should('contain', '2 créneaux copiés')

      readWeek(TARGET_WEEK).then((rows) => {
        expect(rows.map(row => row.date)).to.deep.equal([shift(SOURCE, 7), shift(SOURCE, 7)])
        expect(rows.map(row => row.status)).to.deep.equal(['planned', 'planned'])
        // Les tags suivent le créneau : sans eux, la copie ne dirait plus ce qu'on vient faire.
        expect(rows.flatMap(row => row.tags.map(tag => tag.name)).sort())
          .to.deep.equal(['Vérif copie annulée', 'Vérif copie prévue'])
      })

      track(TARGET_WEEK)
    })
  })

  it('ne remplace une semaine cible non vide qu\'après confirmation', () => {
    cy.signIn('admin')
    tagNames.push('Vérif copie origine', 'Vérif copie occupation')

    cy.referenceLists().then(({ beneficiaries, assistants }) => {
      cy.createFreeAppointment({
        date: SOURCE,
        tags: ['Vérif copie origine'],
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: assistants[0]!.id,
      }).then(({ id }) => created.push(id))

      cy.createFreeAppointment({
        date: TARGET,
        tags: ['Vérif copie occupation'],
        status: 'planned',
        beneficiaryId: beneficiaries[0]!.id,
        primaryAssistantId: assistants[0]!.id,
      }).then(({ id }) => created.push(id))

      // La réponse au `confirm()` du remplacement : refusée, puis acceptée.
      let accept = false
      cy.on('window:confirm', () => accept)

      cy.visit(`/week?week=${TARGET_WEEK}`)
      cy.contains('button', 'Copier une semaine').click()

      // La conséquence est écrite AVANT le clic, et redemandée en confirmation.
      cy.get('.modale__panneau').should('contain', 'La semaine cible contient 1 créneau')

      cy.get('.modale__pied').contains('button', 'Copier').click()

      // Refus : rien n'est supprimé, rien n'est copié. On interroge l'API tout de suite : sans
      // confirmation, aucune requête n'a été envoyée, donc il n'y a rien à attendre.
      //
      // `accept` bascule DANS ce `.then()`, et non après : le corps d'un test s'exécute en
      // entier avant que Cypress ne joue les commandes qu'il empile, donc l'affecter plus loin
      // l'aurait appliqué avant même le premier clic.
      readWeek(TARGET_WEEK).then((rows) => {
        expect(rows.map(row => row.tags.map(tag => tag.name))).to.deep.equal([['Vérif copie occupation']])
        accept = true
      })

      cy.get('.modale__pied').contains('button', 'Copier').click()
      cy.get('.modale__panneau').should('contain', '1 créneau copié')

      readWeek(TARGET_WEEK).then((rows) => {
        expect(rows.map(row => row.tags.map(tag => tag.name))).to.deep.equal([['Vérif copie origine']])
      })

      track(TARGET_WEEK)
    })
  })

  it('ne propose pas la copie à une famille', () => {
    // Un lecteur ne remplace rien : l'action n'est pas rendue, et le serveur refuserait (403).
    cy.signIn('viewer')
    cy.visit(`/week?week=${SOURCE_WEEK}`)

    cy.contains('button', 'Copier une semaine').should('not.exist')
  })

  it('reporte les co-aidants d\'un binôme', () => {
    // Aucune route ne crée un co-aidant : le seul moyen de vérifier qu'un binôme se recopie est
    // de partir du SEED, qui en porte un — `test/fixtures.spec.ts` le garantit.
    //
    // On compare donc la source et la cible au lieu de compter des créneaux : le scénario ne
    // suppose ni date, ni nom, ni nombre.
    cy.signIn('admin')

    const sourceWeek = weekStart(today())
    const copyTarget = freeDate(70)

    cy.request(`/api/appointments?week=${sourceWeek}`).its('body').then((source) => {
      const pairs = (rows: { coAssistantIds: string[] }[]) => rows.flatMap(row => row.coAssistantIds).sort()
      const sourcePairs = pairs(source)

      expect(sourcePairs, 'le seed porte au moins un binôme').to.have.length.greaterThan(0)

      cy.request({
        method: 'POST',
        url: '/api/appointments/copy',
        body: { source: sourceWeek, target: copyTarget },
      }).then((response) => {
        expect(response.body.copied).to.equal(source.length)
      })

      readWeek(weekStart(copyTarget)).then((rows) => {
        expect(pairs(rows)).to.deep.equal(sourcePairs)
      })

      track(weekStart(copyTarget))
    })
  })
})
