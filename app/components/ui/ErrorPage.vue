<script setup lang="ts">
/**
 * Page d'erreur affichable dans une route.
 *
 * Ce composant existe à cause d'un bug de Nuxt 4 : `app/error.vue` n'est PAS rendu
 * au premier chargement serveur, Nitro sérialise l'erreur en JSON (nuxt/nuxt#34757).
 * En rendant l'erreur depuis une route ordinaire, on obtient un vrai HTML **et** un
 * vrai code HTTP — vérifiable par `curl`.
 */
const props = withDefaults(
  defineProps<{
    status?: number
    title: string
    explanation: string
    detail?: string
  }>(),
  {
    status: 500,
    detail: '',
  },
)
</script>

<template>
  <div class="container-app flex min-h-[60dvh] flex-col justify-center gap-4 py-10">
    <p class="eyebrow">
      Erreur {{ props.status }}
    </p>

    <h1>{{ props.title }}</h1>

    <p class="max-w-prose text-ink-soft">
      {{ props.explanation }}
    </p>

    <div
      v-if="props.detail"
      class="card"
    >
      <div class="card__body">
        <p class="text-xs text-ink-muted">
          Détail
        </p>
        <p class="num text-sm text-ink-soft">
          {{ props.detail }}
        </p>
      </div>
    </div>

    <div>
      <NuxtLink
        to="/"
        class="btn btn--primary"
      >
        Revenir au planning
      </NuxtLink>
    </div>
  </div>
</template>
