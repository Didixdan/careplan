<script setup lang="ts">
// Un état vide doit dire ce qui manque et proposer l'action probable, pas constater une
// absence (« Aucune donnée »).
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <div class="empty-state">
    <p class="empty-state__title">
      {{ title }}
    </p>
    <p
      v-if="text"
      class="empty-state__text"
    >
      {{ text }}
    </p>
    <div
      v-if="$slots.action"
      class="empty-state__actions"
    >
      <slot name="action" />
    </div>
  </div>
</template>
