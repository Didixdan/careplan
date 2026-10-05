<script setup lang="ts">
import type { Beneficiary } from '~~/shared/types/planning'

// Écran de gestion : fermé à tout autre rôle que l'administrateur (le serveur le refuse aussi).
definePageMeta({ middleware: 'admin' })

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: beneficiaries, error, refresh } = useLoading<Beneficiary[]>(
  'beneficiaries',
  () => api<Beneficiary[]>('/api/beneficiaries'),
)

const isEditing = ref(false)
const editingId = ref<string | null>(null)
const firstName = ref('')
const lastName = ref('')
const address = ref('')
const hourlyRate = ref<number | null>(null)
const monthlyHours = ref<number | null>(null)
// FACULTATIVE : `null` est la valeur par défaut, à la différence de l'écran des aidants qui
// pré-remplit une teinte. C'est ce `null` qui produit « aucun marquage » au calendrier.
const color = ref<AssistantColor | null>(null)
const message = ref('')

function openCreate() {
  isEditing.value = true
  editingId.value = null
  firstName.value = ''
  lastName.value = ''
  address.value = ''
  hourlyRate.value = null
  monthlyHours.value = null
  color.value = null
  message.value = ''
}

function openEdit(beneficiary: Beneficiary) {
  isEditing.value = true
  editingId.value = beneficiary.id
  firstName.value = beneficiary.firstName
  lastName.value = beneficiary.lastName
  address.value = beneficiary.address ?? ''
  hourlyRate.value = beneficiary.hourlyRateCents !== null ? beneficiary.hourlyRateCents / 100 : null
  monthlyHours.value = beneficiary.authorizedMinutesMonth !== null ? beneficiary.authorizedMinutesMonth / 60 : null
  color.value = beneficiary.color
  message.value = ''
}

const formBody = computed(() => ({
  firstName: firstName.value,
  lastName: lastName.value,
  address: address.value.trim() || null,
  hourlyRateCents: centsFromEuros(hourlyRate.value),
  authorizedMinutesMonth: monthlyHours.value !== null && monthlyHours.value > 0 ? monthlyHours.value * 60 : null,
  color: color.value,
}))

async function save() {
  message.value = ''
  try {
    if (editingId.value) {
      await $fetch(`/api/beneficiaries/${editingId.value}`, { method: 'PUT', body: formBody.value })
    }
    else {
      await $fetch('/api/beneficiaries', { method: 'POST', body: formBody.value })
    }
    isEditing.value = false
    await refresh()
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Enregistrement impossible.'
  }
}

async function remove(beneficiary: Beneficiary) {
  if (!confirm(`Supprimer ${beneficiary.firstName} ${beneficiary.lastName} ?`)) return
  try {
    await $fetch(`/api/beneficiaries/${beneficiary.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (errorFetch: unknown) {
    alert(errorMessage(errorFetch) || 'Suppression impossible.')
  }
}

useHead({ title: 'CarePlan — bénéficiaires' })
</script>

<template>
  <div class="container-app flex flex-col gap-5 py-5">
    <div class="flex items-center justify-between gap-3">
      <h1>Bénéficiaires</h1>
      <UiButton
        variant="primary"
        @click="openCreate"
      >
        Ajouter un bénéficiaire
      </UiButton>
    </div>

    <UiEmptyState
      v-if="error"
      title="Impossible de charger les bénéficiaires"
      :text="error.message || 'La lecture a échoué.'"
    />

    <form
      v-if="isEditing"
      class="card"
      @submit.prevent="save"
    >
      <div class="card__header">
        <p class="card__title">
          {{ editingId ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire' }}
        </p>
      </div>
      <div class="card__body flex flex-col gap-4">
        <div class="field-row">
          <div class="field">
            <label
              class="field__label"
              for="firstName"
            >Prénom</label>
            <input
              id="firstName"
              v-model="firstName"
              class="field__control"
              type="text"
              required
            >
          </div>
          <div class="field">
            <label
              class="field__label"
              for="lastName"
            >Nom</label>
            <input
              id="lastName"
              v-model="lastName"
              class="field__control"
              type="text"
              required
            >
          </div>
        </div>

        <div class="field">
          <label
            class="field__label"
            for="color"
          >Couleur (optionnel)</label>
          <div class="couleur-select">
            <select
              id="color"
              v-model="color"
              aria-label="Couleur du bénéficiaire"
            >
              <option :value="null">
                Aucune couleur
              </option>
              <option
                v-for="c in ASSISTANT_COLORS"
                :key="c"
                :value="c"
              >
                {{ ASSISTANT_COLOR_LABELS[c] }}
              </option>
            </select>
            <span class="couleur-select__display">
              <!-- Sans couleur, la pastille garde sa seule bordure : c'est l'état du contrôle,
                   pas un marquage. Le libellé dit la même chose en toutes lettres. -->
              <span
                class="couleur-select__swatch"
                :style="color ? { backgroundColor: colorVariable(color) } : undefined"
                aria-hidden="true"
              />
              {{ color ? ASSISTANT_COLOR_LABELS[color] : 'Aucune couleur' }}
            </span>
          </div>
          <p class="field__hint">
            Elle colore le rail droit des créneaux de ce bénéficiaire, dans le planning.
          </p>
        </div>

        <div class="field">
          <label
            class="field__label"
            for="address"
          >Adresse</label>
          <input
            id="address"
            v-model="address"
            class="field__control"
            type="text"
          >
        </div>

        <div class="field-row">
          <div class="field">
            <label
              class="field__label"
              for="taux"
            >Taux horaire (€, optionnel)</label>
            <input
              id="taux"
              v-model.number="hourlyRate"
              class="field__control"
              type="number"
              min="0"
              step="0.01"
            >
          </div>
          <div class="field">
            <label
              class="field__label"
              for="hours"
            >Heures autorisées / mois (optionnel)</label>
            <input
              id="hours"
              v-model.number="monthlyHours"
              class="field__control"
              type="number"
              min="0"
              step="1"
            >
          </div>
        </div>

        <p
          v-if="message"
          class="field__error"
        >
          {{ message }}
        </p>

        <div class="flex gap-2">
          <UiButton
            type="submit"
            variant="primary"
          >
            Enregistrer
          </UiButton>
          <UiButton
            variant="ghost"
            @click="isEditing = false"
          >
            Annuler
          </UiButton>
        </div>
      </div>
    </form>

    <div class="flex flex-col gap-3">
      <UiCard
        v-for="beneficiary in beneficiaries ?? []"
        :key="beneficiary.id"
      >
        <div class="card__body flex items-center justify-between gap-3">
          <div class="min-w-0">
            <!-- La pastille n'apparaît QUE s'il y a une couleur : « aucune couleur » se lit
                 comme une absence, jamais comme un marquage neutre. -->
            <p class="card__title flex items-center gap-2">
              <span
                v-if="beneficiary.color"
                class="couleur-select__swatch"
                :style="{ backgroundColor: colorVariable(beneficiary.color) }"
                aria-hidden="true"
              />
              <span class="truncate">{{ beneficiary.firstName }} {{ beneficiary.lastName }}</span>
            </p>
            <p
              v-if="beneficiary.address"
              class="card__subtitle"
            >
              {{ beneficiary.address }}
            </p>
            <p
              v-if="beneficiary.hourlyRateCents"
              class="mt-1 text-xs text-ink-muted"
            >
              {{ formatEuros(beneficiary.hourlyRateCents) }} / h
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UiButton
              variant="secondary"
              size="sm"
              @click="openEdit(beneficiary)"
            >
              Modifier
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              @click="remove(beneficiary)"
            >
              Supprimer
            </UiButton>
          </div>
        </div>
      </UiCard>
    </div>
  </div>
</template>
