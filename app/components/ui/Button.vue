<script setup lang="ts">
// Button unique de l'application ; le rendu vient des classes SCSS `.btn*`.
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type ButtonSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    type?: 'button' | 'submit' | 'reset'
    block?: boolean
    iconOnly?: boolean
    loading?: boolean
    disabled?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    block: false,
    iconOnly: false,
    loading: false,
    disabled: false,
  },
)

const classes = computed(() => [
  'btn',
  `btn--${props.variant}`,
  ...(props.size !== 'md' ? [`btn--${props.size}`] : []),
  ...(props.block ? ['btn--block'] : []),
  ...(props.iconOnly ? ['btn--icon'] : []),
  ...(props.loading ? ['btn--loading'] : []),
])
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <!-- Trois points ; l'animation est conditionnée à `prefers-reduced-motion` (SCSS). -->
    <span
      v-if="loading"
      class="btn__loading"
      aria-hidden="true"
    >
      <span /><span /><span />
    </span>
    <slot />
  </button>
</template>
