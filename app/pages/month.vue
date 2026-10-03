<script setup lang="ts">
import type { MonthSummary, SummaryLine } from '~~/shared/types/planning'

/**
 * Récapitulatif mensuel : les heures à déclarer, par aidant et par bénéficiaire, et le
 * volume autorisé qu'il reste.
 *
 * Les chiffres viennent du SERVEUR (`/api/appointments/summary`) : cet écran met en forme,
 * il ne recompte pas. Un total calculé à deux endroits finit par diverger, et personne ne
 * sait plus lequel croire.
 */
const { referenceDate } = usePlanning()

// Le mois s'ouvre sur celui qu'on consultait dans le planning, puis vit sa propre vie :
// changer de mois ici ne déplace pas la vue jour.
const referenceMonth = ref(monthOf(referenceDate.value))

// `?fail=1` force la lecture à échouer, pour que l'état d'erreur soit exerçable.
const route = useRoute()
const forceFailure = route.query.fail === '1'

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: summary, error, isLoading, refresh } = useLoading(
  () => `appointments-summary-${referenceMonth.value}`,
  () => api<MonthSummary>('/api/appointments/summary', {
    query: { month: referenceMonth.value, fail: forceFailure || undefined },
  }),
  [referenceMonth],
)

const totals = computed(() => summary.value?.totals)
const byAssistant = computed(() => summary.value?.byAssistant ?? [])
const byBeneficiary = computed(() => summary.value?.byBeneficiary ?? [])
const byDay = computed(() => summary.value?.byDay ?? [])

/** Un mois sans créneau du tout, à distinguer d'un mois où rien n'a encore été réalisé. */
const isEmpty = computed(() => byDay.value.length === 0)

// Un lecteur ne produit pas d'export : il reçoit le message hebdomadaire. Même règle que les
// cartes et le tap (`app/composables/planning.ts`).
const canExport = useCanEditAppointments()

useHead({ title: 'CarePlan — récapitulatif mensuel' })

function previousMonth() {
  referenceMonth.value = shiftMonth(referenceMonth.value, -1)
}

function nextMonth() {
  referenceMonth.value = shiftMonth(referenceMonth.value, 1)
}

function currentMonth() {
  referenceMonth.value = monthOf(today())
}

/** Une ligne d'aidant : on ne dit que ce qui existe, pour ne pas noyer le chiffre qui compte. */
function assistantContext(line: SummaryLine): string {
  const parts = [line.passages > 1 ? `${line.passages} passages` : `${line.passages} passage`]
  // Les kilomètres ne concernent que les aidants, et seulement s'ils en ont déclaré : la
  // colonne d'un bénéficiaire n'en porte jamais.
  if (line.travelKilometers) parts.push(`${formatKilometers(line.travelKilometers)} km`)
  // « À vérifier » est HORS total : il ne se déclare pas tant qu'il n'a pas été confirmé.
  if (line.toValidateMinutes > 0) parts.push(`${formatDuration(line.toValidateMinutes)} à vérifier`)
  if (line.plannedMinutes > 0) parts.push(`${formatDuration(line.plannedMinutes)} prévues`)
  if (line.referenceMinutes !== null) parts.push(`contrat ${formatDuration(line.referenceMinutes)} / semaine`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="container-app recap py-4">
    <div class="recap__barre">
      <div class="min-w-0">
        <h1 class="recap__titre">
          Récapitulatif
        </h1>
        <p class="text-sm text-ink-muted">
          {{ monthLabel(referenceMonth) }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <UiButton
          variant="secondary"
          size="sm"
          icon-only
          aria-label="Mois précédent"
          @click="previousMonth"
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
          @click="currentMonth"
        >
          Ce mois
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          icon-only
          aria-label="Mois suivant"
          @click="nextMonth"
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
      title="Impossible de charger le récapitulatif"
      :text="error.message || 'La lecture des heures a échoué.'"
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
          <span class="synthese__valeur">{{ formatDuration(totals?.declaredMinutes ?? 0) }}</span>
          <span class="synthese__libelle">à déclarer</span>
        </div>
        <div class="synthese__case">
          <span class="synthese__valeur">{{ totals?.passages ?? 0 }}</span>
          <span class="synthese__libelle">
            {{ (totals?.passages ?? 0) > 1 ? 'passages' : 'passage' }}
          </span>
        </div>
        <div class="synthese__case">
          <span class="synthese__valeur">{{ totals?.toValidatePassages ?? 0 }}</span>
          <span class="synthese__libelle">à vérifier</span>
        </div>
      </div>

      <!-- Export : un lien direct, pas de `fetch` + `Blob` — le cookie de session suffit, et
           le fichier s'ouvre dans le tableur du poste. -->
      <div
        v-if="canExport && !isEmpty"
        class="flex flex-wrap items-center gap-2"
      >
        <a
          class="btn btn--secondary btn--sm"
          :href="`/api/exports/cesu?month=${referenceMonth}`"
          download
        >
          Exporter le mois (CSV)
        </a>
      </div>

      <UiEmptyState
        v-if="isEmpty"
        title="Aucune heure ce mois-ci"
        :text="`Rien n'est planifié en ${monthLabel(referenceMonth)}. Les créneaux saisis dans le planning apparaîtront ici.`"
      >
        <template #action>
          <UiButton
            variant="primary"
            @click="navigateTo('/')"
          >
            Ouvrir le planning
          </UiButton>
        </template>
      </UiEmptyState>

      <template v-else>
        <UiBadge
          v-if="(totals?.plannedMinutes ?? 0) > 0"
          tone="neutral"
        >
          Prévisionnel <span class="num ml-1">{{ formatDuration(totals?.plannedMinutes ?? 0) }}</span>
        </UiBadge>

        <section
          v-if="byAssistant.length > 0"
          class="section"
        >
          <!-- `h2` est en Anton par défaut : `font-sans` le ramène à la fonte de travail,
               comme `.eyebrow` le fait pour les intertitres. -->
          <h2 class="eyebrow font-sans">
            Par aidant
          </h2>

          <UiCard
            v-for="line in byAssistant"
            :key="line.id"
            :railed="Boolean(line.color)"
            :style="line.color ? { borderLeftColor: `var(--color-${line.color})` } : undefined"
          >
            <div class="card__body recap__ligne">
              <div class="flex items-baseline justify-between gap-2">
                <p class="recap__nom">
                  {{ line.name }}
                </p>
                <p class="recap__chiffres">
                  {{ formatDuration(line.declaredMinutes) }}
                </p>
              </div>
              <p class="recap__contexte">
                {{ assistantContext(line) }}
              </p>
            </div>
          </UiCard>
        </section>

        <section
          v-if="byBeneficiary.length > 0"
          class="section"
        >
          <h2 class="eyebrow font-sans">
            Par bénéficiaire
          </h2>

          <UiCard
            v-for="line in byBeneficiary"
            :key="line.id"
          >
            <div class="card__body recap__ligne">
              <div class="flex items-baseline justify-between gap-2">
                <p class="recap__nom">
                  {{ line.name }}
                </p>
                <p class="recap__chiffres">
                  {{ formatDuration(line.declaredMinutes) }}
                </p>
              </div>

              <!-- Volume autorisé : la seule référence MENSUELLE du modèle, donc le seul
                   ratio exact. Une référence absente n'affiche aucun ratio. -->
              <template v-if="line.referenceMinutes !== null">
                <div class="flex items-center gap-2">
                  <span
                    class="recap__piste"
                    aria-hidden="true"
                  >
                    <span
                      class="recap__remplissage"
                      :class="{ 'recap__remplissage--depassement': exceedsReference(line) }"
                      :style="{ width: `${durationProportion(line.declaredMinutes, line.referenceMinutes)}%` }"
                    />
                  </span>
                  <span class="recap__chiffres">sur {{ formatDuration(line.referenceMinutes) }}</span>
                </div>
                <p :class="exceedsReference(line) ? 'recap__depassement' : 'recap__contexte'">
                  <template v-if="exceedsReference(line)">
                    Dépassement de {{ formatDuration(Math.abs(remainingMinutes(line) ?? 0)) }}
                  </template>
                  <template v-else>
                    Reste {{ formatDuration(remainingMinutes(line)) }}
                  </template>
                </p>
              </template>

              <p
                v-else
                class="recap__contexte"
              >
                {{ line.passages > 1 ? `${line.passages} passages` : `${line.passages} passage` }}
                · aucun volume autorisé saisi
              </p>
            </div>
          </UiCard>
        </section>

        <section
          v-if="byDay.length > 0"
          class="section"
        >
          <h2 class="eyebrow font-sans">
            Détail des journées
          </h2>

          <div class="flex flex-col gap-1">
            <div
              v-for="day in byDay"
              :key="day.date"
              class="flex items-baseline justify-between gap-2"
            >
              <p class="recap__nom">
                {{ longDate(day.date) }}
              </p>
              <p class="recap__contexte shrink-0">
                {{ day.passages > 1 ? `${day.passages} passages` : `${day.passages} passage` }}
                <span class="recap__chiffres ml-2">{{ formatDuration(day.declaredMinutes) }}</span>
              </p>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
