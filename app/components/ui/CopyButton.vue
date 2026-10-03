<script setup lang="ts">
/**
 * Copie un texte dans le presse-papiers.
 *
 * C'est le seul geste du projet qu'on ne peut pas vérifier sans navigateur : d'où un repli
 * explicite plutôt qu'un échec silencieux. Si l'API est refusée — contexte non sécurisé,
 * permission refusée — on le dit, et le texte reste affiché, sélectionnable à la main.
 */
const props = withDefaults(
  defineProps<{
    text: string
    label?: string
  }>(),
  { label: 'Copier' },
)

const state = ref<'idle' | 'copied' | 'failed'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

const buttonLabel = computed(() => {
  if (state.value === 'copied') return 'Copié'
  if (state.value === 'failed') return 'Copie impossible'
  return props.label
})

/** Ce que la personne doit faire quand le presse-papiers n'est pas disponible. */
const feedback = computed(() => {
  if (state.value === 'copied') return 'Texte copié dans le presse-papiers.'
  if (state.value === 'failed') return 'Copie automatique impossible : sélectionnez le texte pour le copier.'
  return ''
})

async function copy() {
  clearTimeout(timer)
  try {
    await navigator.clipboard.writeText(props.text)
    state.value = 'copied'
  }
  catch {
    state.value = 'failed'
  }
  timer = setTimeout(reset, 2500)
}

function reset() {
  state.value = 'idle'
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <UiButton
    variant="secondary"
    size="sm"
    @click="copy"
  >
    {{ buttonLabel }}
  </UiButton>

  <!-- Le changement de libellé du bouton ne s'annonce pas tout seul : on le dit à part. -->
  <span
    class="sr-only"
    role="status"
  >{{ feedback }}</span>
</template>
