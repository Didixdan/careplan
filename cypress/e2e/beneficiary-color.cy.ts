import { cleanup, cleanupBeneficiaries, freeDate, weekStart } from '../support/e2e'

interface BeneficiaryRow {
  id: string
  color: string | null
}

interface AppointmentRow {
  id: string
  assistantColor: string
  beneficiaryColor: string | null
}

/**
 * Couleur de bénéficiaire : le rail DROIT de la carte.
 *
 * C'est le seul endroit où le rail est réellement RENDU : un test de fonction ne voit ni la
 * variable posée en style inline par la carte, ni la bordure restée transparente quand le
 * bénéficiaire n'a pas de couleur. Le scénario crée ses bénéficiaires et ses créneaux, puis
 * les supprime (voir l'ordre du nettoyage plus bas).
 */
describe('Couleur de bénéficiaire', () => {
  const created: string[] = []
  const beneficiaries: string[] = []
  // Les créneaux partent AVANT les bénéficiaires : le serveur refuse (409) de supprimer un
  // bénéficiaire qui a encore des créneaux, et Mocha exécute les `afterEach` dans l'ordre de
  // leur enregistrement.
  cleanup(created)
  cleanupBeneficiaries(beneficiaries)

  const date = freeDate()
  const week = weekStart(date)

  /** Crée un bénéficiaire par l'API admin ; `color` omis = « aucune couleur ». */
  function createBeneficiary(
    firstName: string,
    color: string | null,
  ): Cypress.Chainable<BeneficiaryRow> {
    return cy
      .request({
        method: 'POST',
        url: '/api/beneficiaries',
        body: {
          firstName,
          lastName: 'Rail',
          address: null,
          hourlyRateCents: null,
          authorizedMinutesMonth: null,
          color,
        },
      })
      .its('body')
      .then((body: BeneficiaryRow) => {
        beneficiaries.push(body.id)
        return cy.wrap(body)
      })
  }

  it('peint le rail droit du bénéficiaire, et le laisse transparent sans couleur', () => {
    cy.signIn('admin')

    createBeneficiary('Élise', 'assistant-7').then((colored) => {
      expect(colored.color).to.equal('assistant-7')

      // Deux bénéficiaires : un coloré, un sans couleur. Le second porte `null` (et non une
      // teinte par défaut) : c'est ce `null` qui doit laisser la carte sans rail.
      createBeneficiary('Robert', null).then((plain) => {
        expect(plain.color).to.equal(null)

        cy.referenceLists().then(({ assistants }) => {
          const assistantId = assistants[0]!.id
          let gridId = ''
          let nightId = ''

          // Deux créneaux de grille, repérables par leur TITRE (le bénéficiaire), et non par
          // leur tag : le tag d'un voisin du seed pourrait porter le même.
          cy.createFreeAppointment({
            date,
            tags: ['Courses'],
            status: 'planned',
            beneficiaryId: colored.id,
            primaryAssistantId: assistantId,
          }).then(({ id }) => {
            gridId = id
            created.push(id)
          })

          cy.createFreeAppointment({
            date,
            tags: ['Lever'],
            status: 'planned',
            beneficiaryId: plain.id,
            primaryAssistantId: assistantId,
          }).then(({ id }) => {
            created.push(id)
          })

          // Un créneau de nuit, pour la SECONDE carte (bloc « Nuit », `.creneau`) : elle porte
          // le rail droit comme la carte de grille, alors qu'elle n'a pas de rail gauche.
          cy.request({
            method: 'POST',
            url: '/api/appointments',
            body: {
              date,
              start: '22:00',
              end: '01:00',
              tags: ['Veille de nuit'],
              status: 'planned',
              beneficiaryId: colored.id,
              primaryAssistantId: assistantId,
            },
          }).its('body').then((appointment: { id: string }) => {
            nightId = appointment.id
            created.push(appointment.id)
          })

          // Le DTO d'abord : c'est lui qui alimente la carte. L'assertion est faite PAR
          // IDENTIFIANT, jamais par un décompte du jour : un résidu d'un scénario précédent ne
          // doit pas faire échouer celui-ci.
          cy.request(`/api/appointments?date=${date}`).then((response) => {
            const byId = new Map((response.body as AppointmentRow[]).map(row => [row.id, row]))

            expect(byId.get(gridId)?.assistantColor).to.match(/^assistant-[1-8]$/)
            expect(byId.get(gridId)?.beneficiaryColor).to.equal('assistant-7')
            expect(byId.get(nightId)?.beneficiaryColor).to.equal('assistant-7')
          })

          cy.visit(`/week?week=${week}`)

          // Carte de GRILLE : le rail droit est posé en variable, c'est ce que lit
          // `border-right-color`.
          cy.contains('.creneau-horaire', 'Élise Rail')
            .should('have.attr', 'style')
            .and('contain', '--creneau-couleur-beneficiaire')
            .and('contain', 'var(--color-assistant-7)')

          // Carte de LISTE (nuit) : même rail, alors que la couleur de l'aidant y vit sur la
          // barre de durée et non sur un rail gauche.
          cy.contains('.creneau', 'Élise Rail')
            .should('have.attr', 'style')
            .and('contain', '--creneau-couleur-beneficiaire')

          // Sans couleur : la carte ne pose AUCUNE variable de bénéficiaire — donc aucun
          // marquage, et rien d'inventé.
          cy.contains('.creneau-horaire', 'Robert Rail')
            .should('have.attr', 'style')
            .and('contain', '--creneau-couleur-aidant')
            .and('not.contain', '--creneau-couleur-beneficiaire')
        })
      })
    })
  })
})
