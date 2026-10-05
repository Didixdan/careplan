<script setup lang="ts">
/**
 * Shell applicative : barre basse sur téléphone, colonne latérale à partir de `lg`.
 * Le basculement clair/dark vit ici, dans l'en-tête, pour être accessible partout.
 */
type NavItem = {
  label: string
  to: string
  icon: string
}

const navItems: NavItem[] = [
  // `to` alimente l'état actif (`aria-current`) : une route inexistante s'allumerait à tort.
  // Le tableau de bord est l'écran d'ouverture : il vient donc en PREMIER, et « Jour » garde sa
  // place dans la barre basse, à côté de la semaine et du mois.
  { label: 'Tableau de bord', to: '/', icon: 'M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z' },
  { label: 'Jour', to: '/day', icon: 'M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
  { label: 'Semaine', to: '/week', icon: 'M4 6h16M4 10h16M4 14h7M4 18h7m7-8v8' },
  { label: 'Mois', to: '/month', icon: 'M4 20V10m5 10V4m5 16v-7m5 7V8' },
]

const route = useRoute()
const isCurrent = (item: NavItem) => route.path === item.to

const { isDark, toggle } = useTheme()
const { user, fetch: refreshSession } = useUserSession()

// Entrées de gestion, réservées à l'administrateur.
const managementNavItems = computed<NavItem[]>(() =>
  user.value?.role === 'admin'
    ? [
        { label: 'Aidants', to: '/assistants', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
        { label: 'Bénéficiaires', to: '/beneficiaries', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
        { label: 'Tags', to: '/tags', icon: 'M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-6.586 6.586a2 2 0 01-2.828 0l-7-7A2 2 0 013 11.586V7a4 4 0 014-4z' },
      ]
    : [],
)

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  // Resynchronise l'état de session côté client (le cookie vient d'être effacé).
  await refreshSession()
  await navigateTo('/login')
}
</script>

<template>
  <div class="app-shell app-shell--with-bottom-nav">
    <aside class="app-sidebar">
      <NuxtLink
        class="app-sidebar__brand"
        to="/"
      >
        CarePlan
      </NuxtLink>
      <nav aria-label="Navigation principale">
        <ul class="flex flex-col gap-0.5">
          <li
            v-for="item in navItems"
            :key="item.label"
          >
            <NuxtLink
              class="app-sidebar__item"
              :to="item.to"
              :aria-current="isCurrent(item) ? 'page' : undefined"
            >
              <svg
                class="size-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path :d="item.icon" />
              </svg>
              <span>{{ item.label }}</span>
            </NuxtLink>
          </li>
          <li
            v-for="item in managementNavItems"
            :key="item.label"
          >
            <NuxtLink
              class="app-sidebar__item"
              :to="item.to"
              :aria-current="isCurrent(item) ? 'page' : undefined"
            >
              <svg
                class="size-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path :d="item.icon" />
              </svg>
              <span>{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <!-- Écran de contrôle du design system : utile en développement, pas à l'usage courant. -->
      <NuxtLink
        to="/styleguide"
        class="app-sidebar__item mt-auto"
      >
        <svg
          class="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v18M3 12h18" />
        </svg>
        <span>Design system</span>
      </NuxtLink>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="app-header">
        <!-- Le nom de l'application ramène au tableau de bord : c'est le geste attendu d'un
             logotype, et il ne dépend d'aucun rôle. -->
        <NuxtLink
          class="app-header__title"
          to="/"
        >
          CarePlan
        </NuxtLink>

        <div class="app-header__aside">
          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            :aria-label="isDark ? 'Passer au thème clair' : 'Passer au thème dark'"
            :aria-pressed="isDark"
            @click="toggle"
          >
            <!-- Lune en thème clair (action : passer en dark), soleil sinon. -->
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                v-if="!isDark"
                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
              />
              <g v-else>
                <circle
                  cx="12"
                  cy="12"
                  r="4"
                />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </g>
            </svg>
          </button>

          <button
            type="button"
            class="btn btn--ghost btn--sm btn--icon"
            aria-label="Se déconnecter"
            @click="logout"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <main class="app-main">
        <slot />
      </main>

      <nav
        class="app-bottom-nav"
        aria-label="Navigation principale"
      >
        <NuxtLink
          v-for="item in navItems"
          :key="`bas-${item.label}`"
          class="app-bottom-nav__item"
          :to="item.to"
          :aria-current="isCurrent(item) ? 'page' : undefined"
        >
          <svg
            class="app-bottom-nav__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="item.icon" />
          </svg>
          <span>{{ item.label }}</span>
        </NuxtLink>
        <NuxtLink
          v-for="item in managementNavItems"
          :key="`bas-${item.label}`"
          class="app-bottom-nav__item"
          :to="item.to"
          :aria-current="isCurrent(item) ? 'page' : undefined"
        >
          <svg
            class="app-bottom-nav__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path :d="item.icon" />
          </svg>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </div>
  </div>
</template>
