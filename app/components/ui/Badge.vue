<script setup lang="ts">
// `solid` produit une pastille pleine, pour un statut qui doit dominer. Par défaut, un
// cadre discret à rayon `tag` — pas la pilule arrondie surexploitée.
type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'

const props = withDefaults(
  defineProps<{
    tone?: BadgeTone
    dot?: boolean
    solid?: boolean
  }>(),
  {
    tone: 'neutral',
    dot: false,
    solid: false,
  },
)

const classes = computed(() => [
  'badge',
  `badge--${props.tone}`,
  ...(props.solid ? ['badge--solid'] : []),
])
</script>

<template>
  <span :class="classes">
    <span
      v-if="dot"
      class="badge__dot"
      aria-hidden="true"
    />
    <slot />
  </span>
</template>
