<script setup lang="ts">
import type { CopyWeekPreview, CopyWeekResult } from '~~/shared/types/planning'

/**
 * Copie d'une semaine sur une autre — rendu dans une modale (`UiModal`), comme le
 * formulaire de créneau : le composant fournit le corps et le pied, la modale le cadre.
 *
 * La semaine CIBLE est celle qu'on regarde (`target`) ; on ne choisit que l'origine. Le
 * composant ne décide de rien tout seul : les comptes affichés viennent de l'aperçu du
 * serveur (`GET /api/appointments/copy`), qui applique la même règle de périmètre que la
 * copie. Il ne peut donc pas annoncer autre chose que ce qui sera fait.
 */
const props = defineProps<{
  /** Une date de la semaine affichée : c'est elle qui reçoit la copie. */
  target: string
}>()

const emit = defineEmits<{
  /** La copie a réussi : la page relit la grille restée derrière la modale. */
  copied: []
  cancel: []
}>()

/** La semaine PRÉCÉDENTE par défaut : c'est le geste de tous les jours. */
const sourceDate = ref(addDays(props.target, -7))

const preview = ref<CopyWeekPreview | null>(null)
const previewError = ref('')
const isLoadingPreview = ref(false)
const submitting = ref(false)
const message = ref('')
const result = ref<CopyWeekResult | null>(null)

const targetWeek = computed(() => startOfWeek(props.target))
const sourceWeek = computed(() => startOfWeek(sourceDate.value))
const sameWeek = computed(() => sourceWeek.value === targetWeek.value)

/**
 * L'aperçu réellement affichable : celui dont la semaine correspond à la source COURANTE.
 *
 * Sans ce filtre, une réponse arrivée dans le désordre (deux changements de semaine coup sur
 * coup) afficherait les comptes d'une autre semaine — et ils servent à confirmer une
 * suppression.
 */
const currentPreview = computed(() =>
  preview.value && preview.value.sourceWeek === sourceWeek.value ? preview.value : null,
)

const canCopy = computed(() => !sameWeek.value && !isLoadingPreview.value && currentPreview.value !== null)
const copyDisabled = computed(() =>
  !canCopy.value || (currentPreview.value?.sourceCount ?? 0) === 0,
)

/** Décale la semaine source d'une semaine, sans jamais exposer d'objet `Date`. */
function shiftSource(weeks: number) {
  sourceDate.value = addDays(sourceDate.value, weeks * 7)
}

async function loadPreview() {
  message.value = ''

  // Deux semaines identiques : le serveur refuse (400), on ne demande donc rien.
  if (sameWeek.value) {
    preview.value = null
    previewError.value = ''
    return
  }

  isLoadingPreview.value = true
  previewError.value = ''
  try {
    preview.value = await $fetch<CopyWeekPreview>('/api/appointments/copy', {
      query: { source: sourceDate.value, target: props.target },
    })
  }
  catch (errorFetch: unknown) {
    preview.value = null
    previewError.value = errorMessage(errorFetch) || 'Lecture de la semaine source impossible.'
  }
  finally {
    isLoadingPreview.value = false
  }
}

/**
 * Confirmation AVANT d'écrire, quand la cible n'est pas vide.
 *
 * Même mécanisme que la suppression d'un créneau ou d'un aidant : `confirm()`. La copie
 * n'est pas faite pour alimenter un planning déjà rempli, donc remplacer est un choix
 * explicite, jamais un effet de bord.
 */
function confirmReplacement(current: CopyWeekPreview): boolean {
  if (current.targetCount === 0) return true

  const plural = current.targetCount > 1 ? 'x' : ''
  return confirm(
    `La semaine du ${weekLabel(week(props.target))} contient ${current.targetCount} créneau${plural} : `
    + `${current.targetCount > 1 ? 'ils seront supprimés' : 'il sera supprimé'} et remplacés par ceux de `
    + `la semaine du ${weekLabel(week(sourceDate.value))}. Continuer ?`,
  )
}

async function copy() {
  const current = currentPreview.value
  if (!current || current.sourceCount === 0) return
  if (!confirmReplacement(current)) return

  submitting.value = true
  message.value = ''
  try {
    result.value = await $fetch<CopyWeekResult>('/api/appointments/copy', {
      method: 'POST',
      body: {
        source: sourceDate.value,
        target: props.target,
        // Le drapeau suit ce qui a été CONFIRMÉ : le serveur refuse une cible non vide sans lui.
        replace: current.targetCount > 0,
      },
    })
    emit('copied')
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Copie impossible.'
    // Un refus 409 signifie que la semaine cible a changé depuis l'aperçu : il est relu.
    await loadPreview()
  }
  finally {
    submitting.value = false
  }
}

onMounted(loadPreview)
watch(sourceDate, loadPreview)
</script>

<template>
  <div class="modale__corps">
    <!-- Après une copie réussie, la modale rend compte : il n'existe aucun système de
         notification dans l'application, et la grille derrière a déjà été relue. -->
    <template v-if="result">
      <div class="flex flex-col gap-2">
        <UiBadge tone="success">
          Copie terminée
        </UiBadge>
        <p class="field__hint">
          {{ result.copied }} créneau{{ result.copied > 1 ? 'x' : '' }} copié{{ result.copied > 1 ? 's' : '' }}
          sur la semaine du {{ weekLabel(week(target)) }}
          <template v-if="result.deleted > 0">
            · {{ result.deleted }} supprimé{{ result.deleted > 1 ? 's' : '' }}
          </template>.
        </p>
      </div>
    </template>

    <template v-else>
      <div class="field">
        <label
          class="field__label field__label--required"
          for="copy-source"
        >Semaine source</label>
        <div class="flex items-center gap-2">
          <UiButton
            variant="secondary"
            icon-only
            aria-label="Semaine source précédente"
            @click="shiftSource(-1)"
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
          <input
            id="copy-source"
            v-model="sourceDate"
            class="field__control min-w-0"
            type="date"
            required
          >
          <UiButton
            variant="secondary"
            icon-only
            aria-label="Semaine source suivante"
            @click="shiftSource(1)"
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
        <!-- La semaine est celle qui contient la date : un `<input type="date">` ne peut pas
             montrer « semaine 12 », il faut donc écrire la plage qu'il désigne. -->
        <p class="field__hint">
          Semaine du {{ weekLabel(week(sourceDate)) }} — tous ses créneaux seront recopiés sur
          la semaine du {{ weekLabel(week(target)) }}.
        </p>
      </div>

      <p
        v-if="sameWeek"
        class="field__error"
      >
        Choisissez une autre semaine que la semaine affichée.
      </p>

      <p
        v-else-if="isLoadingPreview"
        class="field__hint"
      >
        Lecture de la semaine source…
      </p>

      <template v-else-if="currentPreview">
        <p
          v-if="currentPreview.sourceCount === 0"
          class="field__hint"
        >
          Cette semaine ne contient aucun créneau : il n'y a rien à copier.
        </p>

        <!-- Remplacement d'une semaine non vide : la conséquence est écrite AVANT le clic,
             en ton danger, et redemandée en confirmation. -->
        <p
          v-if="currentPreview.targetCount > 0"
          class="field__error"
        >
          La semaine cible contient {{ currentPreview.targetCount }}
          créneau{{ currentPreview.targetCount > 1 ? 'x' : '' }} : ils seront supprimés.
        </p>

        <div
          v-if="currentPreview.cancelled.length > 0"
          class="flex flex-col gap-1"
        >
          <UiBadge tone="warning">
            {{ currentPreview.cancelled.length }}
            annulé{{ currentPreview.cancelled.length > 1 ? 's' : '' }} dans la source
          </UiBadge>
          <p class="field__hint">
            Recopié{{ currentPreview.cancelled.length > 1 ? 's' : '' }} en « Planifié » : vérifiez que
            l'annulation n'était pas ponctuelle.
          </p>
          <ul class="semaine__copie-liste">
            <li
              v-for="appointment in currentPreview.cancelled"
              :key="`${appointment.date}-${appointment.start}`"
            >
              {{ longDate(appointment.date) }}, {{ appointment.start }}–{{ appointment.end }}
              chez {{ appointment.beneficiary }}
            </li>
          </ul>
        </div>
      </template>

      <p
        v-if="previewError"
        class="field__error"
      >
        {{ previewError }}
      </p>

      <p
        v-if="message"
        class="field__error"
      >
        {{ message }}
      </p>
    </template>
  </div>

  <div class="modale__pied">
    <template v-if="result">
      <UiButton
        variant="primary"
        @click="emit('cancel')"
      >
        Fermer
      </UiButton>
    </template>
    <template v-else>
      <div class="ml-auto flex gap-2">
        <UiButton
          variant="ghost"
          @click="emit('cancel')"
        >
          Annuler
        </UiButton>
        <UiButton
          variant="primary"
          :loading="submitting"
          :disabled="copyDisabled"
          @click="copy"
        >
          Copier
        </UiButton>
      </div>
    </template>
  </div>
</template>
