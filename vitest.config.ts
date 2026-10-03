import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Configuration de test.
 *
 * `environment: 'node'` suffit : on ne teste QUE des fonctions pures sur des
 * chaînes (`app/utils/date.ts`, `duration.ts`, `colors.ts`). Ces fichiers n'ont
 * aucun import, donc aucun montage Nuxt n'est nécessaire — et `@nuxt/test-utils`
 * n'est pas installé, volontairement : un environnement de test qui reproduit le
 * framework masque les dépendances cachées au lieu de les révéler.
 *
 * Conséquence pratique : tout fichier testé doit importer explicitement ses
 * voisins. L'auto-import de Nuxt ne fonctionne pas ici.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    reporters: 'default',
  },
})
