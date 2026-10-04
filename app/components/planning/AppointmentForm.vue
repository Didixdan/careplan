<script setup lang="ts">
import type { Appointment, PersonOption, Status, TagOption } from '~~/shared/types/planning'

/**
 * Formulaire de créneau, en CRÉATION et en MODIFICATION — rendu dans une modale.
 *
 * Il ne dessine pas son cadre : la modale s'en charge (`UiModal`), et le formulaire fournit
 * le corps et le pied. Un seul composant pour les deux modes, parce que les champs sont
 * identiques : deux copies auraient divergé à la première validation ajoutée.
 *
 * Le composant fait lui-même les appels et émet le RÉSULTAT (`saved`, `deleted`) : la page
 * sait quelle date elle affiche, et donc ce qu'il faut relire.
 */
const props = defineProps<{
  beneficiaries: PersonOption[]
  assistants: PersonOption[]
  /** Catalogue des tags, chargé avec les autres listes de référence de la vue. */
  catalogue: TagOption[]
  /** Date proposée en création. */
  defaultDate?: string
  /** Créneau à modifier ; absent ou `null` = création. */
  appointment?: Appointment | null
}>()

const emit = defineEmits<{
  saved: [date: string]
  deleted: []
  cancel: []
}>()

const { user } = useUserSession()
const isAdmin = computed(() => user.value?.role === 'admin')
const isEdit = computed(() => props.appointment != null)

/** L'admin supprime tout, un aidant ses créneaux — et le serveur le vérifie de nouveau. */
const mayDelete = computed(() => {
  const sessionUser = user.value
  const appointment = props.appointment
  if (!sessionUser || !appointment) return false
  if (sessionUser.role === 'admin') return true
  if (!sessionUser.assistantId) return false

  return [appointment.primaryAssistantId, ...appointment.coAssistantIds].includes(sessionUser.assistantId)
})

const beneficiaryId = ref(props.appointment?.beneficiaryId ?? '')
const primaryAssistantId = ref(props.appointment?.primaryAssistantId ?? props.assistants[0]?.id ?? '')
const date = ref(props.appointment?.date ?? props.defaultDate ?? today())
const start = ref(props.appointment?.start ?? '08:00')
const end = ref(props.appointment?.end ?? '10:00')
/** Tags du créneau, par NOM et dans l'ordre : le serveur résout ou crée les tags manquants. */
const tags = ref<string[]>(props.appointment?.tags.map(tag => tag.name) ?? [])
const status = ref<Status>(props.appointment?.status ?? 'planned')
const submitting = ref(false)
const deleting = ref(false)
const message = ref('')

/** Nom affiché à un aidant, qui ne peut confier un créneau qu'à lui-même. */
const ownAssistantName = computed(
  () => props.appointment?.primaryAssistant ?? props.assistants[0]?.name ?? '—',
)

/** Durée saisie, affichée en direct : c'est elle qui rend « 22:00 → 01:00 » lisible. */
const duration = computed(() => durationInMinutes(start.value, end.value))

/** Un créneau qui traverse minuit se termine le LENDEMAIN : il faut le dire. */
const crossesMidnight = computed(() => (parseTime(end.value) ?? 0) <= (parseTime(start.value) ?? 0))

/** Sans bénéficiaire ni aidant, il n'y a rien à choisir : le dire plutôt que de laisser
 *  valider un formulaire qui échouera en 400. Couvre aussi une lecture qui a échoué. */
const ready = computed(() => props.beneficiaries.length > 0 && props.assistants.length > 0)

/**
 * Un créneau doit dire ce qu'on vient y faire : au moins un tag, comme l'ancien intitulé.
 * Le serveur refuse de toute façon en 400 — l'écran ne doit pas proposer une action qui
 * échouera, et le bouton désactivé est la seule façon de l'annoncer AVANT l'envoi.
 */
const complete = computed(() => ready.value && tags.value.length > 0)

const body = computed(() => ({
  date: date.value,
  start: start.value,
  end: end.value,
  tags: tags.value,
  status: status.value,
  beneficiaryId: beneficiaryId.value,
  primaryAssistantId: primaryAssistantId.value,
}))

async function save() {
  message.value = ''
  submitting.value = true
  try {
    if (props.appointment) {
      await $fetch(`/api/appointments/${props.appointment.id}`, { method: 'PATCH', body: body.value })
    }
    else {
      await $fetch('/api/appointments', { method: 'POST', body: body.value })
    }
    emit('saved', date.value)
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Enregistrement impossible.'
  }
  finally {
    submitting.value = false
  }
}

async function remove() {
  const appointment = props.appointment
  if (!appointment) return
  // L'intitulé n'existe plus : on nomme le passage par sa date et son bénéficiaire.
  if (!confirm(`Supprimer le passage chez ${appointment.beneficiary} du ${longDate(appointment.date)} ?`)) return

  message.value = ''
  deleting.value = true
  try {
    await $fetch(`/api/appointments/${appointment.id}`, { method: 'DELETE' })
    emit('deleted')
  }
  catch (errorFetch: unknown) {
    message.value = errorMessage(errorFetch) || 'Suppression impossible.'
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <form
    @submit.prevent="save"
  >
    <div class="modale__corps">
      <div class="field">
        <label
          class="field__label field__label--required"
          for="appointment-beneficiary"
        >Bénéficiaire</label>
        <select
          id="appointment-beneficiary"
          v-model="beneficiaryId"
          class="field__control"
          required
        >
          <option
            value=""
            disabled
          >
            Choisir un bénéficiaire
          </option>
          <option
            v-for="option in beneficiaries"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }}
          </option>
        </select>
      </div>

      <div class="field-row">
        <div class="field">
          <label
            class="field__label field__label--required"
            for="appointment-date"
          >Date</label>
          <input
            id="appointment-date"
            v-model="date"
            class="field__control"
            type="date"
            required
          >
        </div>
        <div class="field">
          <label
            class="field__label"
            for="appointment-status"
          >Statut</label>
          <select
            id="appointment-status"
            v-model="status"
            class="field__control"
          >
            <option
              v-for="value in STATUSES"
              :key="value"
              :value="value"
            >
              {{ STATUS_LABELS[value] }}
            </option>
          </select>
        </div>
      </div>

      <div class="field">
        <label
          class="field__label"
          for="appointment-assistant"
        >Aidant</label>
        <!-- L'admin choisit ; un aidant ne peut créer ou modifier que pour lui-même, donc son
             nom est affiché et non proposé — le serveur refuse de toute façon tout autre aidant. -->
        <select
          v-if="isAdmin"
          id="appointment-assistant"
          v-model="primaryAssistantId"
          class="field__control"
          required
        >
          <option
            v-for="option in assistants"
            :key="option.id"
            :value="option.id"
          >
            {{ option.name }}
          </option>
        </select>
        <input
          v-else
          id="appointment-assistant"
          class="field__control"
          type="text"
          :value="ownAssistantName"
          disabled
        >
      </div>

      <div class="field-row">
        <div class="field">
          <label
            class="field__label field__label--required"
            for="appointment-start"
          >Début</label>
          <input
            id="appointment-start"
            v-model="start"
            class="field__control"
            type="time"
            step="900"
            required
          >
        </div>
        <div class="field">
          <label
            class="field__label field__label--required"
            for="appointment-end"
          >Fin</label>
          <input
            id="appointment-end"
            v-model="end"
            class="field__control"
            type="time"
            step="900"
            required
          >
        </div>
      </div>

      <p class="field__hint">
        Durée : {{ formatDuration(duration) }}
        <template v-if="crossesMidnight">
          · se termine le lendemain
        </template>
      </p>

      <div class="field">
        <label
          class="field__label field__label--required"
          for="appointment-tags"
        >Tags</label>
        <!-- Le vocabulaire partagé remplace l'ancien intitulé libre : il propose l'existant et
             crée le manquant. Au moins un tag, comme l'intitulé l'était. -->
        <PlanningTagPicker
          id="appointment-tags"
          v-model="tags"
          :catalogue="catalogue"
        />
        <p
          v-if="tags.length === 0"
          class="field__hint"
        >
          Choisissez au moins un tag : c'est lui qui décrit le passage.
        </p>
      </div>

      <p
        v-if="!ready"
        class="field__hint"
      >
        Aucun bénéficiaire ni aidant disponible : un créneau ne peut pas être créé.
      </p>

      <p
        v-if="message"
        class="field__error"
      >
        {{ message }}
      </p>
    </div>

    <div class="modale__pied">
      <!-- La suppression est une action destructrice : à l'écart, jamais sous le pouce qui
           vise « Enregistrer », et confirmée. -->
      <UiButton
        v-if="isEdit && mayDelete"
        variant="danger"
        :loading="deleting"
        @click="remove"
      >
        Supprimer
      </UiButton>

      <div class="ml-auto flex gap-2">
        <UiButton
          variant="ghost"
          @click="emit('cancel')"
        >
          Annuler
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="submitting"
          :disabled="!complete"
        >
          Enregistrer
        </UiButton>
      </div>
    </div>
  </form>
</template>
