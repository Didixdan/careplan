import { defineConfig } from 'cypress'

/**
 * Tests de bout en bout, dans un VRAI navigateur.
 *
 * C'est le seul endroit où l'on peut vérifier ce qu'aucun test de fonction ne voit : la
 * fermeture d'une modale sur Échap, le focus qui reste dedans, le glisser-déposer au pointeur,
 * et ce qui tient dans 360 px de large.
 *
 * `baseUrl` vise la base DÉDIÉE aux tests (`pnpm e2e:serve`, port 3001) : les scénarios écrivent
 * pour de vrai — créneaux, kilomètres, statuts — et n'ont rien à faire dans les données de
 * travail. `CYPRESS_BASE_URL` force une autre adresse, et `pnpm e2e:all` monte la base neuve,
 * le serveur et les scénarios d'un coup.
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:3001',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    video: false,
    screenshotOnRunFailure: false,
    viewportWidth: 1280,
    viewportHeight: 900,
  },
})
