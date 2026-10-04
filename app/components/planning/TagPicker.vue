<script setup lang="ts">
import type { TagOption } from '~~/shared/types/planning'

/**
 * Sélecteur de tags d'un créneau : un champ de recherche qui propose le catalogue, et des
 * pastilles pour ce qui est retenu.
 *
 * Le modèle est une liste de **noms**, pas d'identifiants : le serveur résout ou crée le tag
 * à l'enregistrement (`resolveTagIds`). L'écran n'a donc jamais à gérer un tag qui n'existe
 * pas encore en base, et il n'y a qu'un seul contrat d'écriture.
 *
 * La liste de suggestions est rendue **DANS LE FLUX**, sous le champ, et non dans un menu
 * flottant : le corps de la modale défile, et un menu en position absolue y serait rogné.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string[]
    /** Catalogue complet, chargé avec les autres listes de référence de la vue. */
    catalogue: TagOption[]
    id?: string
    /** Garde-fou d'écran ; le serveur refuse de toute façon au-delà de `MAX_TAGS`. */
    max?: number
  }>(),
  {
    id: 'appointment-tags',
    max: MAX_TAGS,
  },
)

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const input = ref('')
const open = ref(false)
const highlighted = ref(0)
const inputId = computed(() => props.id)
const listId = computed(() => `${props.id}-list`)

const full = computed(() => props.modelValue.length >= props.max)

/**
 * Ce que la liste propose pour la frappe courante : suggestions du catalogue, puis création.
 * La règle vit dans `app/utils/tags.ts` (`tagOptions`), testée sans navigateur — ici, seul le
 * rendu reste.
 */
const options = computed(() => full.value
  ? { matches: [], creation: null }
  : tagOptions(input.value, props.catalogue, props.modelValue))

const creation = computed(() => options.value.creation)
const creationIndex = computed(() => options.value.matches.length)
const optionCount = computed(() => tagOptionCount(options.value))

const activeOption = computed(() => {
  if (!open.value || optionCount.value === 0) return undefined
  return highlighted.value === creationIndex.value && creation.value !== null
    ? `${props.id}-option-create`
    : `${props.id}-option-${highlighted.value}`
})

/**
 * Ajoute un tag — en adoptant la graphie du catalogue quand la clé correspond déjà (« courses »
 * ajoute « Courses »). Un doublon ou un dépassement de limite ne fait rien : le serveur le
 * refuserait, et l'écran ne doit pas produire une liste qu'il ne peut pas enregistrer.
 */
function add(name: string) {
  if (full.value) return

  const canonical = canonicalTagName(name, props.catalogue)
  if (!canonical) return
  if (props.modelValue.some(tag => tagKey(tag) === tagKey(canonical))) {
    input.value = ''
    return
  }

  emit('update:modelValue', [...props.modelValue, canonical])
  input.value = ''
  highlighted.value = 0
  open.value = true
}

function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, position) => position !== index))
}

/**
 * `Entrée` : la ligne surlignée, création comprise (`commitTag`, testé). Quand la frappe ne
 * correspond à rien, la création est la seule ligne : `Entrée` crée donc le tag tapé.
 */
function commit() {
  const name = commitTag(options.value, highlighted.value, input.value)
  if (name) add(name)
}

/** Le curseur parcourt TOUTES les lignes, création comprise : sinon elle serait inatteignable. */
function move(step: number) {
  if (optionCount.value === 0) return
  open.value = true
  highlighted.value = (highlighted.value + step + optionCount.value) % optionCount.value
}

/** `Retour arrière` sur un champ vide retire le dernier tag : le geste attendu d'un champ à pastilles. */
function backspace() {
  if (input.value !== '' || props.modelValue.length === 0) return
  emit('update:modelValue', props.modelValue.slice(0, -1))
}
</script>

<template>
  <div class="tags-field">
    <!-- Les tags retenus. Chaque pastille est un BOUTON de retrait : une cible large vaut mieux
         qu'une petite croix, qui se rate au pouce. -->
    <ul
      v-if="modelValue.length > 0"
      class="tags-field__choisis"
    >
      <li
        v-for="(tag, index) in modelValue"
        :key="tag"
      >
        <button
          type="button"
          class="tags-field__puce"
          :aria-label="`Retirer « ${tag} »`"
          @click="remove(index)"
        >
          {{ tag }}
          <span aria-hidden="true">×</span>
        </button>
      </li>
    </ul>

    <input
      :id="inputId"
      v-model="input"
      class="field__control"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="activeOption"
      :disabled="full"
      :placeholder="modelValue.length === 0 ? 'Aide à la toilette, Courses…' : 'Ajouter un tag'"
      autocomplete="off"
      @focus="open = true"
      @input="open = true; highlighted = 0"
      @keydown.enter.prevent="commit"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.esc="open = false"
      @keydown.backspace="backspace"
      @blur="open = false"
    >

    <!-- La liste s'affiche aussi quand il n'y a AUCUNE suggestion mais une création possible :
         une liste vide n'annoncerait rien, alors que « Créer … » dit quoi faire. -->
    <ul
      v-if="open && optionCount > 0"
      :id="listId"
      class="tags-field__liste"
      role="listbox"
      :aria-label="'Tags disponibles'"
    >
      <!-- `mousedown.prevent` : le clic ne retire pas le focus du champ, donc la liste ne se
           referme pas avant que le choix ne soit pris. -->
      <li
        v-for="(tag, index) in options.matches"
        :id="`${inputId}-option-${index}`"
        :key="tag.id"
        class="tags-field__option"
        :class="{ 'tags-field__option--actif': index === highlighted }"
        role="option"
        :aria-selected="index === highlighted"
        @mousedown.prevent="add(tag.name)"
      >
        {{ tag.name }}
      </li>

      <!-- La création est EN DERNIER : « Entrée » ne doit pas créer un tag voisin d'un tag
           existant par accident. On y descend à la flèche, ou on la touche. -->
      <li
        v-if="creation !== null"
        :id="`${inputId}-option-create`"
        :key="`${inputId}-option-create`"
        class="tags-field__option tags-field__option--creation"
        :class="{ 'tags-field__option--actif': highlighted === creationIndex }"
        role="option"
        :aria-selected="highlighted === creationIndex"
        @mousedown.prevent="add(creation)"
      >
        Créer « {{ creation }} »
      </li>
    </ul>

    <p
      v-if="full"
      class="field__hint"
    >
      {{ max }} tags au maximum sur un créneau.
    </p>
  </div>
</template>
