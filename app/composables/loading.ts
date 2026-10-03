import type { Ref, WatchSource } from 'vue'

/**
 * Chargement de données avec état d'erreur explicite.
 *
 * Rôle : qu'une panne de lecture produise un MESSAGE VISIBLE, jamais un écran vide
 * sans explication. C'est la différence entre une application qu'on peut
 * diagnostiquer et une application qu'on ne peut qu'ouvrir dans une console.
 *
 * On ne réinvente rien : `useAsyncData` de Nuxt fournit déjà le cache, le
 * dédoublonnage et la sérialisation SSR. Ce composable lui donne une signature
 * unique, pour que le branchement de la base n'ait qu'UN point à modifier dans
 * toute l'application.
 *
 * @param key          Clé de cache Nuxt, unique par écran et par paramètre. Passer une
 *                     fonction pour que la clé suive un paramètre réactif (ex. la date).
 * @param load         Fonction de lecture. Ses exceptions sont capturées.
 * @param watchSources Sources réactives qui déclenchent une relecture.
 */
export function useLoading<T>(
  key: string | (() => string),
  load: () => T | Promise<T>,
  watchSources: WatchSource[] = [],
): {
  data: Ref<T | undefined>
  error: Ref<Error | null>
  isLoading: Ref<boolean>
  refresh: () => Promise<void>
} {
  const { data, error, pending, refresh } = useAsyncData<T>(
    key,
    async () => await load(),
    { watch: watchSources },
  )

  // Sert pour afficher le squelette
  const isLoading = computed(() => pending.value && data.value === undefined)

  return {
    // Le type de `useAsyncData` porte un conditionnel (`pick`) que TypeScript ne
    // réduit pas pour un `T` générique : le cast rétablit le contrat, il ne le force pas.
    data: data as Ref<T | undefined>,
    error: error as Ref<Error | null>,
    isLoading,
    refresh: async () => {
      await refresh()
    },
  }
}
