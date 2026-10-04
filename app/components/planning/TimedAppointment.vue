<script setup lang="ts">
import type { Appointment, Status } from '~~/shared/types/planning'

const props = defineProps<{
  appointment: Appointment
  isDragged: boolean
  /** Une requête de statut est en vol pour ce créneau : on neutralise les boutons. */
  statusPending: boolean
}>()

const emit = defineEmits<{
  drag: [appointment: Appointment, evenement: PointerEvent]
  select: [appointment: Appointment]
  statusChange: [status: Status]
}>()

// Libellés et tonalités de statut : partagés par les trois vues qui affichent un créneau
// (`app/utils/status.ts`). Le badge porte le STATUT, le rail porte l'AIDANT, et le titre est le
// BÉNÉFICIAIRE : c'est lui qu'on cherche des yeux dans une journée.

// La carte n'est activable que pour qui peut écrire : un lecteur n'a rien à ouvrir, et une
// carte focalisable qui ne fait rien est un arrêt de tabulation inerte.
const canEdit = useCanEditAppointments()

/** Trois tags au plus, puis « +N » : la carte est proportionnelle à sa durée, donc courte. */
const tags = computed(() => visibleTags(props.appointment.tags.map(tag => tag.name)))

const style = computed(() => {
  const start = parseTime(props.appointment.start) ?? GRID_START_MINUTES
  const duration = durationInMinutes(props.appointment.start, props.appointment.end) ?? 0
  return {
    'top': `${minutesToPx(start)}px`,
    'height': `${Math.max(duration * PX_PER_MINUTE, 1)}px`,
    '--creneau-couleur': `var(--color-${props.appointment.color})`,
  }
})

const past = computed(() => props.appointment.status === 'completed' || props.appointment.status === 'cancelled')

/**
 * Les actions rapides ne sont rendues que si la carte est assez haute.
 *
 * Une carte de 15 min ne fait que 24 px : deux boutons de 44 px y seraient coupés par
 * `overflow-hidden`, et les laisser déborder recouvrirait la carte suivante. Ces créneaux-là
 * passent par la modale, ouverte par le tap — le seuil est calculé, pas approximé.
 */
const showActions = computed(
  () => canEdit.value && hasRoomForStatusActions(props.appointment.start, props.appointment.end),
)

const classes = computed(() => ({
  'creneau-horaire--glisse': props.isDragged,
  'creneau-horaire--passe': past.value,
  // « À vérifier » est le seul état qui demande une action : il reçoit un fond teinté, comme
  // la carte de liste. Sur un créneau court, le badge est coupé — l'état doit rester lisible.
  'creneau-horaire--a-valider': props.appointment.status === 'to_validate',
  'creneau-horaire--actions': showActions.value,
}))
</script>

<template>
  <div
    class="creneau-horaire"
    :class="classes"
    :style="style"
    :tabindex="canEdit ? 0 : undefined"
    :role="canEdit ? 'button' : undefined"
    @pointerdown.prevent="emit('drag', appointment, $event)"
    @keydown.enter.prevent="emit('select', appointment)"
    @keydown.space.prevent="emit('select', appointment)"
  >
    <div class="creneau-horaire__contenu">
      <p class="creneau-horaire__titre">
        {{ appointment.beneficiary }}
      </p>
      <p class="creneau-horaire__heures num">
        {{ appointment.start }} – {{ appointment.end }}
      </p>
      <!-- Les tags décrivent l'acte, là où l'ancien intitulé tenait la première ligne. Sur un
           créneau court, la rangée est rognée par le cadre — comme le badge de statut. -->
      <p
        v-if="tags.shown.length > 0"
        class="creneau-horaire__tags"
      >
        <span
          v-for="tag in tags.shown"
          :key="tag"
          class="tag-chip"
        >{{ tag }}</span>
        <span
          v-if="tags.hidden > 0"
          class="tag-chip tag-chip--plus"
        >+{{ tags.hidden }}</span>
      </p>
      <p class="creneau-horaire__aidant">
        <UiPersonIcon
          kind="assistant"
          class="mr-1"
        />{{ appointment.primaryAssistant }}
        <template v-if="appointment.coAssistants.length > 0">
          <span class="mx-1 shrink-0">·</span>avec {{ appointment.coAssistants.join(', ') }}
        </template>
      </p>
      <UiBadge :tone="STATUS_TONES[appointment.status]">
        {{ STATUS_LABELS[appointment.status] }}
      </UiBadge>
    </div>

    <div
      v-if="showActions"
      class="creneau-horaire__actions"
    >
      <PlanningStatusActions
        :status="appointment.status"
        :disabled="statusPending"
        @status-change="emit('statusChange', $event)"
      />
    </div>
  </div>
</template>
