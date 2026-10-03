<script setup lang="ts">
// Un squelette qui reprend la FORME du contenu évite le saut de mise en page.
// Le conteneur porte `role="status"` avec un libellé lisible par les lecteurs d'écran,
// et les blocs sont `aria-hidden`.
const props = withDefaults(
  defineProps<{
    blocks?: number
    /** Affiche la colonne d'heures à gauche de chaque bloc. */
    gutter?: boolean
    /** Libellé annoncé aux lecteurs d'écran. */
    label?: string
  }>(),
  {
    blocks: 3,
    gutter: true,
    label: 'Chargement en cours',
  },
)
</script>

<template>
  <div
    class="skeleton-zone"
    role="status"
    :aria-label="label"
  >
    <div
      v-for="index in props.blocks"
      :key="index"
      class="skeleton-row"
      aria-hidden="true"
    >
      <div
        v-if="props.gutter"
        class="skeleton skeleton--text skeleton-row__gutter"
      />
      <div class="skeleton skeleton--block skeleton-row__body" />
    </div>
  </div>
</template>
