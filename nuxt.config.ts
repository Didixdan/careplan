import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/postcss'

// Vite ne transmet pas ses alias à Sass : `loadPaths` est indispensable pour que
// `@import 'tailwindcss'` soit résolu depuis le SCSS.
const nodeModules = fileURLToPath(new URL('./node_modules', import.meta.url))

// L'ordre des clés est imposé par la règle ESLint `nuxt/nuxt-config-keys-order`.
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', 'nuxt-auth-utils'],
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: {
        lang: 'fr',
      },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0e7c8b' },
      ],
      // Sans déclaration explicite, le navigateur réclame /favicon.ico (404).
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      title: 'CarePlan',
    },
  },

  // Entrée CSS unique (import Tailwind + @theme + @apply, docs/pieges.md §3). Les polices
  // passent par Vite : Sass ne sait pas inliner une feuille `.css` de paquet npm (§5).
  css: [
    '@fontsource-variable/instrument-sans/wght.css',
    '@fontsource/anton/latin-400.css',
    '@fontsource-variable/space-grotesk/wght.css',
    '~/assets/scss/main.scss',
  ],
  compatibilityDate: '2025-07-15',

  vite: {
    css: {
      // Tailwind est branché ici, par PostCSS : `@tailwindcss/vite` ignore les SCSS et laisse
      // les `@apply` littéraux dans le bundle, sans erreur (docs/pieges.md §1).
      postcss: {
        plugins: [tailwindcss()],
      },
      preprocessorOptions: {
        scss: {
          loadPaths: [nodeModules],
          // Les partials restent en `@import`, obligatoire après le bloc @theme
          // (docs/pieges.md §4) : Sass le déprécie, l'avertissement est masqué.
          silenceDeprecations: ['import'],
        },
      },
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  eslint: {
    config: {
      stylistic: {
        indent: 2,
        quotes: 'single',
        semi: false,
      },
    },
  },
})
