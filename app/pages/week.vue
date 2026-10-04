<script setup lang="ts">
import type { Appointment, AppointmentFormOptions } from '~~/shared/types/planning'

/**
 * Vue SEMAINE : grille horaire de sept colonnes (07h–22h), défilement horizontal.
 * Données lues en base via `/api/appointments`.
 */
const { referenceDate } = usePlanning()

// `?fail=1` force la lecture à échouer, pour que l'état d'erreur soit exerçable.
const route = useRoute()
const forceFailure = route.query.fail === '1'

/**
 * Lien profond : `?week=2026-10-24` ouvre la semaine qui contient cette date.
 *
 * La date de référence est partagée entre la vue jour et la vue semaine — passer de l'une à
 * l'autre garde le jour consulté. Le paramètre ne s'applique donc qu'au CHARGEMENT de
 * l'adresse : une adresse sans paramètre laisse la référence où elle est, et une date
 * illisible est ignorée plutôt que de faire échouer l'écran.
 */
const requestedWeek = route.query.week
if (isCivilDate(requestedWeek)) referenceDate.value = requestedWeek

const dates = computed(() => week(referenceDate.value))

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: appointments, error, isLoading, refresh } = useLoading(
  () => `appointments-week-${referenceDate.value}`,
  () => api<Appointment[]>('/api/appointments', {
    query: { week: referenceDate.value, fail: forceFailure || undefined },
  }),
  [referenceDate],
)

// Liste aplatie, pour le filtrage par aidant.
const appointmentList = computed(() => appointments.value ?? [])

// Glisser-déposer partagé entre les colonnes. On lui passe la référence de données
// elle-même (et non un `computed`) : le déplacement y est appliqué localement, sans
// recharger la grille.
const { draggedAppointment, selectedAppointment, ghostPosition, hasConflict, startDrag } = useAppointmentDrag(appointments, refresh)

// Actions rapides : même principe optimiste que le déplacement, avec un verrou par créneau.
const { changeStatus, isStatusPending } = useAppointmentStatus(appointments, refresh)

// Filtre par aidant (admin) ET formulaire de créneau : une seule lecture des listes de
// référence pour les deux, sous la MÊME clé que la vue jour (la charge utile ne dépend
// d'aucun paramètre). Un lecteur n'en a aucun usage, on ne la lui demande donc pas.
const { user } = useUserSession()
const isAdmin = computed(() => user.value?.role === 'admin')

// Même règle que la carte et le tap : l'admin écrit tout, l'aidant ses créneaux, le lecteur
// rien (`app/composables/planning.ts`).
const canEdit = useCanEditAppointments()

const { data: options, refresh: refreshOptions } = useLoading<AppointmentFormOptions>(
  'appointment-options',
  () => canEdit.value
    ? api<AppointmentFormOptions>('/api/appointments/options')
    : Promise.resolve({ beneficiaries: [], assistants: [], tags: [] }),
  [canEdit],
)
const beneficiaries = computed(() => options.value?.beneficiaries ?? [])
const assistants = computed(() => options.value?.assistants ?? [])
/** Catalogue des tags du formulaire : chargé avec les autres listes de référence. */
const catalogue = computed(() => options.value?.tags ?? [])
const selectedAssistant = ref('')
const isCreating = ref(false)

/**
 * Après un enregistrement : on se rend sur la date visée si elle n'est pas celle de la
 * semaine affichée, sinon on relit sans changer la clé — une relecture ne vide pas `data`,
 * donc la grille ne repasse pas par le squelette et le défilement est conservé.
 */
function onSaved(date: string) {
  isCreating.value = false
  selectedAppointment.value = null
  // Un tag inconnu vient peut-être d'être créé : le catalogue est relu pour qu'il soit proposé
  // à la prochaine saisie, sans recharger la page.
  refreshOptions()
  if (referenceDate.value === date) refresh()
  else referenceDate.value = date
}

/** Le panneau de création et celui d'un créneau existant ne s'ouvrent jamais ensemble. */
function openCreate() {
  selectedAppointment.value = null
  isCreating.value = true
}

/**
 * Copie d'une semaine sur celle qui est affichée. La modale est exclusive avec les deux
 * autres : on ne remplit pas un créneau en remplaçant toute la semaine.
 */
const isCopying = ref(false)

function openCopy() {
  isCreating.value = false
  selectedAppointment.value = null
  isCopying.value = true
}

function closeCopy() {
  isCopying.value = false
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

const filteredAppointments = computed(() => {
  if (!selectedAssistant.value) return appointmentList.value
  const filter = selectedAssistant.value
  return appointmentList.value.filter(
    appointment => appointment.primaryAssistantId === filter || appointment.coAssistantIds.includes(filter),
  )
})

/** Total de la semaine, créneaux annulés exclus. */
const totalWeek = computed(() =>
  filteredAppointments.value
    .filter(appointment => appointment.status !== 'cancelled')
    .reduce((total, appointment) => total + (durationInMinutes(appointment.start, appointment.end) ?? 0), 0),
)

const toValidate = computed(
  () => filteredAppointments.value.filter(appointment => appointment.status === 'to_validate').length,
)

/** Un lecteur ne produit pas d'export : il reçoit le message. Même règle que les cartes. */
const canExport = useCanEditAppointments()

/**
 * Un message prêt à coller par bénéficiaire, pour la semaine affichée.
 *
 * Attention : ils se calculent sur TOUS les créneaux de la semaine, pas sur
 * `filteredAppointments` — sinon le filtre par aidant de l'admin amputerait le message envoyé
 * à une famille des passages d'un autre aidant.
 */
const familyMessages = computed(() => {
  if (!isAdmin.value) return []

  const byBeneficiary = new Map<string, Appointment[]>()
  for (const appointment of appointmentList.value) {
    byBeneficiary.set(appointment.beneficiaryId, [...(byBeneficiary.get(appointment.beneficiaryId) ?? []), appointment])
  }

  return [...byBeneficiary.entries()]
    .map(([beneficiaryId, appointments]) => {
      const beneficiaryName = appointments[0]?.beneficiary ?? ''
      return {
        beneficiaryId,
        beneficiaryName,
        text: beneficiaryWeekMessage({ beneficiaryName, dates: dates.value, appointments }),
      }
    })
    .filter(message => message.text !== '')
    .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, 'fr'))
})

useHead({ title: 'CarePlan — planning de la semaine' })

function previousWeek() {
  referenceDate.value = addDays(referenceDate.value, -7)
}

function nextWeek() {
  referenceDate.value = addDays(referenceDate.value, 7)
}

function currentWeek() {
  referenceDate.value = today()
}
</script>

<template>
  <div class="container-app semaine py-4">
    <div class="semaine__barre">
      <div class="min-w-0">
        <h1 class="semaine__titre">
          Semaine
        </h1>
        <p class="text-sm text-ink-muted">
          {{ weekLabel(dates) }}
        </p>
      </div>

      <div class="semaine__actions">
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
          aria-label="Semaine précédente"
          @click="previousWeek"
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
          @click="currentWeek"
        >
          Cette semaine
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          icon-only
          aria-label="Semaine suivante"
          @click="nextWeek"
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
      title="Impossible de charger la semaine"
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
      <div class="flex flex-wrap items-center gap-2">
        <UiBadge tone="neutral">
          Total <span class="num ml-1">{{ formatDuration(totalWeek) }}</span>
        </UiBadge>
        <UiBadge
          v-if="toValidate > 0"
          tone="warning"
          dot
        >
          {{ toValidate }} à vérifier
        </UiBadge>

        <!-- Copie d'une semaine sur celle-ci. Action SECONDAIRE : le « + » reste la seule à
             porter la couleur primaire (règle 5). Elle vit sur cette ligne et non dans
             `.semaine__actions`, où un cinquième bouton de 44 px ne laisserait plus rien au
             titre en 360 px (voir docs/decisions.md §6). -->
        <UiButton
          v-if="canEdit"
          class="ml-auto"
          variant="secondary"
          size="sm"
          @click="openCopy"
        >
          Copier une semaine
        </UiButton>
      </div>

      <div
        v-if="isAdmin"
        class="field max-w-xs"
      >
        <label
          class="field__label"
          for="filter-assistant-week"
        >Aidant</label>
        <select
          id="filter-assistant-week"
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

      <div class="semaine__bloc">
        <PlanningWeekGrid
          :dates="dates"
          :appointments="filteredAppointments"
          :ghost="ghostPosition"
          :has-conflict="hasConflict"
          :dragged-appointment-id="draggedAppointment?.id ?? null"
          :start-drag="startDrag"
          :select="selectAppointment"
          :change-status="changeStatus"
          :is-status-pending="isStatusPending"
        />
      </div>

      <!-- Exports de la semaine : le CSV par aidant, et un message prêt à coller par famille.
           Placés SOUS la grille : on exporte ce qu'on vient de relire, pas ce qu'on cherche. -->
      <section
        v-if="canExport"
        class="card"
      >
        <div class="card__header">
          <p class="card__title">
            Exporter la semaine
          </p>
          <a
            class="btn btn--secondary btn--sm"
            :href="`/api/exports/week?week=${referenceDate}`"
            download
          >
            CSV par aidant
          </a>
        </div>

        <div
          v-if="familyMessages.length > 0"
          class="card__body flex flex-col gap-2 pt-0"
        >
          <p class="card__subtitle">
            Message à envoyer aux familles, un par bénéficiaire.
          </p>

          <details
            v-for="message in familyMessages"
            :key="message.beneficiaryId"
            class="export"
          >
            <summary class="export__resume">
              {{ message.beneficiaryName }}
            </summary>
            <div class="export__contenu">
              <pre class="export__texte">{{ message.text }}</pre>
              <UiCopyButton
                :text="message.text"
                :label="`Copier pour ${message.beneficiaryName}`"
              />
            </div>
          </details>
        </div>
      </section>
    </template>

    <!-- Création et modification dans une modale : la grille reste visible derrière, et rien
         ne s'insère en haut de la semaine. -->
    <UiModal
      v-if="isCreating"
      title="Nouveau créneau"
      @close="closeModal"
    >
      <PlanningAppointmentForm
        :default-date="referenceDate"
        :beneficiaries="beneficiaries"
        :assistants="assistants"
        :catalogue="catalogue"
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
        :catalogue="catalogue"
        @saved="onSaved"
        @deleted="onDeleted"
        @cancel="closeModal"
      />
    </UiModal>

    <!-- Copie d'une semaine : la cible est la semaine AFFICHÉE, on ne choisit que l'origine. -->
    <UiModal
      v-if="isCopying"
      title="Copier une semaine"
      @close="closeCopy"
    >
      <PlanningCopyWeekForm
        :target="referenceDate"
        @copied="refresh"
        @cancel="closeCopy"
      />
    </UiModal>
  </div>
</template>
