// La date de référence est partagée entre la vue jour et la vue semaine : passer de l'une
// à l'autre doit conserver le jour consulté. `useState` (et non un `ref`) la sérialise côté
// serveur, pour un rendu SSR cohérent avec le client.

export function usePlanning() {
  const referenceDate = useState<string>('planning-date-reference', () => today())

  function goToToday() {
    referenceDate.value = today()
  }

  return { referenceDate, goToToday }
}

/**
 * L'utilisateur connecté peut-il écrire un créneau ?
 *
 * Règle unique : l'admin peut tout ; l'aidant les siens, et le serveur ne lui montre que
 * les siens ; le lecteur rien.
 *
 * Elle est nommée ICI parce que deux chemins en dépendent — la carte (clavier) et le tap
 * (glisser-déposer). Deux copies d'une même règle finissent par se contredire, et la
 * contradiction se voit à l'écran, pas dans un test.
 */
export function useCanEditAppointments() {
  const { user } = useUserSession()

  return computed(() => user.value?.role !== 'viewer')
}
