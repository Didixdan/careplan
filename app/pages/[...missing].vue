<script setup lang="ts">
/**
 * Route attrape-tout : une URL inconnue affiche un écran, pas du JSON.
 *
 * Elle REND la page d'erreur au lieu de lever une erreur, parce que Nuxt 4 ne rend
 * pas `app/error.vue` au premier chargement serveur (nuxt/nuxt#34757). `setResponseStatus`
 * conserve le code HTTP 404 pour les moteurs de recherche et les outils.
 */
setResponseStatus(404)
useHead({ title: 'CarePlan — page introuvable' })
</script>

<template>
  <UiErrorPage
    :status="404"
    title="Page introuvable"
    explanation="Cette address ne correspond à aucun écran de l'application. Vérifiez le lien, ou revenez au planning."
  />
</template>
