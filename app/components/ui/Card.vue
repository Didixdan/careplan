<script setup lang="ts">
// Une carte est POSÉE, pas suspendue : aucune ombre (vérifié par `pnpm verify:css`).
// `railed` ajoute le rail de couleur de la PERSONNE de la ligne, à gauche.
const props = withDefaults(
  defineProps<{
    muted?: boolean
    railed?: boolean
  }>(),
  {
    muted: false,
    railed: false,
  },
)

const classes = computed(() => [
  'card',
  ...(props.muted ? ['card--muted'] : []),
  ...(props.railed ? ['card--railed'] : []),
])
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
