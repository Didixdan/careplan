<script setup lang="ts">
/**
 * Petit signe d'identité : il distingue d'un coup d'œil l'aidant du bénéficiaire,
 * dont les deux noms se suivent sur la ligne d'une carte.
 *
 * Les tracés sont ceux de `LayoutShell` (cœur = bénéficiaire, silhouette = aidant) :
 * le même rôle garde le même signe partout dans l'application, et une deuxième
 * convention visuelle pour la même idée serait un piège.
 *
 * L'icône porte le rôle, elle n'est pas décorative : elle est donc annoncée
 * (`role="img"` + `aria-label`). Sans cela, une lectrice d'écran n'entendrait que
 * deux noms, sans savoir lequel est qui — exactement le problème que l'icône résout
 * à l'œil.
 *
 * Le SVG reste **inline** — surtout pas `inline-flex` : les lignes qui l'accueillent
 * sont en `text-overflow: ellipsis`, et un élément atomique y perdrait son « … ».
 */
type PersonKind = 'assistant' | 'beneficiary'

const props = defineProps<{ kind: PersonKind }>()

const PATHS: Record<PersonKind, string> = {
  assistant: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  beneficiary: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
}

/** Libellés français : c'est ce qu'entend une lectrice d'écran, et l'infobulle. */
const LABELS: Record<PersonKind, string> = {
  assistant: 'Aidant',
  beneficiary: 'Bénéficiaire',
}
</script>

<template>
  <svg
    class="size-3 shrink-0 align-middle"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    :aria-label="LABELS[props.kind]"
  >
    <title>{{ LABELS[props.kind] }}</title>
    <path :d="PATHS[props.kind]" />
  </svg>
</template>
