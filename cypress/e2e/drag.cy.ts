import { cleanup, revealCard, today } from '../support/e2e'

/**
 * Déplacement au pointeur : le geste lui-même, pas sa règle.
 *
 * Le pas de 15 minutes et le refus du chevauchement sont testés unitairement
 * (`gesture.spec.ts`, `conflicts.spec.ts`). Ici on vérifie que le geste réel les atteint :
 * `pointerdown` sur la carte, `pointermove` sur la fenêtre, `pointerup`, et ce que le serveur
 * a réellement enregistré.
 */
describe('Déplacement d’un créneau', () => {
  const created: string[] = []
  cleanup(created)

  const cards = () => cy.get('.creneau-horaire')

  interface AppointmentRow {
    id: string
    start: string
    end: string
    title: string
  }

  /** Le créneau portant ce titre, tel que le serveur le connaît. */
  function fromServer(title: string): Cypress.Chainable<AppointmentRow> {
    return cy.request(`/api/appointments?date=${today()}`).its('body').then((list) => {
      const found = (list as AppointmentRow[]).find(appointment => appointment.title === title)

      expect(found, `créneau « ${title} » présent côté serveur`).to.not.equal(undefined)
      return cy.wrap(found as AppointmentRow)
    })
  }

  function duration(start: string, end: string) {
    const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    const raw = toMinutes(end) - toMinutes(start)
    return raw > 0 ? raw : raw + 1440
  }

  /** Glisse une carte de `deltaY` pixels (négatif = vers le haut), comme le ferait un doigt. */
  function dragCard(title: string, deltaY: number) {
    // La carte doit être à l'écran AVANT de mesurer : les coordonnées du geste sont absolues,
    // et une carte sous la ligne de flottaison enverrait le pointeur hors de la fenêtre.
    revealCard(title)

    cy.contains('.creneau-horaire', title).then(($card) => {
      const box = $card[0]!.getBoundingClientRect()
      const clientX = box.left + box.width / 2
      const clientY = box.top + 10

      cy.wrap($card).trigger('pointerdown', { which: 1, clientX, clientY })
      // Le seuil du geste est de 6 px : 24 px valent un quart d'heure.
      cy.window().trigger('pointermove', { clientX, clientY: clientY + deltaY })
      cy.window().trigger('pointerup', { clientX, clientY: clientY + deltaY })
    })
  }

  function planToday(title: string) {
    return cy.referenceLists().then(({ beneficiaries, assistants }) => {
      return cy
        .createFreeAppointment({
          date: today(),
          title,
          status: 'planned',
          beneficiaryId: beneficiaries[0].id,
          primaryAssistantId: assistants[0].id,
        })
        .then((slot) => {
          created.push(slot.id)
          return cy.wrap(slot)
        })
    })
  }

  beforeEach(() => {
    cy.signIn('admin')
    // Le déplacement n'est PAS relu depuis la page : on observe la requête elle-même. Sans
    // cela, le test lirait l'état du serveur avant que le PUT n'ait répondu — une photo figée
    // que `should` ne peut pas rafraîchir.
    cy.intercept('PUT', '/api/appointments/*').as('moveAppointment')
  })

  it('déplace un créneau, par pas de 15 minutes et sans changer sa durée', () => {
    planToday('Vérif déplacement')
    cy.visit('/')
    cards().should('have.length.at.least', 1)

    fromServer('Vérif déplacement').then((before) => {
      // 48 px = 30 minutes à 1,6 px la minute.
      dragCard('Vérif déplacement', 48)
      cy.wait('@moveAppointment')

      fromServer('Vérif déplacement').then((after) => {
        expect(after.start).not.to.equal(before.start)
        expect(after.start > before.start).to.equal(true)
        // Le pas de 15 minutes, et une durée intacte.
        expect(Number(after.start.slice(3, 5)) % 15).to.equal(0)
        expect(duration(after.start, after.end)).to.equal(duration(before.start, before.end))
      })
    })
  })

  it('refuse un dépôt qui chevaucherait un passage du même aidant', () => {
    // B d'abord : le serveur place le premier créneau sur la première plage libre, donc le
    // second se pose EXACTEMENT une heure plus bas — les deux sont adjacents par construction,
    // sans que le test ait à choisir une heure.
    planToday('Vérif chevauchement B')
    planToday('Vérif chevauchement A').then((a) => {
      cy.visit('/')

      // Vers le HAUT d'une heure : A viendrait se poser exactement sur B, qui est juste au-dessus.
      dragCard('Vérif chevauchement A', -96)

      // Le refus est LOCAL : le conflit est connu avant l'envoi, donc AUCUNE requête ne part.
      // On laisse au geste le temps d'aboutir avant de conclure à son absence.
      cy.wait(250)
      cy.get('@moveAppointment.all').should('have.length', 0)

      fromServer('Vérif chevauchement A').then((after) => {
        expect(after.start).to.equal(a.start)
        expect(after.end).to.equal(a.end)
      })
    })
  })
})
