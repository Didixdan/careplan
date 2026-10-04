<script setup lang="ts">
import type { Status, TagOption } from '~~/shared/types/planning'

/**
 * Heures en colonne de largeur fixe (l'œil descend la colonne), durée en barre
 * proportionnelle — mais toujours écrite à côté : la longueur ne porte jamais seule
 * l'information. La couleur de l'aidant principal est un rail pleine hauteur, pas un
 * fond teinté.
 *
 * Le titre est le BÉNÉFICIAIRE ; les tags disent l'acte. Cette carte vit dans le flux (bloc
 * « Nuit », liste), donc elle s'allonge : elle montre TOUS les tags, sans « +N ».
 */
const props = withDefaults(
  defineProps<{
    start: string
    end: string
    beneficiary: string
    /** Tags du créneau, dans l'ordre : tous affichés sur cette carte. */
    tags?: TagOption[]
    /** Aidant principal : affiché et porteur de la couleur du rail. */
    primaryAssistant: string
    color: AssistantColor
    coAssistants?: string[]
    status?: Status
    durationReference?: number
    compact?: boolean
    /** Une requête de statut est en vol pour ce créneau : on neutralise les boutons. */
    statusPending?: boolean
  }>(),
  {
    tags: () => [],
    coAssistants: () => [],
    status: 'planned',
    // 4 h : au-delà la barre sature. C'est une échelle de lecture, pas une mesure.
    durationReference: 240,
    compact: false,
    statusPending: false,
  },
)

const emit = defineEmits<{
  statusChange: [status: Status]
}>()

// Carte de liste : elle vit dans le flux, sa hauteur s'adapte au contenu, donc elle accueille
// toujours les actions rapides — aucun seuil ici, contrairement à la carte de la grille.
const canEdit = useCanEditAppointments()

const duration = computed(() => durationInMinutes(props.start, props.end))

const proportion = computed(() => durationProportion(duration.value, props.durationReference))

const readableDuration = computed(() => formatDuration(duration.value))

const classes = computed(() => [
  'creneau',
  ...(props.compact ? ['creneau--compact'] : []),
  // Terminé ou annulé : atténué, mais lisible — c'est l'historique de la journée.
  ...(props.status === 'completed' || props.status === 'cancelled' ? ['creneau--passe'] : []),
  ...(props.status === 'to_validate' ? ['creneau--a-valider'] : []),
])

/** Portée par l'élément du rail : le CSS en dérive toutes les couleurs. */
const colorStyle = computed(() => ({
  '--creneau-couleur': `var(--color-${props.color})`,
}))

// Le badge porte le statut, le rail porte l'aidant : deux codes distincts. Les libellés et
// tonalités viennent de `app/utils/status.ts`, partagés avec la grille horaire et la fiche
// détail d'un créneau.
</script>

<template>
  <div
    :class="classes"
    :style="colorStyle"
  >
    <!-- Colonne des heures : largeur fixe, chiffres tabulaires -->
    <div class="creneau__temps">
      <span class="creneau__heure">{{ props.start }}</span>
      <span class="creneau__separateur">↓</span>
      <span class="creneau__heure">{{ props.end }}</span>
    </div>

    <div class="creneau__contenu">
      <div class="creneau__entete">
        <p class="creneau__titre">
          {{ props.beneficiary }}
        </p>
        <UiBadge :tone="STATUS_TONES[props.status]">
          {{ STATUS_LABELS[props.status] }}
        </UiBadge>
      </div>

      <p
        v-if="props.tags.length > 0"
        class="creneau__tags"
      >
        <span
          v-for="tag in props.tags"
          :key="tag.id"
          class="tag-chip"
        >{{ tag.name }}</span>
      </p>

      <p class="creneau__meta">
        <span class="truncate">
          <UiPersonIcon
            kind="assistant"
            class="mr-1"
          />{{ props.primaryAssistant }}
        </span>
        <template v-if="props.coAssistants.length > 0">
          <span class="mx-1 shrink-0">·</span>
          <span class="truncate">avec {{ props.coAssistants.join(', ') }}</span>
        </template>
      </p>

      <div class="duree">
        <span
          class="duree__piste"
          aria-hidden="true"
        >
          <span
            class="duree__remplissage"
            :style="{ width: `${proportion}%` }"
          />
        </span>
        <span class="creneau__duree">{{ readableDuration }}</span>
      </div>

      <!-- Actions rapides, dans le flux : la carte s'allonge de leur hauteur, rien ne se
           recouvre. Les états finaux n'en ont aucune (voir `quickTransitions`). -->
      <div
        v-if="canEdit"
        class="creneau__actions"
      >
        <PlanningStatusActions
          :status="props.status"
          :disabled="props.statusPending"
          @status-change="emit('statusChange', $event)"
        />
      </div>
    </div>
  </div>
</template>
