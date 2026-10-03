<script setup lang="ts">
import type { Appointment, Status } from '~~/shared/types/planning'
import type { GhostPosition } from '~~/app/composables/drag'

const props = defineProps<{
  date: string
  appointments: Appointment[]
  ghost: GhostPosition | null
  hasConflict: boolean
  draggedAppointmentId: string | null
  startDrag: (appointment: Appointment, evenement: PointerEvent) => void
  /** Ouverture du formulaire d'un créneau (tap, ou Entrée/Espace au clavier). */
  select: (appointment: Appointment) => void
  /** Action rapide : changer le statut, sans passer par le formulaire. */
  changeStatus: (appointment: Appointment, status: Status) => void
  /** Une requête de statut est en vol pour ce créneau : ses boutons sont neutralisés. */
  isStatusPending: (id: string) => boolean
}>()

const height = computed(() => (GRID_END_MINUTES - GRID_START_MINUTES) * PX_PER_MINUTE)

const ghostStyle = computed(() => {
  if (!props.ghost || props.ghost.date !== props.date) return null
  const start = parseTime(props.ghost.start) ?? GRID_START_MINUTES
  const duration = durationInMinutes(props.ghost.start, props.ghost.end) ?? 0
  return {
    top: `${minutesToPx(start)}px`,
    height: `${Math.max(duration * PX_PER_MINUTE, 1)}px`,
  }
})
</script>

<template>
  <div
    class="grille-horaire"
    data-grid
    :data-date="date"
    :style="{ height: `${height}px` }"
  >
    <span
      v-for="time in GRID_HOURS"
      :key="time"
      class="grille-horaire__heure"
      :style="{ top: `${minutesToPx(time * 60)}px` }"
    >{{ time }}h</span>

    <PlanningTimedAppointment
      v-for="appointment in appointments"
      :key="appointment.id"
      :appointment="appointment"
      :is-dragged="appointment.id === draggedAppointmentId"
      :status-pending="isStatusPending(appointment.id)"
      @drag="startDrag"
      @select="select"
      @status-change="changeStatus(appointment, $event)"
    />

    <div
      v-if="ghostStyle"
      class="grille-horaire__fantome"
      :class="{ 'grille-horaire__fantome--conflit': hasConflict }"
      :style="ghostStyle"
    />
  </div>
</template>
