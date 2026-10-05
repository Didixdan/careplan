<script setup lang="ts">
import type { Appointment, Status } from '~~/shared/types/planning'
import type { GhostPosition } from '~~/app/composables/drag'

const props = defineProps<{
  dates: string[]
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

// La carte n'est activable que pour qui peut écrire : un lecteur n'a rien à ouvrir.
const canEdit = useCanEditAppointments()

const byDate = computed(() => {
  const index = new Map<string, Appointment[]>()
  for (const date of props.dates) index.set(date, [])
  for (const appointment of props.appointments) {
    const list = index.get(appointment.date)
    if (list) list.push(appointment)
  }
  return index
})

function dayAppointments(date: string): Appointment[] {
  return (byDate.value.get(date) ?? []).filter(c => isInGrid(c.start, c.end))
}

function nightAppointments(date: string): Appointment[] {
  return (byDate.value.get(date) ?? []).filter(c => !isInGrid(c.start, c.end))
}

function dayTotal(date: string): number {
  return dayAppointments(date)
    .filter(c => c.status !== 'cancelled')
    .reduce((total, c) => total + (durationInMinutes(c.start, c.end) ?? 0), 0)
}

/**
 * Ce jour a-t-il quelque chose à montrer ?
 *
 * C'est la condition de rendu du cadre défilant : une zone bornée SANS contenu capterait le
 * geste du doigt sans rien faire défiler, et empêcherait d'atteindre le jour suivant
 * (`docs/pieges.md` §13). Un jour vide reçoit donc une ligne, pas un cadre.
 */
function hasAppointments(date: string): boolean {
  return (byDate.value.get(date) ?? []).length > 0
}
</script>

<template>
  <div
    class="semaine__grille"
    role="list"
    :aria-label="`Semaine du ${weekLabel(dates)}`"
  >
    <div
      v-for="date in dates"
      :key="date"
      class="semaine__colonne"
      :class="{ 'semaine__colonne--aujourdhui': isToday(date) }"
      role="listitem"
    >
      <div class="semaine__entete">
        <span class="semaine__jour">{{ shortDay(date) }}</span>
        <span class="semaine__numero">{{ dayOfMonth(date) }}</span>
        <span class="semaine__total-valeur ml-auto">{{ formatDuration(dayTotal(date)) }}</span>
      </div>

      <!-- Un jour n'a de cadre défilant QUE s'il a quelque chose à faire défiler : une zone
           bornée sans contenu capterait le geste du doigt pour rien (docs/pieges.md §13).
           Le cadre est focalisable, sinon son contenu serait inatteignable au clavier au-delà
           de la première hauteur d'écran. -->
      <div
        v-if="hasAppointments(date)"
        class="semaine__corps"
        role="group"
        tabindex="0"
        :aria-label="`Créneaux du ${longDay(date)} ${dayOfMonth(date)}`"
      >
        <PlanningTimeGrid
          :date="date"
          :appointments="dayAppointments(date)"
          :ghost="ghost"
          :has-conflict="hasConflict"
          :dragged-appointment-id="draggedAppointmentId"
          :start-drag="startDrag"
          :select="select"
          :change-status="changeStatus"
          :is-status-pending="isStatusPending"
        />

        <!-- Créneaux de nuit : sous l'axe, à l'intérieur du cadre (l'axe 22:00 est déjà en
             bas). Hors grille, donc non déplaçables, mais bien sélectionnables. Les attributs
             de focus passent au composant (attributs hérités, une seule racine). -->
        <div
          v-if="nightAppointments(date).length > 0"
          class="divide-y divide-line"
        >
          <PlanningAppointment
            v-for="appointment in nightAppointments(date)"
            :key="appointment.id"
            compact
            :start="appointment.start"
            :end="appointment.end"
            :beneficiary="appointment.beneficiary"
            :tags="appointment.tags"
            :primary-assistant="appointment.primaryAssistant"
            :assistant-color="appointment.assistantColor"
            :beneficiary-color="appointment.beneficiaryColor"
            :co-assistants="appointment.coAssistants"
            :status="appointment.status"
            :status-pending="isStatusPending(appointment.id)"
            :tabindex="canEdit ? 0 : undefined"
            :role="canEdit ? 'button' : undefined"
            @click="select(appointment)"
            @keydown.enter.prevent="select(appointment)"
            @keydown.space.prevent="select(appointment)"
            @status-change="changeStatus(appointment, $event)"
          />
        </div>
      </div>

      <p
        v-else
        class="semaine__vide"
      >
        Aucun passage
      </p>
    </div>
  </div>
</template>
