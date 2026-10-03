<script setup lang="ts">
import type { Appointment, AppointmentFormOptions } from '~~/shared/types/planning'

// Vue JOUR : une grille horaire (07h–22h) où chaque créneau est posé à son heure.
const { referenceDate: currentDate, goToToday } = usePlanning()

// `?fail=1` force la lecture à échouer, pour que l'état d'erreur soit exerçable.
const route = useRoute()
const forceFailure = route.query.fail === '1'

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: appointments, error, isLoading, refresh } = useLoading(
  () => `appointments-day-${currentDate.value}`,
  () => api<Appointment[]>('/api/appointments', {
    query: { date: currentDate.value, fail: forceFailure || undefined },
  }),
  [currentDate],
)

const sortedAppointments = computed(() =>
  [...(appointments.value ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
)

// Glisser-déposer : l'état est partagé entre la grille et les créneaux.
// On lui passe la référence de données elle-même (et non un `computed`) : le
// déplacement y est appliqué localement, sans recharger la grille.
const { draggedAppointment, selectedAppointment, ghostPosition, hasConflict, startDrag } = useAppointmentDrag(appointments, refresh)

// Actions rapides : même principe optimiste que le déplacement, avec un verrou par créneau.
const { changeStatus, isStatusPending } = useAppointmentStatus(appointments, refresh)

// Filtre par aidant (réservé à l'admin) ET formulaire de créneau : une seule lecture des
// listes de référence pour les deux. Un lecteur n'en a aucun usage, on ne la lui demande
// donc pas — `/api/appointments/options` la lui refuserait de toute façon (403).
const { user } = useUserSession()
const isAdmin = computed(() => user.value?.role === 'admin')

// Même règle que la carte et le tap : l'admin écrit tout, l'aidant ses créneaux, le lecteur
// rien (`app/composables/planning.ts`).
const canEdit = useCanEditAppointments()

const { data: options } = useLoading<AppointmentFormOptions>(
  'appointment-options',
  () => canEdit.value
    ? api<AppointmentFormOptions>('/api/appointments/options')
    : Promise.resolve({ beneficiaries: [], assistants: [] }),
  [canEdit],
)
const beneficiaries = computed(() => options.value?.beneficiaries ?? [])
const assistants = computed(() => options.value?.assistants ?? [])
const selectedAssistant = ref('')
const isCreating = ref(false)

// Kilomètres du jour : un champ par aidant, enregistré à la validation. Le brouillon et le
// verrou vivent dans le composable, seul endroit qui sait si l'écriture a réussi.
const { draftOf, failure: mileageFailure, isPending: isMileagePending, save: saveMileage, setDraft } = useMileage(currentDate)

/**
 * Les aidants du jour, tels qu'ils apparaissent dans les créneaux : principal puis co-aidants,
 * dédoublonnés, triés. Pour un aidant, cette liste ne contient que lui — sa lecture est déjà
 * filtrée par le serveur. Aucune requête de plus, et la règle « qui a un passage ce jour-là »
 * reste celle de l'écran.
 */
const dayAssistants = computed(() => {
  const found = new Map<string, string>()

  for (const appointment of sortedAppointments.value) {
    found.set(appointment.primaryAssistantId, appointment.primaryAssistant)
    appointment.coAssistantIds.forEach((id, index) => {
      found.set(id, appointment.coAssistants[index] ?? '')
    })
  }

  return [...found].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
})

/**
 * Après un enregistrement : on se rend sur la date visée si elle n'est pas celle affichée
 * (sinon le créneau resterait invisible et l'utilisateur croirait à un échec), sinon on
 * relit sans changer la clé — une relecture ne vide pas `data`, donc la grille ne repasse
 * pas par le squelette et le défilement est conservé.
 */
function onSaved(date: string) {
  isCreating.value = false
  selectedAppointment.value = null
  if (currentDate.value === date) refresh()
  else currentDate.value = date
}

/** Le panneau de création et celui d'un créneau existant ne s'ouvrent jamais ensemble. */
function openCreate() {
  selectedAppointment.value = null
  isCreating.value = true
}

function selectAppointment(appointment: Appointment) {
  isCreating.value = false
  selectedAppointment.value = appointment
}

function closeModal() {
  isCreating.value = false
  selectedAppointment.value = null
}

function onDeleted() {
  selectedAppointment.value = null
  refresh()
}

const visibleAppointments = computed(() => {
  if (!selectedAssistant.value) return sortedAppointments.value
  const filter = selectedAssistant.value
  return sortedAppointments.value.filter(
    appointment => appointment.primaryAssistantId === filter || appointment.coAssistantIds.includes(filter),
  )
})

const dayAppointments = computed(() => visibleAppointments.value.filter(c => isInGrid(c.start, c.end)))
const nightAppointments = computed(() => visibleAppointments.value.filter(c => !isInGrid(c.start, c.end)))

/** Heures planifiées, créneaux annulés exclus. */
const totalMinutes = computed(() =>
  visibleAppointments.value
    .filter(appointment => appointment.status !== 'cancelled')
    .reduce((total, appointment) => total + (durationInMinutes(appointment.start, appointment.end) ?? 0), 0),
)

const beneficiaryCount = computed(() =>
  new Set(visibleAppointments.value.map(appointment => appointment.beneficiary).filter(Boolean)).size,
)

const toValidate = computed(
  () => visibleAppointments.value.filter(appointment => appointment.status === 'to_validate').length,
)

useHead({ title: 'CarePlan — planning du jour' })

function previousDay() {
  currentDate.value = addDays(currentDate.value, -1)
}

function nextDay() {
  currentDate.value = addDays(currentDate.value, 1)
}
</script>

<template>
  <div class="container-app jour-vue py-4">
    <div class="jour-vue__barre">
      <div class="min-w-0">
        <h1 class="jour-vue__titre">
          {{ isToday(currentDate) ? "Aujourd'hui" : longDay(currentDate) }}
        </h1>
        <p class="text-sm text-ink-muted">
          {{ dayOfMonth(currentDate) }} {{ longMonth(currentDate) }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <!-- Seule action de l'écran, donc seule à porter la couleur primaire ; les trois
             boutons de navigation restent secondaires. -->
        <UiButton
          v-if="canEdit && !isCreating"
          variant="primary"
          size="sm"
          icon-only
          aria-label="Nouveau créneau"
          @click="openCreate"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          icon-only
          aria-label="Jour précédent"
          @click="previousDay"
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
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          aria-label="Revenir à aujourd'hui"
          @click="currentDate = today()"
        >
          Aujourd'hui
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          icon-only
          aria-label="Jour suivant"
          @click="nextDay"
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
            <path d="M9 6l6 6-6 6" />
          </svg>
        </UiButton>
      </div>
    </div>

    <UiEmptyState
      v-if="error"
      title="Impossible de charger le planning"
      :text="error.message || 'La lecture des créneaux a échoué.'"
    >
      <template #action>
        <UiButton
          variant="primary"
          @click="refresh"
        >
          Réessayer
        </UiButton>
      </template>
    </UiEmptyState>

    <UiSkeleton
      v-else-if="isLoading"
      :blocks="3"
    />

    <template v-else>
      <!-- Synthèse : trois chiffres, volontairement pas plus. -->
      <div class="synthese">
        <div class="synthese__case">
          <span class="synthese__valeur">{{ formatDuration(totalMinutes) }}</span>
          <span class="synthese__libelle">planifiées</span>
        </div>
        <div class="synthese__case">
          <span class="synthese__valeur">{{ visibleAppointments.length }}</span>
          <span class="synthese__libelle">
            {{ visibleAppointments.length > 1 ? 'passages' : 'passage' }}
          </span>
        </div>
        <div class="synthese__case">
          <span class="synthese__valeur">{{ beneficiaryCount }}</span>
          <span class="synthese__libelle">
            {{ beneficiaryCount > 1 ? 'bénéficiaires' : 'bénéficiaire' }}
          </span>
        </div>
      </div>

      <!-- Alerte : ce qui demande une action est mis en avant, et lui seul.
           Elle n'est PAS un lien : les créneaux concernés sont dans la grille juste en
           dessous, où un lien vers la page courante n'aurait mené nulle part. -->
      <div
        v-if="toValidate > 0"
        class="card"
      >
        <div class="card__body flex items-center gap-3 py-2.5">
          <UiBadge
            tone="warning"
            dot
          >
            {{ toValidate }} à vérifier
          </UiBadge>
          <span class="text-sm text-ink-soft">
            {{ toValidate > 1 ? 'Des créneaux attendent' : 'Un créneau attend' }}
            d'être vérifiés : touchez-le pour changer son statut
          </span>
        </div>
      </div>

      <!-- Kilomètres déclarés : un champ par aidant du jour, enregistré à la validation
           (Entrée) ou en quittant le champ. Rien à ouvrir, rien à confirmer : c'est un relevé
           quotidien, pas une déclaration. -->
      <div
        v-if="canEdit && dayAssistants.length > 0"
        class="card"
      >
        <div class="card__body mileage">
          <p class="mileage__titre">
            Kilomètres
          </p>

          <div
            v-for="assistant in dayAssistants"
            :key="assistant.id"
            class="mileage__ligne"
          >
            <label
              class="mileage__nom"
              :for="`mileage-${assistant.id}`"
            >{{ assistant.name }}</label>
            <span class="mileage__champ">
              <input
                :id="`mileage-${assistant.id}`"
                :value="draftOf(assistant.id)"
                class="field__control mileage__saisie"
                type="text"
                inputmode="decimal"
                :disabled="isMileagePending(assistant.id)"
                placeholder="0"
                @input="setDraft(assistant.id, ($event.target as HTMLInputElement).value)"
                @keydown.enter="saveMileage(assistant.id, assistant.name)"
                @blur="saveMileage(assistant.id, assistant.name)"
              >
              <span class="mileage__unite">km</span>
            </span>
          </div>

          <p
            v-if="mileageFailure"
            class="field__error"
          >
            {{ mileageFailure }}
          </p>
        </div>
      </div>

      <!-- Filtre par aidant, réservé à l'admin -->
      <div
        v-if="isAdmin"
        class="field"
      >
        <label
          class="field__label"
          for="filter-assistant"
        >Aidant</label>
        <select
          id="filter-assistant"
          v-model="selectedAssistant"
          class="field__control"
        >
          <option value="">
            Tous les aidants
          </option>
          <option
            v-for="option in assistants"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }}
          </option>
        </select>
      </div>

      <UiEmptyState
        v-if="visibleAppointments.length === 0"
        title="Aucun passage prévu ce jour-là"
        text="Rien n'est planifié pour cette date. Vous pouvez ajouter un créneau, ou consulter la semaine pour vérifier les autres jours."
      >
        <template #action>
          <!-- L'action probable d'une journée vide est d'y ajouter un passage, pas de
               changer de date : c'est elle qui est proposée en premier. -->
          <UiButton
            v-if="canEdit && !isCreating"
            variant="primary"
            @click="openCreate"
          >
            Ajouter un créneau
          </UiButton>
          <UiButton
            v-if="!isToday(currentDate)"
            variant="ghost"
            @click="goToToday"
          >
            Revenir à aujourd'hui
          </UiButton>
        </template>
      </UiEmptyState>

      <template v-else>
        <PlanningTimeGrid
          v-if="dayAppointments.length > 0"
          :date="currentDate"
          :appointments="dayAppointments"
          :ghost="ghostPosition"
          :has-conflict="hasConflict"
          :dragged-appointment-id="draggedAppointment?.id ?? null"
          :start-drag="startDrag"
          :select="selectAppointment"
          :change-status="changeStatus"
          :is-status-pending="isStatusPending"
        />

        <section
          v-if="nightAppointments.length > 0"
          class="card"
        >
          <div class="card__header">
            <p class="card__title">
              Nuit
            </p>
          </div>
          <div class="divide-y divide-line">
            <!-- Créneaux de nuit : hors grille, donc non déplaçables, mais sélectionnables.
                 Les attributs de focus passent au composant (une seule racine, attributs hérités). -->
            <PlanningAppointment
              v-for="appointment in nightAppointments"
              :key="appointment.id"
              :start="appointment.start"
              :end="appointment.end"
              :title="appointment.title"
              :beneficiary="appointment.beneficiary"
              :primary-assistant="appointment.primaryAssistant"
              :color="appointment.color"
              :co-assistants="appointment.coAssistants"
              :status="appointment.status"
              :status-pending="isStatusPending(appointment.id)"
              :tabindex="canEdit ? 0 : undefined"
              :role="canEdit ? 'button' : undefined"
              @click="selectAppointment(appointment)"
              @keydown.enter.prevent="selectAppointment(appointment)"
              @keydown.space.prevent="selectAppointment(appointment)"
              @status-change="changeStatus(appointment, $event)"
            />
          </div>
        </section>
      </template>
    </template>

    <!-- Création et modification dans une modale : le planning reste visible derrière, et
         rien ne s'insère en haut de la grille. -->
    <UiModal
      v-if="isCreating"
      title="Nouveau créneau"
      @close="closeModal"
    >
      <PlanningAppointmentForm
        :default-date="currentDate"
        :beneficiaries="beneficiaries"
        :assistants="assistants"
        @saved="onSaved"
        @cancel="closeModal"
      />
    </UiModal>

    <UiModal
      v-else-if="selectedAppointment"
      title="Modifier le créneau"
      @close="closeModal"
    >
      <PlanningAppointmentForm
        :appointment="selectedAppointment"
        :beneficiaries="beneficiaries"
        :assistants="assistants"
        @saved="onSaved"
        @deleted="onDeleted"
        @cancel="closeModal"
      />
    </UiModal>
  </div>
</template>
