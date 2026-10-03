/// <reference types="cypress" />

/**
 * Socle des tests de bout en bout : connexion, dates civiles, et création de données par l'API.
 *
 * Deux règles, apprises à la dure :
 * - **Jamais de date figée.** Le seed se construit autour d'AUJOURD'HUI : un test qui fige une
 *   date cesse de tester quoi que ce soit la semaine suivante.
 * - **Jamais de données supposées.** Aujourd'hui peut être le jour vide du seed : un test qui
 *   veut un créneau le crée, puis le supprime.
 */

export const ACCOUNTS = {
  admin: 'admin@careplan.local',
  assistant: 'camille@careplan.local',
  viewer: 'famille.dupont@careplan.local',
} as const

export const PASSWORD = 'careplan'

/** La date civile locale, au format `'YYYY-MM-DD'` (même règle que `app/utils/date.ts`). */
export function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Décale une date civile de `days` jours. */
export function shift(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const moved = new Date(year, month - 1, day + days)
  const movedMonth = String(moved.getMonth() + 1).padStart(2, '0')
  const movedDay = String(moved.getDate()).padStart(2, '0')
  return `${moved.getFullYear()}-${movedMonth}-${movedDay}`
}

/** Le lundi de la semaine d'une date (le seed pose son premier jour sur le lundi). */
export function weekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return shift(date, weekday === 0 ? -6 : 1 - weekday)
}

/**
 * Un jour loin du seed, pour les créneaux qu'un test crée lui-même.
 *
 * « Loin du seed » ne veut PAS dire « libre » : c'est le serveur qui sait où il reste de la
 * place (voir `createFreeAppointment`), et un résidu d'exécution précédente ne doit jamais
 * faire échouer un scénario.
 */
export function freeDate(days = 21): string {
  return shift(today(), days)
}

/** La grille affichée : 07h → 22h (`app/utils/grid.ts`). Une plage hors de là n'est pas déplaçable. */
const GRID_FIRST_HOUR = 7
const GRID_LAST_HOUR = 22

/** Les débuts de plage possibles, du HAUT de la grille vers le bas, par pas d'une demi-heure. */
function candidateStarts(hours: number): string[] {
  const starts: string[] = []
  const last = GRID_LAST_HOUR - hours

  for (let half = GRID_FIRST_HOUR * 2; half <= last * 2; half++) {
    const hour = Math.floor(half / 2)
    const minutes = half % 2 === 0 ? '00' : '30'
    starts.push(`${String(hour).padStart(2, '0')}:${minutes}`)
  }

  return starts
}

/** « 07:30 » + 2 h → « 09:30 ». */
function endOf(start: string, hours: number): string {
  const [hour, minutes] = start.split(':').map(Number)
  const total = (hour ?? 0) * 60 + (minutes ?? 0) + hours * 60
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Ouvre une session et attend d'être sorti de l'écran de connexion. */
      signIn: (role: keyof typeof ACCOUNTS) => Chainable<void>
      /** Crée un créneau à la première plage que le serveur accepte (jamais de 409). */
      createFreeAppointment: (payload: Record<string, unknown>, hours?: number) => Chainable<PlannedSlot>
      /** Rend une plage libre SANS y laisser de créneau : pour remplir un formulaire. */
      findFreeSlot: (payload: Record<string, unknown>, hours?: number) => Chainable<{ start: string, end: string }>
      /** Supprime un créneau par l'API, sans échouer s'il n'existe plus. */
      removeAppointment: (id: string) => Chainable<void>
      /** Les listes de référence : identifiants réels des bénéficiaires et des aidants. */
      referenceLists: () => Chainable<{ beneficiaries: { id: string, name: string }[], assistants: { id: string, name: string }[] }>
    }
  }
}

/** Un créneau réellement créé : son identifiant, et la plage que le serveur a acceptée. */
export interface PlannedSlot {
  id: string
  start: string
  end: string
}

/**
 * Attend que Vue ait monté l'application dans la fenêtre qui vient d'être chargée.
 *
 * L'attente est écrite en DOM pur, et non avec `should` : une commande qui rend une promesse
 * n'a pas le droit d'y empiler une autre commande Cypress. C'est aussi la seule façon de
 * rendre la main APRÈS la navigation — lancée sans être attendue, elle se terminerait pendant
 * les commandes suivantes, et le test interrogerait la page précédente.
 */
function whenMounted(window: Cypress.AUTWindow, timeout: number): Promise<Cypress.AUTWindow> {
  const deadline = Date.now() + timeout

  return new Promise((resolve, reject) => {
    const poll = () => {
      const root = window.document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null

      if (root?.__vue_app__) return resolve(window)
      if (Date.now() > deadline) {
        return reject(new Error('Application Vue non montée : la page ne réagit pas aux événements.'))
      }

      setTimeout(poll, 25)
    }

    poll()
  })
}

/**
 * L'application est rendue par le serveur : `cy.visit` rend la main sur l'événement `load`,
 * donc AVANT que Vue ait attaché ses gestionnaires. Un clic parti trop tôt ne déclenche rien —
 * la page reste telle que le serveur l'a écrite, et le test échoue loin de sa cause.
 *
 * On attend donc le montage de l'application, une fois pour toutes : chaque `cy.visit` rend la
 * main sur une page vivante.
 */
Cypress.Commands.overwrite('visit', (original, ...args: unknown[]) => {
  // Les types de `visit` ne décrivent qu'une de ses signatures : on relaie les arguments tels
  // quels, plutôt que de les réécrire dans une forme que le test n'a pas demandée.
  const visit = original as unknown as (...visitArgs: unknown[]) => Promise<Cypress.AUTWindow>

  return visit(...args).then(window => whenMounted(window, 10_000)) as unknown as Cypress.Chainable<Cypress.AUTWindow>
})

Cypress.Commands.add('signIn', (role: keyof typeof ACCOUNTS) => {
  cy.session(role, () => {
    cy.visit('/login')
    cy.get('#email').clear().type(ACCOUNTS[role])
    cy.get('#password').clear().type(PASSWORD)
    cy.contains('button', 'Se connecter').click()
    cy.location('pathname').should('not.equal', '/login')
  })
})

/**
 * Crée un créneau à la première plage que le SERVEUR accepte.
 *
 * Un scénario ne peut pas supposer qu'une heure est libre : un créneau rescapé d'une exécution
 * précédente occupe la place, et la création échoue en 409 — un échec qui n'a rien à voir avec
 * ce que le test vérifie. La règle de chevauchement reste donc écrite UNE fois, côté serveur :
 * on la lui demande, au lieu de la réimplémenter ici.
 *
 * Les plages candidates partent du HAUT de la grille (07h) : la carte reste à l'écran, et il
 * reste de la place SOUS elle — ce dont le glisser-déposer a besoin pour descendre.
 */
Cypress.Commands.add('createFreeAppointment', (payload: Record<string, unknown>, hours = 1) => {
  const starts = candidateStarts(hours)

  const attempt = (index: number): Cypress.Chainable<PlannedSlot> => {
    const start = starts[index]

    if (!start) {
      throw new Error(`Aucune plage libre de ${hours} h : le serveur refuse toute la journée.`)
    }

    const end = endOf(start, hours)

    return cy
      .request({
        method: 'POST',
        url: '/api/appointments',
        failOnStatusCode: false,
        body: { ...payload, start, end },
      })
      .then((response) => {
        // 409 : la plage est prise. Ce n'est pas un échec du test, c'est la réponse à la question.
        if (response.status === 409) return attempt(index + 1)

        expect(response.status, `création du créneau à ${start}`).to.be.oneOf([200, 201])

        return cy.wrap({ id: response.body.id as string, start, end })
      })
  }

  return attempt(0)
})

/**
 * Rend une plage libre SANS y laisser de créneau.
 *
 * Le formulaire de la modale crée lui-même le créneau : il a donc besoin de connaître une plage
 * libre avant de l'envoyer. On demande au serveur de valider une plage, on relâche la place, et
 * on la lui redonne. Rien ne s'intercale entre les deux : les scénarios s'exécutent en série.
 */
Cypress.Commands.add('findFreeSlot', (payload: Record<string, unknown>, hours = 1) => {
  return cy.createFreeAppointment(payload, hours).then(({ id, start, end }) => {
    return cy.removeAppointment(id).then(() => cy.wrap({ start, end }))
  })
})

Cypress.Commands.add('removeAppointment', (id: string) => {
  cy.request({ method: 'DELETE', url: `/api/appointments/${id}`, failOnStatusCode: false })
})

Cypress.Commands.add('referenceLists', () => {
  return cy
    .request('/api/appointments/options')
    .its('body')
    .then(body => cy.wrap({ beneficiaries: body.beneficiaries, assistants: body.assistants }))
})

/**
 * Amène une carte de la grille à l'écran, avant de la cliquer ou de la glisser.
 *
 * Deux raisons, vérifiées :
 * - la grille de la semaine s'aimante colonne par colonne (`snap-x snap-mandatory`, verrouillé
 *   par `verify:css`) : un défilement PROGRAMMÉ y est ramené au point d'accroche courant, si
 *   bien que Cypress croit la carte amenée à l'écran alors qu'elle est repartie hors champ, et
 *   le clic part dans le vide (« element is being covered by another element »). Le défilement
 *   du navigateur, lui, tient compte de l'aimantation ;
 * - la vue jour place un créneau de 20 h à plus de 900 px du haut : sans défilement, les
 *   coordonnées du glisser-déposer tombent hors de la fenêtre, et `elementFromPoint` ne trouve
 *   alors aucune grille.
 *
 * `inline: 'center'` vise le MILIEU de la colonne : une carte collée au bord laisse trop peu
 * de place pour la déplacer d'un quart d'heure.
 */
export function revealCard(title: string): void {
  cy.contains('.creneau-horaire__titre', title).then(async ($titre) => {
    const carte = $titre[0] as HTMLElement

    carte.scrollIntoView({ block: 'center', inline: 'center' })
    await whenSettled(carte)
  })
}

/**
 * Attend que la carte soit réellement entière dans la fenêtre.
 *
 * Le défilement ne se pose pas dans la foulée de `scrollIntoView` : on mesure donc jusqu'à ce
 * que la position soit bonne, plutôt que de la supposer instantanée. Au-delà du délai, on
 * rend la main — c'est le clic qui échouera, avec sa propre erreur, plutôt qu'un silence.
 */
function whenSettled(element: HTMLElement, timeout = 3_000): Promise<void> {
  const fenetre = element.ownerDocument.defaultView!
  const deadline = Date.now() + timeout

  return new Promise((resolve) => {
    const step = () => {
      const rect = element.getBoundingClientRect()
      const entiere = rect.top >= 0 && rect.bottom <= fenetre.innerHeight
        && rect.left >= 0 && rect.right <= fenetre.innerWidth

      if (entiere || Date.now() > deadline) resolve()
      else fenetre.requestAnimationFrame(step)
    }

    step()
  })
}

/**
 * Supprime les créneaux créés par un test, même si le test a échoué avant son nettoyage.
 * L'API d'abord : le clic sur « Supprimer » est testé là où c'est le sujet, pas ici.
 */
export function cleanup(ids: string[]): void {
  afterEach(() => {
    for (const id of ids.splice(0)) cy.removeAppointment(id)
  })
}
