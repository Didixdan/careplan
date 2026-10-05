<script setup lang="ts">
import type { Assistant } from '~~/shared/types/planning'

// Écran de gestion : fermé à tout autre rôle que l'administrateur (le serveur le refuse aussi).
definePageMeta({ middleware: 'admin' })

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: assistants, error, refresh } = useLoading<Assistant[]>(
  'assistants',
  () => api<Assistant[]>('/api/assistants'),
)

const isEditing = ref(false)
const editingId = ref<string | null>(null)
const firstName = ref('')
const lastName = ref('')
const color = ref<AssistantColor>('assistant-4')
const weeklyHours = ref<number | null>(null)
const email = ref('')
const password = ref('')
const message = ref('')

function openCreate() {
  isEditing.value = true
  editingId.value = null
  firstName.value = ''
  lastName.value = ''
  color.value = 'assistant-4'
  weeklyHours.value = null
  email.value = ''
  password.value = ''
  message.value = ''
}

function openEdit(assistant: Assistant) {
  isEditing.value = true
  editingId.value = assistant.id
  firstName.value = assistant.firstName
  lastName.value = assistant.lastName
  color.value = assistant.color
  weeklyHours.value = assistant.contractedHours !== null ? assistant.contractedHours / 60 : null
  email.value = assistant.email
  password.value = ''
  message.value = ''
}

function closeForm() {
  isEditing.value = false
}

const contractedHours = computed(() =>
  weeklyHours.value !== null && weeklyHours.value > 0 ? weeklyHours.value * 60 : null,
)

async function save() {
  message.value = ''
  const body = {
    firstName: firstName.value,
    lastName: lastName.value,
    color: color.value,
    contractedHours: contractedHours.value,
  }
  try {
    if (editingId.value) {
      await $fetch(`/api/assistants/${editingId.value}`, { method: 'PUT', body: body })
    }
    else {
      await $fetch('/api/assistants', {
        method: 'POST',
        body: { ...body, email: email.value, password: password.value },
      })
    }
    isEditing.value = false
    await refresh()
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Enregistrement impossible.'
  }
}

async function remove(assistant: Assistant) {
  if (!confirm(`Supprimer ${assistant.firstName} ${assistant.lastName} ?`)) return
  try {
    await $fetch(`/api/assistants/${assistant.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (errorFetch: unknown) {
    alert(errorMessage(errorFetch) || 'Suppression impossible.')
  }
}

useHead({ title: 'CarePlan — aidants' })
</script>

<template>
  <div class="container-app flex flex-col gap-5 py-5">
    <div class="flex items-center justify-between gap-3">
      <h1>Aidants</h1>
      <UiButton
        variant="primary"
        @click="openCreate"
      >
        Ajouter un aidant
      </UiButton>
    </div>

    <UiEmptyState
      v-if="error"
      title="Impossible de charger les aidants"
      :text="error.message || 'La lecture a échoué.'"
    />

    <form
      v-if="isEditing"
      class="card"
      @submit.prevent="save"
    >
      <div class="card__header">
        <p class="card__title">
          {{ editingId ? 'Modifier l\'aidant' : 'Nouvel aidant' }}
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

        <div class="field-row">
          <div class="field">
            <label
              class="field__label"
              for="color"
            >Couleur</label>
            <select
              id="color"
              v-model="color"
              class="field__control"
            >
              <option
                v-for="c in ASSISTANT_COLORS"
                :key="c"
                :value="c"
              >
                {{ ASSISTANT_COLOR_LABELS[c] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label
              class="field__label"
              for="hours"
            >Heures hebdo (optionnel)</label>
            <input
              id="hours"
              v-model.number="weeklyHours"
              class="field__control"
              type="number"
              min="0"
              step="1"
            >
          </div>
        </div>

        <template v-if="!editingId">
          <div class="field">
            <label
              class="field__label"
              for="email"
            >Email de connexion</label>
            <input
              id="email"
              v-model="email"
              class="field__control"
              type="email"
              required
            >
          </div>
          <div class="field">
            <label
              class="field__label"
              for="password"
            >Mot de passe initial</label>
            <input
              id="password"
              v-model="password"
              class="field__control"
              type="password"
              required
            >
          </div>
        </template>

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
            @click="closeForm"
          >
            Annuler
          </UiButton>
        </div>
      </div>
    </form>

    <div class="flex flex-col gap-3">
      <UiCard
        v-for="assistant in assistants ?? []"
        :key="assistant.id"
        railed
        :style="{ borderLeftColor: colorVariable(assistant.color) }"
      >
        <div class="card__body flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="card__title truncate">
              {{ assistant.firstName }} {{ assistant.lastName }}
            </p>
            <p class="card__subtitle">
              {{ assistant.email }}
            </p>
            <p
              v-if="assistant.contractedHours"
              class="mt-1 text-xs text-ink-muted"
            >
              {{ formatDuration(assistant.contractedHours) }} / semaine
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UiButton
              variant="secondary"
              size="sm"
              @click="openEdit(assistant)"
            >
              Modifier
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              @click="remove(assistant)"
            >
              Supprimer
            </UiButton>
          </div>
        </div>
      </UiCard>
    </div>
  </div>
</template>
