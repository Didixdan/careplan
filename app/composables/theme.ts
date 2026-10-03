// Cookie et non `localStorage` : `localStorage` n'est lisible que par le navigateur, le
// serveur enverrait donc toujours la même classe et le thème dark provoquerait un flash
// blanc au chargement. Le cookie, lui, est transmis à chaque requête.
//
// La classe `.dark` sur `<html>` est posée par `app.vue` via `useHead` (rendue côté
// serveur, donc sans flash). Ce composable ne porte que l'état du thème.

const COOKIE_NAME = 'careplan-theme'
const ONE_YEAR_DURATION = 60 * 60 * 24 * 365

export type Theme = 'clair' | 'dark'

export function useTheme() {
  const theme = useCookie<Theme>(COOKIE_NAME, {
    default: () => 'clair',
    maxAge: ONE_YEAR_DURATION,
    sameSite: 'lax',
    path: '/',
  })

  const isDark = computed(() => theme.value === 'dark')

  function toggle() {
    theme.value = isDark.value ? 'clair' : 'dark'
  }

  return { isDark, toggle }
}
