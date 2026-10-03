<script setup lang="ts">
/**
 * Racine de l'application.
 *
 * `useTheme()` est appelé ici, à la racine, pour que la classe de thème soit posée sur
 * `<html>` dès le rendu serveur, sur toutes les routes, sans flash au chargement.
 *
 * La coquille est un COMPOSANT (`components/layout/Shell.vue`) et non un layout
 * Nuxt : elle reçoit la page par son slot, ce qui rend le point d'insertion visible
 * dans ce fichier plutôt que caché derrière `<NuxtLayout>`.
 */
const { isDark } = useTheme()

useHead({
  htmlAttrs: {
    class: computed(() => (isDark.value ? 'dark' : '')),
  },
})
</script>

<template>
  <LayoutShell>
    <NuxtPage />
  </LayoutShell>
</template>
