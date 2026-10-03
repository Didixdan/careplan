<script setup lang="ts">
/**
 * Écran de contrôle du design system : rend vérifiable ce que la charte promet — les
 * fontes, les chiffres alignés, les huit couleurs d'aidant, les badges, un squelette et un
 * état vide. Aucun métier.
 */
const isLoading = ref(false)
const assistantName = ref('')
const selectedColor = ref<AssistantColor>('assistant-4')

// Le thème vient de la coquille applicative (cookie) : cette page ne fait que le refléter.
const { isDark } = useTheme()

useHead({ title: 'CarePlan — design system' })

async function simulate() {
  isLoading.value = true
  await new Promise(resolve => setTimeout(resolve, 1400))
  isLoading.value = false
}
</script>

<template>
  <div class="container-app flex flex-col gap-7 py-5">
    <!--
      TÉMOIN DE SCAN — ne pas remove, vérifié par `pnpm verify:css`.
      La valeur arbitraire `13.5px` est unique dans tout le projet : la classe
      `p-[13.5px]` ne peut donc être générée QUE si Tailwind a scanné ce template.
    -->
    <span
      class="hidden p-[13.5px]"
      aria-hidden="true"
    />

    <!-- En-tête -->
    <section class="section">
      <div class="section__header">
        <h1>Fondation</h1>
        <span
          class="badge badge--neutral"
          aria-hidden="true"
        >{{ isDark ? 'Thème dark' : 'Thème clair' }}</span>
      </div>
      <p>
        Anton sur les titres, Instrument Sans partout ailleurs, Space Grotesk pour
        les chiffres. Les neutres sont chauds, les ombres réservées à ce qui flotte
        réellement, et les rayons signalent la taille des éléments.
      </p>
      <div class="badge-group">
        <UiBadge
          tone="primary"
          dot
        >
          Nuxt 4
        </UiBadge>
        <UiBadge
          tone="success"
          dot
        >
          Tailwind 4
        </UiBadge>
        <UiBadge
          tone="accent"
          dot
        >
          SCSS + @apply
        </UiBadge>
        <UiBadge tone="neutral">
          Mobile-first
        </UiBadge>
      </div>
    </section>

    <!-- Typographie -->
    <section class="section">
      <p class="eyebrow">
        Typographie
      </p>
      <UiCard>
        <div class="card__body flex flex-col gap-4">
          <div>
            <p class="eyebrow mb-1.5">
              Anton — h1 et h2
            </p>
            <h2>Planning de la semaine</h2>
            <p class="field__hint mt-1">
              Capitales assumées : Anton est dessinée pour la capitale, et ses
              minuscules accentuées percutent les ascendantes.
            </p>
          </div>
          <div class="border-t border-line pt-4">
            <p class="eyebrow mb-1.5">
              Instrument Sans — body et h3/h4
            </p>
            <h3>Aide à la toilette, Mme Dupont</h3>
            <p class="mt-1 text-sm">
              Corps de text, libellés, boutons. C'est la fonte qui porte la
              lecture courante, avec ses accents français propres.
            </p>
          </div>
          <div class="border-t border-line pt-4">
            <p class="eyebrow mb-1.5">
              Space Grotesk — chiffres
            </p>
            <div class="flex flex-col gap-1">
              <p class="num text-2xl font-medium text-ink">
                12 h 30
              </p>
              <p class="num text-sm text-ink-muted">
                1 h 45 · 3 h 00 · 0 h 30
              </p>
            </div>
            <p class="field__hint mt-1">
              Chiffres tabulaires : les colonnes d'heures s'alignent verticalement.
            </p>
          </div>
        </div>
      </UiCard>
    </section>

    <!-- Couleurs d'aidant -->
    <section class="section">
      <p class="eyebrow">
        Couleurs d'aidant
      </p>
      <p class="text-sm text-ink-muted">
        Huit teintes, identifiées par un nom en base. La couleur ne porte jamais
        seule l'information : le nom de l'aidant est toujours écrit à côté.
      </p>
      <div class="grid-ref">
        <div
          v-for="color in ASSISTANT_COLORS"
          :key="color"
          class="card card--railed"
          :style="{ borderLeftColor: `var(--color-${color})` }"
        >
          <div class="card__body flex items-center gap-3 !py-2.5">
            <span
              class="size-3.5 shrink-0 rounded-tag"
              :style="{ backgroundColor: `var(--color-${color})` }"
              aria-hidden="true"
            />
            <span class="text-sm font-medium text-ink">{{ ASSISTANT_COLOR_LABELS[color] }}</span>
            <span class="num ml-auto text-xs text-ink-muted">{{ color }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Badges, dans les deux thèmes -->
    <section class="section">
      <p class="eyebrow">
        Statuss — clair et dark côte à côte
      </p>
      <p class="text-sm text-ink-muted">
        Les deux thèmes sont rendus simultanément : c'est la comparaison qui
        compte. Chaque couple encre/fond doit atteindre 4,5:1 dans les deux sens.
      </p>
      <div class="grid-ref">
        <div class="card">
          <div class="card__header">
            <p class="card__title">
              Thème clair
            </p>
          </div>
          <div class="card__body flex flex-wrap gap-1.5 pt-0">
            <span class="badge badge--neutral">Neutre</span>
            <span class="badge badge--primary">Planifié</span>
            <span class="badge badge--accent">Nouveau</span>
            <span class="badge badge--success">Réalisé</span>
            <span class="badge badge--warning">En retard</span>
            <span class="badge badge--danger">Annulé</span>
          </div>
          <div class="card__body flex flex-wrap gap-1.5 pt-0">
            <span class="badge badge--primary badge--solid">Planifié</span>
            <span class="badge badge--success badge--solid">Réalisé</span>
            <span class="badge badge--danger badge--solid">Annulé</span>
          </div>
        </div>

        <!-- La classe .dark s'applique localement : les deux rendus coexistent. -->
        <div class="dark rounded-card bg-canvas p-2">
          <div class="card">
            <div class="card__header">
              <p class="card__title">
                Thème dark
              </p>
            </div>
            <div class="card__body flex flex-wrap gap-1.5 pt-0">
              <span class="badge badge--neutral">Neutre</span>
              <span class="badge badge--primary">Planifié</span>
              <span class="badge badge--accent">Nouveau</span>
              <span class="badge badge--success">Réalisé</span>
              <span class="badge badge--warning">En retard</span>
              <span class="badge badge--danger">Annulé</span>
            </div>
            <div class="card__body flex flex-wrap gap-1.5 pt-0">
              <span class="badge badge--primary badge--solid">Planifié</span>
              <span class="badge badge--success badge--solid">Réalisé</span>
              <span class="badge badge--danger badge--solid">Annulé</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Rayons et ombres -->
    <section class="section">
      <p class="eyebrow">
        Rayons et élévation
      </p>
      <div class="grid-ref">
        <div class="card">
          <div class="card__header">
            <p class="card__title">
              Le rayon signale la taille
            </p>
          </div>
          <div class="card__body flex flex-col gap-2.5 pt-0">
            <div class="flex items-center gap-3">
              <span class="rounded-tag border border-line-strong bg-surface-muted px-2 py-0.5 text-xs">tag</span>
              <span class="text-xs text-ink-muted">2 px — étiquettes, pastilles</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="rounded-field border border-line-strong bg-surface-muted px-2.5 py-1 text-xs">field</span>
              <span class="text-xs text-ink-muted">6 px — champs, boutons</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="rounded-card border border-line-strong bg-surface-muted px-3 py-1.5 text-xs">card</span>
              <span class="text-xs text-ink-muted">10 px — cartes, panneaux</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__header">
            <p class="card__title">
              Une ombre = quelque chose qui flotte
            </p>
          </div>
          <div class="card__body flex flex-col gap-3 pt-0">
            <div class="rounded-field border border-line bg-surface px-3 py-2">
              <p class="text-sm text-ink-soft">
                Card posée — bordure seule
              </p>
            </div>
            <div class="shadow-float rounded-field border border-line bg-surface px-3 py-2">
              <p class="text-sm text-ink-soft">
                Menu déroulant — <code>shadow-float</code>
              </p>
            </div>
            <div class="shadow-overlay rounded-card border border-line bg-surface px-3 py-2">
              <p class="text-sm text-ink-soft">
                Dialogue — <code>shadow-overlay</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Buttons -->
    <section class="section">
      <p class="eyebrow">
        Buttons
      </p>
      <UiCard>
        <div class="card__body flex flex-wrap gap-2">
          <UiButton variant="primary">
            Ajouter un créneau
          </UiButton>
          <UiButton variant="secondary">
            Annuler
          </UiButton>
          <UiButton variant="accent">
            Valider les heures
          </UiButton>
          <UiButton variant="ghost">
            Ignorer
          </UiButton>
          <UiButton variant="danger">
            Supprimer
          </UiButton>
        </div>
        <div class="card__body flex flex-wrap items-center gap-2 pt-0">
          <UiButton
            size="sm"
            variant="secondary"
          >
            Petit
          </UiButton>
          <UiButton
            size="md"
            variant="secondary"
          >
            Moyen
          </UiButton>
          <UiButton
            size="lg"
            variant="secondary"
          >
            Grand
          </UiButton>
          <UiButton
            :loading="isLoading"
            @click="simulate"
          >
            {{ isLoading ? 'Enregistrement' : 'Simuler un chargement' }}
          </UiButton>
          <UiButton
            variant="secondary"
            disabled
          >
            Désactivé
          </UiButton>
        </div>
      </UiCard>
    </section>

    <!-- Champs -->
    <section class="section">
      <p class="eyebrow">
        Champs
      </p>
      <UiCard>
        <div class="card__body flex flex-col gap-4">
          <div class="field">
            <label
              class="field__label field__label--required"
              for="assistant"
            >Nom de l'aidant</label>
            <input
              id="assistant"
              v-model="assistantName"
              class="field__control"
              type="text"
              placeholder="Prénom Nom"
            >
            <p class="field__hint">
              L'aidant ne verra que son propre planning.
            </p>
          </div>

          <div class="field">
            <label
              class="field__label"
              for="color"
            >Couleur d'aidant</label>
            <div class="couleur-select">
              <select
                id="color"
                v-model="selectedColor"
                aria-label="Couleur d'aidant"
              >
                <option
                  v-for="color in ASSISTANT_COLORS"
                  :key="color"
                  :value="color"
                >
                  {{ ASSISTANT_COLOR_LABELS[color] }}
                </option>
              </select>
              <span class="couleur-select__display">
                <span
                  class="couleur-select__swatch"
                  :style="{ backgroundColor: `var(--color-${selectedColor})` }"
                  aria-hidden="true"
                />
                {{ ASSISTANT_COLOR_LABELS[selectedColor] }}
              </span>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label
                class="field__label"
                for="start"
              >Début</label>
              <input
                id="start"
                class="field__control"
                type="time"
                value="08:00"
              >
            </div>
            <div class="field">
              <label
                class="field__label"
                for="end"
              >Fin</label>
              <input
                id="end"
                class="field__control"
                type="time"
                value="10:00"
              >
            </div>
          </div>

          <div class="field">
            <label
              class="field__label"
              for="err"
            >Champ en erreur</label>
            <input
              id="err"
              class="field__control"
              type="text"
              aria-invalid="true"
              value="Valeur invalide"
            >
            <p class="field__error">
              Ce créneau chevauche un créneau existant.
            </p>
          </div>
        </div>
      </UiCard>
    </section>

    <!-- Carte-créneau et états -->
    <section class="section">
      <p class="eyebrow">
        Créneau, loading, état vide
      </p>

      <UiCard
        railed
        :style="{ borderLeftColor: 'var(--color-assistant-4)' }"
      >
        <div class="card__body flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="card__title truncate">
              Mme Dupont — aide à la toilette
            </p>
            <p class="card__subtitle">
              Lundi <span class="num">08:00</span> → <span class="num">10:00</span>
              · <span class="num font-medium text-ink">2 h 00</span>
            </p>
            <p class="mt-1 text-xs text-ink-muted">
              Camille R.
            </p>
          </div>
          <UiBadge tone="success">
            Réalisé
          </UiBadge>
        </div>
      </UiCard>

      <UiCard
        railed
        class="mt-3"
        :style="{ borderLeftColor: 'var(--color-assistant-6)' }"
      >
        <div class="card__body flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="card__title truncate">
              M. Bernard — courses et repas
            </p>
            <p class="card__subtitle">
              Lundi <span class="num">11:30</span> → <span class="num">13:00</span>
              · <span class="num font-medium text-ink">1 h 30</span>
            </p>
            <p class="mt-1 text-xs text-ink-muted">
              Sofia L.
            </p>
          </div>
          <UiBadge tone="warning">
            En retard
          </UiBadge>
        </div>
      </UiCard>

      <div class="mt-4">
        <p class="eyebrow mb-2">
          Chargement — squelette
        </p>
        <UiSkeleton :blocks="2" />
      </div>

      <div class="mt-4">
        <UiEmptyState
          title="Rien de prévu cette semaine"
          text="Le planning de la semaine prochaine est vide. Reprendre les créneaux récurrents évite de tout ressaisir."
        >
          <template #action>
            <UiButton variant="primary">
              Copier la semaine précédente
            </UiButton>
            <UiButton variant="ghost">
              Créer un créneau
            </UiButton>
          </template>
        </UiEmptyState>
      </div>
    </section>

    <!-- Réactivité -->
    <section
      v-if="assistantName"
      class="section"
    >
      <UiCard muted>
        <div class="card__body flex items-center justify-between gap-3 !py-2.5">
          <p class="text-sm text-ink-muted">
            Réactivité Vue vérifiée
          </p>
          <p class="text-sm font-semibold text-ink">
            {{ assistantName }}
          </p>
        </div>
      </UiCard>
    </section>
  </div>
</template>
