<script setup lang="ts">
import type { AssistantColor } from '~~/app/utils/colors'
import type { Appointment, WeekIncomeLine, WeekSummary } from '~~/shared/types/planning'

/**
 * Tableau de bord : la SEMAINE en un coup d'œil.
 *
 * Trois blocs, dans l'ordre de ce qu'on vient chercher : les sept jours, les revenus prévus, les
 * kilomètres. Les chiffres viennent du SERVEUR (`/api/appointments/summary?week=`) : cet écran met
 * en forme, il ne recompte pas. Un total calculé à deux endroits finit par diverger, et personne ne
 * sait plus lequel croire.
 */
const { referenceDate } = usePlanning()

const dates = computed(() => week(referenceDate.value))

// `?fail=1` force les deux lectures à échouer, pour que l'état d'erreur soit exerçable.
const route = useRoute()
const forceFailure = route.query.fail === '1'

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

/**
 * Les créneaux de la semaine. La clé est CELLE de la vue semaine : passer de l'un à l'autre ne
 * relit donc pas les mêmes créneaux, et la charge utile ne dépend d'aucun autre paramètre.
 */
const {
  data: appointments,
  error: appointmentsError,
  isLoading: isLoadingAppointments,
  refresh: refreshAppointments,
} = useLoading(
  () => `appointments-week-${referenceDate.value}`,
  () => api<Appointment[]>('/api/appointments', {
    query: { week: referenceDate.value, fail: forceFailure || undefined },
  }),
  [referenceDate],
)

const {
  data: summary,
  error: summaryError,
  isLoading: isLoadingSummary,
  refresh: refreshSummary,
} = useLoading(
  () => `appointments-week-summary-${referenceDate.value}`,
  () => api<WeekSummary>('/api/appointments/summary', {
    query: { week: referenceDate.value, fail: forceFailure || undefined },
  }),
  [referenceDate],
)

/** Une panne, un message : les deux lectures racontent la même semaine. */
const error = computed(() => appointmentsError.value ?? summaryError.value)
const isLoading = computed(() => isLoadingAppointments.value || isLoadingSummary.value)

async function refresh() {
  await Promise.all([refreshAppointments(), refreshSummary()])
}

/** Les créneaux, groupés par jour. L'API trie déjà par date puis par heure. */
const byDate = computed(() => {
  const grouped = new Map<string, Appointment[]>(dates.value.map(date => [date, []]))
  for (const appointment of appointments.value ?? []) {
    // Un créneau hors des sept dates affichées ne peut pas venir de cette lecture : on l'ignore
    // plutôt que d'inventer un huitième bloc.
    grouped.get(appointment.date)?.push(appointment)
  }
  return grouped
})

const daySummaries = computed(() => new Map((summary.value?.byDay ?? []).map(day => [day.date, day])))

/** Un jour sans créneau n'a aucun cumul : le prévisionnel est nul, il n'est pas absent. */
const NO_MINUTES = { declaredMinutes: 0, toValidateMinutes: 0, plannedMinutes: 0 }

/** Les sept blocs du récapitulatif : la date, ses créneaux, son total, et « est-ce aujourd'hui ». */
const days = computed(() => dates.value.map(date => ({
  date,
  appointments: byDate.value.get(date) ?? [],
  // Le total d'un jour est le prévisionnel — tout ce qui n'est pas annulé, comme partout ailleurs.
  minutes: forecastMinutes(daySummaries.value.get(date) ?? NO_MINUTES),
  isToday: isToday(date),
})))

/**
 * Le taux horaire est-il communiqué à ce rôle ? C'est le DTO qui tranche (champ absent pour un
 * lecteur), et non l'écran qui devinerait le rôle : le bloc des revenus disparaît donc au lieu
 * d'écrire « À saisir » là où aucun montant n'a le droit d'être montré.
 */
const ratesVisible = computed(() =>
  (summary.value?.byPair ?? []).some(line => line.hourlyRateCents !== undefined),
)

const income = computed(() => incomeGroups(summary.value?.byPair ?? []))
const mileage = computed(() => summary.value?.mileage ?? [])

/** Un aidant ne lit que ses revenus : le titre le dit, plutôt qu'un générique trompeur. */
const { user } = useUserSession()
const isAssistant = computed(() => user.value?.role === 'assistant')

useHead({ title: 'CarePlan — tableau de bord' })

function previousWeek() {
  referenceDate.value = addDays(referenceDate.value, -7)
}

function nextWeek() {
  referenceDate.value = addDays(referenceDate.value, 7)
}

function currentWeek() {
  referenceDate.value = today()
}

/**
 * Le badge ne s'affiche que là où il change la lecture : « à vérifier » et « annulé ». Le prévu et
 * le réalisé sont l'ordinaire d'une semaine — un badge sur chaque ligne noierait les deux autres.
 */
function showsStatus(status: Appointment['status']): boolean {
  return status === 'to_validate' || status === 'cancelled'
}

/** Rail d'une personne : `undefined` = aucun marquage, jamais une teinte inventée. */
function railStyle(color: AssistantColor | null | undefined): Record<string, string> | undefined {
  return color ? { backgroundColor: colorVariable(color) } : undefined
}

/** Un montant absent s'écrit « À saisir » : jamais 0 €, qui se lirait comme un salaire. */
function amountLabel(cents: number | null): string {
  return cents === null ? 'À saisir' : formatEuros(cents)
}

/**
 * Le calcul AFFICHÉ : « 12,50 h × 38,75 €/h ». Un taux non saisi s'écrit, plutôt que de laisser
 * un « × €/h » devant lequel personne ne sait si c'est un bug ou une donnée manquante.
 */
function calculation(line: WeekIncomeLine): string {
  const rate = line.hourlyRateCents
  return `${formatHoursDecimal(line.minutes)} h × `
    + (rate === null || rate === undefined ? 'taux à saisir' : `${formatCents(rate)} €/h`)
}
</script>

<template>
  <div class="container-app recap py-4">
    <div class="tableau__barre">
      <div class="min-w-0">
        <h1 class="recap__titre">
          Tableau de bord
        </h1>
        <p class="text-sm text-ink-muted">
          {{ weekLabel(dates) }}
        </p>
      </div>

      <div class="tableau__actions">
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
      title="Impossible de charger le tableau de bord"
      :text="error.message || 'La lecture de la semaine a échoué.'"
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
      <!-- La semaine, jour par jour : la même grille que la vue semaine (une, deux puis trois
           colonnes), et le jour courant marqué par sa bordure — pas de bandeau « Aujourd'hui »,
           qui ne ferait que répéter ce bloc. -->
      <section class="section">
        <h2 class="eyebrow font-sans">
          Semaine
        </h2>

        <div class="semaine__grille">
          <div
            v-for="day in days"
            :key="day.date"
            class="semaine__colonne tableau__jour"
            :class="{ 'semaine__colonne--aujourdhui': day.isToday }"
          >
            <!-- L'en-tête mène à la vue jour, sur SA date : le récapitulatif sert à repérer un
                 jour, pas à le modifier. -->
            <NuxtLink
              class="tableau__jour-lien"
              to="/day"
              @click="referenceDate = day.date"
            >
              <span class="tableau__jour-nom">{{ longDay(day.date) }} {{ dayOfMonth(day.date) }}</span>
              <span class="tableau__jour-total">{{ formatDuration(day.minutes) }}</span>
            </NuxtLink>

            <div class="divide-y divide-line">
              <p
                v-for="appointment in day.appointments"
                :key="appointment.id"
                class="tableau__creneau"
                :class="{ 'tableau__creneau--annule': appointment.status === 'cancelled' }"
              >
                <span class="tableau__heures">{{ appointment.start }} – {{ appointment.end }}</span>
                <span
                  class="tableau__rail"
                  aria-hidden="true"
                  :style="railStyle(appointment.beneficiaryColor)"
                />
                <span class="recap__nom">{{ appointment.beneficiary }}</span>
                <UiBadge
                  v-if="showsStatus(appointment.status)"
                  class="ml-auto shrink-0"
                  :tone="STATUS_TONES[appointment.status]"
                >
                  {{ STATUS_LABELS[appointment.status] }}
                </UiBadge>
              </p>

              <!-- Une zone vide sans texte se lirait comme un défaut d'affichage. -->
              <p
                v-if="day.appointments.length === 0"
                class="tableau__vide"
              >
                Aucun passage
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Revenus prévus : un groupe par aidant, une ligne par bénéficiaire — le montant suit le
           taux du bénéficiaire, donc chaque ligne a le sien. -->
      <section
        v-if="ratesVisible && income.length > 0"
        class="section"
      >
        <h2 class="eyebrow font-sans">
          {{ isAssistant ? 'Mes revenus prévus' : 'Revenus prévus de la semaine' }}
        </h2>

        <div class="tableau__revenus">
          <div
            v-for="group in income"
            :key="group.assistantId"
            class="tableau__groupe"
          >
            <p class="tableau__groupe-entete">
              <span
                class="tableau__rail"
                aria-hidden="true"
                :style="railStyle(group.assistantColor)"
              />
              <span class="recap__nom">{{ group.assistantName }}</span>
              <!-- Les heures de l'aidant sur la semaine : le contexte du montant, sans le répéter. -->
              <span class="recap__contexte ml-auto shrink-0">{{ formatDuration(group.minutes) }}</span>
            </p>

            <div class="divide-y divide-line">
              <p
                v-for="line in group.lines"
                :key="line.beneficiaryId"
                class="tableau__revenu"
              >
                <span
                  class="tableau__rail"
                  aria-hidden="true"
                  :style="railStyle(line.beneficiaryColor)"
                />
                <span class="tableau__revenu-nom">{{ line.beneficiaryName }}</span>
                <span class="tableau__calcul">{{ calculation(line) }}</span>
                <span class="tableau__montant">{{ amountLabel(line.amountCents) }}</span>
              </p>
            </div>

            <!-- Le total de l'aidant, en fin de son groupe. Sur une vue à un seul aidant, il
                 répéterait le total de la semaine : on ne le montre qu'à partir de deux. -->
            <p
              v-if="income.length > 1"
              class="tableau__sous-total"
            >
              <span class="recap__contexte">Total {{ group.assistantName }}</span>
              <span class="tableau__sous-total-valeur">{{ amountLabel(group.amountCents) }}</span>
            </p>
          </div>

          <div class="tableau__total">
            <p class="tableau__total-libelle">
              Total par semaine
            </p>
            <p class="tableau__total-valeur">
              {{ amountLabel(summary?.income.amountCents ?? null) }}
            </p>
            <p class="recap__contexte">
              Dont déjà réalisé : {{ amountLabel(summary?.income.declaredAmountCents ?? null) }}
              <template v-if="(summary?.income.missingRateCount ?? 0) > 0">
                · {{ summary?.income.missingRateCount }} taux manquant{{ (summary?.income.missingRateCount ?? 0) > 1 ? 's' : '' }}
              </template>
            </p>
          </div>
        </div>
      </section>

      <!-- Kilomètres déclarés : un relevé quotidien, cumulé sur la semaine. -->
      <section
        v-if="mileage.length > 0"
        class="section"
      >
        <h2 class="eyebrow font-sans">
          Kilomètres de la semaine
        </h2>

        <div class="card">
          <div class="divide-y divide-line">
            <p
              v-for="entry in mileage"
              :key="entry.assistantId"
              class="tableau__km"
            >
              <span class="recap__nom">{{ entry.assistantName }}</span>
              <span class="tableau__km-valeur">{{ formatKilometers(entry.kilometers) }} km</span>
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
