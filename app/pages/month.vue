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

/**
 * Solde prévisionnel : ce qui reste à faire ce mois-ci, et ce qu'il coûtera. Le calcul vit dans
 * `app/utils/summary.ts`, testé sans base — cet écran ne fait que le mettre en forme.
 */
const beneficiaryForecasts = computed(() => forecastByBeneficiary(byBeneficiary.value))
const forecast = computed(() => forecastSummary(beneficiaryForecasts.value))

/**
 * Heures prévisionnelles du mois : tout ce qui n'est pas annulé.
 *
 * Elles se lisent dans les CUMULS du mois (`totals`), jamais dans les lignes par bénéficiaire :
 * un aidant n'en reçoit aucune (pas de total partiel), et la case affichait alors « 0 min »
 * pour un mois où il avait pourtant 6 h prévues.
 */
const forecastTotalMinutes = computed(() => (totals.value ? forecastMinutes(totals.value) : 0))

/** Un bénéficiaire et son solde prévisionnel : les deux se lisent ensemble à l'écran. */
const beneficiaryCards = computed(() =>
  byBeneficiary.value.map((line, index) => ({ line, forecast: beneficiaryForecasts.value[index]! })),
)

/**
 * Y a-t-il un prévisionnel à annoncer ? Non : le bloc disparaît.
 *
 * Un mois entièrement réalisé n'a pas de solde à montrer — le « Reste » de chaque bénéficiaire
 * dit déjà ce qu'il reste. Le seuil est le même que celui du badge qu'il remplace : du prévu,
 * ou du « à vérifier » (qui n'est pas encore confirmé, donc encore devant nous).
 */
const hasForecast = computed(
  () => (totals.value?.plannedMinutes ?? 0) + (totals.value?.toValidateMinutes ?? 0) > 0,
)

/**
 * Le taux horaire est-il communiqué à ce rôle ?
 *
 * C'est le DTO qui tranche (champ absent pour un lecteur), et non l'écran qui devinerait le
 * rôle : ainsi une colonne « À saisir » ne s'affiche jamais à la place d'un montant interdit.
 */
const ratesVisible = computed(() => byBeneficiary.value.some(line => line.hourlyRateCents !== undefined))

/**
 * La vue est-elle PARTIELLE ? Vrai pour un aidant : le serveur ne lui envoie que SES heures par
 * bénéficiaire, avec les volumes de référence calculés sur tous les aidants.
 *
 * C'est le DTO qui le dit (présence des champs `reference*`) et non l'écran qui devinerait le
 * rôle : le jour où le serveur change de périmètre, la phrase change avec lui.
 */
const partialView = computed(() => byBeneficiary.value.some(line => line.referenceForecastMinutes !== undefined))

/**
 * Ces deux suffixes disent à QUI se rapportent les nombres d'une carte quand la vue est
 * partielle. Sur une ligne complète, ils sont vides : rien à qualifier.
 */
function ownScope(line: SummaryLine): string {
  return line.referenceForecastMinutes === undefined ? '' : ' (vos heures)'
}

function allScope(line: SummaryLine): string {
  return line.referenceForecastMinutes === undefined ? '' : ' (tous aidants)'
}

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
        <!-- Solde prévisionnel du mois : ce qui reste à faire, et ce que ça coûte. Une grille
             de cases plutôt qu'une ligne grise — chaque chiffre porte sa lecture. Le montant
             se calcule au taux DE CHAQUE bénéficiaire (`app/utils/summary.ts`), et il vaut
             « À saisir » dès qu'un taux manque : un total partiel présenté comme complet
             finirait sur un virement. -->
        <section
          v-if="hasForecast"
          class="section"
        >
          <h2 class="eyebrow font-sans">
            Solde prévisionnel du mois
          </h2>

          <div class="synthese synthese--previsionnel">
            <div class="synthese__case">
              <span class="synthese__valeur">{{ formatDuration(totals?.plannedMinutes ?? 0) }}</span>
              <span class="synthese__libelle">prévu, pas encore fait</span>
            </div>

            <div class="synthese__case">
              <!-- Les heures viennent des CUMULS du mois, pas des lignes par bénéficiaire : un
                   aidant n'en reçoit aucune, et la case affichait alors « 0 min ». -->
              <span class="synthese__valeur">{{ formatDuration(forecastTotalMinutes) }}</span>
              <span class="synthese__libelle">heures prévisionnelles</span>
            </div>

            <div
              v-if="ratesVisible"
              class="synthese__case"
            >
              <span class="synthese__valeur">
                {{ forecast.amountCents === null ? 'À saisir' : formatEuros(forecast.amountCents) }}
              </span>
              <span class="synthese__libelle">
                montant prévisionnel
                <template v-if="forecast.missingRateCount > 0">
                  · {{ forecast.missingRateCount }} taux manquant{{ forecast.missingRateCount > 1 ? 's' : '' }}
                </template>
              </span>
            </div>

            <!-- La case qui compte : le solde après prévisionnel. Sa bordure la met en avant
                 (elle ne code aucune donnée), et un solde négatif passe l'encre en rouge —
                 la couleur dit alors une alerte, comme le dépassement d'un volume. -->
            <div
              v-if="forecast.balanceMinutes !== null"
              class="synthese__case synthese__case--cle"
              :class="{ 'synthese__case--depassement': forecast.balanceMinutes < 0 }"
            >
              <span class="synthese__valeur">{{ formatDuration(Math.abs(forecast.balanceMinutes)) }}</span>
              <span class="synthese__libelle">
                {{ forecast.balanceMinutes < 0 ? 'de dépassement' : 'restant à planifier' }}
                <template v-if="forecast.withoutVolumeCount > 0">
                  · hors {{ forecast.withoutVolumeCount }} sans volume
                </template>
                <!-- L'agrégat peut rester positif alors qu'un bénéficiaire, lui, a dépassé SON
                     volume : sans ce compte, un total rassurant cacherait l'alerte. -->
                <template v-if="forecast.exceededCount > 0">
                  · <span class="recap__depassement">{{ forecast.exceededCount }} en dépassement</span>
                </template>
              </span>
            </div>
          </div>
        </section>

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
          v-if="beneficiaryCards.length > 0"
          class="section"
        >
          <h2 class="eyebrow font-sans">
            Par bénéficiaire
          </h2>

          <!-- Un aidant ne voit que ses passages : le volume autorisé, lui, appartient au
               bénéficiaire. La carte décrit donc le volume de la FAMILLE (tous aidants), et ses
               propres heures apparaissent dessous, en toutes lettres. -->
          <p
            v-if="partialView"
            class="recap__contexte"
          >
            Le volume autorisé est celui du bénéficiaire : les barres et les restes comptent tous
            les aidants. Vos heures et votre montant sont indiqués sous chaque bénéficiaire.
          </p>

          <UiCard
            v-for="card in beneficiaryCards"
            :key="card.line.id"
          >
            <div class="card__body recap__ligne">
              <div class="flex items-baseline justify-between gap-2">
                <p class="recap__nom">
                  {{ card.line.name }}
                </p>
                <p class="recap__chiffres">
                  {{ formatDuration(referenceUsedMinutes(card.line)) }}
                </p>
              </div>

              <!-- Volume autorisé : la seule référence MENSUELLE du modèle, donc le seul
                   ratio exact. Une référence absente n'affiche aucun ratio. -->
              <template v-if="card.line.referenceMinutes !== null">
                <div class="flex items-center gap-2">
                  <span
                    class="recap__piste"
                    aria-hidden="true"
                  >
                    <span
                      class="recap__remplissage"
                      :class="{ 'recap__remplissage--depassement': referenceExceeded(card.line) }"
                      :style="{ width: `${durationProportion(referenceUsedMinutes(card.line), card.line.referenceMinutes)}%` }"
                    />
                  </span>
                  <span class="recap__chiffres">sur {{ formatDuration(card.line.referenceMinutes) }}</span>
                </div>
                <p :class="referenceExceeded(card.line) ? 'recap__depassement' : 'recap__contexte'">
                  <template v-if="referenceExceeded(card.line)">
                    Dépassement de {{ formatDuration(Math.abs(referenceRemaining(card.line) ?? 0)) }}
                  </template>
                  <template v-else>
                    Reste {{ formatDuration(referenceRemaining(card.line)) }}
                  </template>
                </p>
              </template>

              <p
                v-else
                class="recap__contexte"
              >
                {{ card.line.passages > 1 ? `${card.line.passages} passages` : `${card.line.passages} passage` }}
                · aucun volume autorisé saisi
              </p>

              <!-- Prévisionnel de CE bénéficiaire, à SON taux. Le solde d'ici est celui d'APRÈS
                   prévisionnel : le « Reste » ci-dessus ne parle que du réalisé, donc de la
                   déclaration. Les deux se complètent, ils ne se répètent pas.
                   Quand la ligne n'est pas complète (un aidant ne voit que ses passages), les
                   deux nombres viennent de sources différentes : on le DIT, plutôt que de
                   laisser croire qu'ils se rapportent au même périmètre. -->
              <template v-if="card.forecast.forecastMinutes > card.line.declaredMinutes">
                <p class="recap__contexte">
                  Prévisionnel {{ formatDuration(card.forecast.forecastMinutes) }}{{ ownScope(card.line) }}<template
                    v-if="card.forecast.amountCents !== null"
                  >
                    · {{ formatEuros(card.forecast.amountCents) }}
                  </template>
                </p>

                <p
                  v-if="card.forecast.balanceMinutes !== null"
                  :class="card.forecast.balanceMinutes < 0 ? 'recap__depassement' : 'recap__contexte'"
                >
                  <template v-if="card.forecast.balanceMinutes < 0">
                    Dépassement de {{ formatDuration(Math.abs(card.forecast.balanceMinutes)) }} après
                    prévisionnel{{ allScope(card.line) }}
                  </template>
                  <template v-else>
                    Après prévisionnel{{ allScope(card.line) }} : reste {{ formatDuration(card.forecast.balanceMinutes) }}
                  </template>
                </p>
              </template>
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
