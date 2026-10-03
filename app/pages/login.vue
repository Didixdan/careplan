<script setup lang="ts">
const email = ref('')
const password = ref('')
const hasError = ref(false)
const dragging = ref(false)

const { fetch: refreshSession } = useUserSession()

async function login() {
  dragging.value = true
  hasError.value = false
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    // Le login pose un cookie côté serveur : on resynchronise l'état de session
    // côté client, sinon le middleware global croit toujours l'utilisateur déconnecté.
    await refreshSession()
    await navigateTo('/')
  }
  catch {
    hasError.value = true
  }
  finally {
    dragging.value = false
  }
}

useHead({ title: 'CarePlan — connexion' })
</script>

<template>
  <div class="container-app flex min-h-[70dvh] items-center justify-center py-10">
    <form
      class="card w-full max-w-sm"
      @submit.prevent="login"
    >
      <div class="card__body flex flex-col gap-4">
        <h1>Connexion</h1>

        <div class="field">
          <label
            class="field__label"
            for="email"
          >Email</label>
          <input
            id="email"
            v-model="email"
            class="field__control"
            type="email"
            autocomplete="username"
            required
          >
        </div>

        <div class="field">
          <label
            class="field__label"
            for="password"
          >Mot de passe</label>
          <input
            id="password"
            v-model="password"
            class="field__control"
            type="password"
            autocomplete="current-password"
            required
          >
        </div>

        <p
          v-if="hasError"
          class="field__error"
        >
          Identifiants invalides.
        </p>

        <UiButton
          type="submit"
          :loading="dragging"
          block
        >
          Se connecter
        </UiButton>
      </div>
    </form>
  </div>
</template>
