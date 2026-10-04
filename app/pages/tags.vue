<script setup lang="ts">
import type { Tag } from '~~/shared/types/planning'

/**
 * Écran de gestion du vocabulaire des actes : le catalogue que l'autocomplete propose.
 *
 * Fermé à tout autre rôle que l'administrateur (le serveur le refuse aussi) : un aidant crée
 * les tags dont il a besoin depuis le formulaire d'un créneau, il n'a pas à réorganiser le
 * vocabulaire de tout le monde.
 */
definePageMeta({ middleware: 'admin' })

// `useRequestFetch` transmet le cookie de session côté serveur (sinon 401 au premier F5).
const api = useRequestFetch()

const { data: catalogue, error, refresh } = useLoading<Tag[]>(
  'tags',
  () => api<Tag[]>('/api/tags'),
)

const isEditing = ref(false)
const editingId = ref<string | null>(null)
const name = ref('')
const message = ref('')

function openCreate() {
  isEditing.value = true
  editingId.value = null
  name.value = ''
  message.value = ''
}

function openEdit(tag: Tag) {
  isEditing.value = true
  editingId.value = tag.id
  name.value = tag.name
  message.value = ''
}

async function save() {
  message.value = ''
  try {
    if (editingId.value) {
      await $fetch(`/api/tags/${editingId.value}`, { method: 'PUT', body: { name: name.value } })
    }
    else {
      await $fetch('/api/tags', { method: 'POST', body: { name: name.value } })
    }
    isEditing.value = false
    await refresh()
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Enregistrement impossible.'
  }
}

/**
 * Un tag utilisé par des créneaux ne se supprime pas (409) : le message du serveur est affiché
 * tel quel, il dit déjà pourquoi. Retirer les liens en silence modifierait des créneaux que
 * personne n'a demandé de toucher.
 */
async function remove(tag: Tag) {
  if (!confirm(`Supprimer le tag « ${tag.name} » ?`)) return
  try {
    await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (errorFetch: unknown) {
    alert(errorMessage(errorFetch) || 'Suppression impossible.')
  }
}

useHead({ title: 'CarePlan — tags' })
</script>

<template>
  <div class="container-app flex flex-col gap-5 py-5">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1>Tags</h1>
        <p class="text-sm text-ink-muted">
          Le vocabulaire des actes, partagé par tous les créneaux.
        </p>
      </div>
      <UiButton
        variant="primary"
        @click="openCreate"
      >
        Ajouter un tag
      </UiButton>
    </div>

    <UiEmptyState
      v-if="error"
      title="Impossible de charger les tags"
      :text="error.message || 'La lecture a échoué.'"
    />

    <form
      v-if="isEditing"
      class="card"
      @submit.prevent="save"
    >
      <div class="card__header">
        <p class="card__title">
          {{ editingId ? 'Renommer le tag' : 'Nouveau tag' }}
        </p>
      </div>
      <div class="card__body flex flex-col gap-4">
        <div class="field">
          <label
            class="field__label"
            for="tag-name"
          >Nom</label>
          <input
            id="tag-name"
            v-model="name"
            class="field__control"
            type="text"
            placeholder="Aide à la toilette"
            required
          >
          <p class="field__hint">
            La casse et les espaces de bord ne créent pas de doublon : « Courses » et
            « courses » sont le même tag.
          </p>
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

    <UiEmptyState
      v-if="(catalogue ?? []).length === 0 && !error"
      title="Aucun tag"
      text="Le vocabulaire se remplit depuis cette page ou depuis le formulaire d'un créneau : un tag inconnu y est créé à l'enregistrement."
    />

    <div class="flex flex-col gap-3">
      <UiCard
        v-for="tag in catalogue ?? []"
        :key="tag.id"
      >
        <div class="card__body flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="card__title truncate">
              {{ tag.name }}
            </p>
            <p class="card__subtitle">
              {{ tag.usageCount > 1 ? `${tag.usageCount} créneaux` : `${tag.usageCount} créneau` }}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UiButton
              variant="secondary"
              size="sm"
              @click="openEdit(tag)"
            >
              Renommer
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              @click="remove(tag)"
            >
              Supprimer
            </UiButton>
          </div>
        </div>
      </UiCard>
    </div>
  </div>
</template>
