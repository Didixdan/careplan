<script setup lang="ts">
import type { Status } from '~~/shared/types/planning'

/**
 * Actions rapides d'un créneau : changer son statut en un clic, depuis la carte.
 *
 * La règle vit dans `app/utils/status.ts` (`quickTransitions`) : ce composant ne décide de
 * rien, il affiche les transitions autorisées depuis l'état courant. Les états finaux
 * (`completed`, `cancelled`) n'en ont aucune, d'où l'absence totale de bouton — la carte
 * reste tapable, ce qui ouvre la modale.
 *
 * Les boutons sont NEUTRES, jamais verts ni rouges : le badge porte déjà la couleur du
 * statut, et deux codes pour la même information se contrediraient (AGENTS.md règle 5). Ce
 * sont les FORMES qui diffèrent — ✓, ←, ✕ — et le libellé accessible qui tranche.
 */
const props = defineProps<{
  status: Status
  /** Requête en vol : on neutralise, sinon un double-tap enchaîne deux transitions. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  statusChange: [status: Status]
}>()

/**
 * Une icône par statut VISÉ, en une seule forme lisible à 16 px.
 *
 * `to_validate` n'est jamais proposé en action rapide ; son icône existe pour que la table
 * reste complète, comme `STATUS_LABELS` couvre les quatre statuts.
 */
const ICONS: Record<Status, string> = {
  completed: 'M5 13l4 4L19 7',
  planned: 'M19 12H5M11 18l-6-6 6-6',
  cancelled: 'M6 6l12 12M18 6L6 18',
  to_validate: 'M5 21V4h13l-2.5 4.5L18 13H5',
}

const transitions = computed(() => quickTransitions(props.status))
</script>

<template>
  <button
    v-for="target in transitions"
    :key="target"
    type="button"
    class="btn btn--secondary btn--sm btn--icon"
    :disabled="disabled"
    :aria-label="QUICK_ACTION_LABELS[target]"
    :title="QUICK_ACTION_LABELS[target]"
    @pointerdown.stop
    @keydown.stop
    @click.stop="emit('statusChange', target)"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="ICONS[target]" />
    </svg>
  </button>
</template>
