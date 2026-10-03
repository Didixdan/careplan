<script setup lang="ts">
/**
 * Fenêtre modale : fond assombri, panneau, et les trois choses qu'un dialogue doit faire
 * sous peine d'être une régression d'accessibilité — piéger le focus, se fermer sur Échap,
 * et le rendre à l'élément déclencheur.
 *
 * Le contenu est fourni par l'appelant (voir `PlanningAppointmentForm`) : la modale impose
 * le cadre, pas la disposition. Le titre est passé en prop pour que le dialogue soit nommé
 * (`aria-labelledby`), ce qu'exige un lecteur d'écran.
 */
defineProps<{ title: string }>()

const emit = defineEmits<{ close: [] }>()

/** Éléments réellement focalisables : un champ désactivé ne doit pas capturer Tab. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const titleId = useId()
const panel = ref<HTMLElement | null>(null)

let previousActive: HTMLElement | null = null
let previousOverflow = ''

function focusables(): HTMLElement[] {
  return Array.from(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key !== 'Tab') return

  const items = focusables()
  if (items.length === 0) return

  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return

  // Sans cette boucle, Tab atteint la page restée derrière le voile : le focus disparaît
  // de l'écran alors qu'il est toujours actif.
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  await nextTick()
  // Le premier CHAMP, pas le premier élément focalisable : celui-ci est la croix de
  // fermeture, et on n'ouvre pas un formulaire pour le refermer.
  const [firstField] = panel.value?.querySelectorAll<HTMLElement>('select, input, textarea') ?? []
  ;(firstField ?? focusables()[0] ?? panel.value)?.focus()
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  previousActive?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="modale"
      @click.self="emit('close')"
    >
      <div
        ref="panel"
        class="modale__panneau"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="modale__entete">
          <h2
            :id="titleId"
            class="modale__titre"
          >
            {{ title }}
          </h2>
          <button
            type="button"
            class="modale__fermer"
            aria-label="Fermer"
            @click="emit('close')"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <slot />
      </div>
    </div>
  </Teleport>
</template>
