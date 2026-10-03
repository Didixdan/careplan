/**
 * Réserve un écran de gestion à l'administrateur.
 *
 * Le serveur refuse déjà ces lectures et ces écritures (403) : ce garde ferme l'ÉCRAN, pour
 * qu'un aidant qui tape l'adresse ne découvre pas un formulaire qu'il ne pourra pas enregistrer.
 * La navigation ne montre ces entrées qu'à l'administrateur — une adresse tapée à la main, elle,
 * ne passe par aucun menu.
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value) return navigateTo('/login')
  if (user.value?.role !== 'admin') return navigateTo('/')
})
