import type { MileageEntry } from '~~/shared/types/planning'
import { formatKilometers, kilometersFromInput } from '~~/app/utils/mileage'

/**
 * Kilomètres déclarés du jour : brouillon local, enregistrement à la validation, et verrou par
 * champ.
 *
 * Le brouillon vit ICI, pas dans l'écran : c'est le seul endroit qui sait si une écriture a
 * réussi (le champ garde alors ce qui a été envoyé) ou échoué (il revient à ce que le serveur
 * connaît). Afficher un nombre que le serveur n'a pas est exactement ce qu'il ne faut pas faire
 * sur un relevé de kilomètres.
 *
 * L'écriture est optimiste, comme le déplacement d'un créneau : la liste est mise à jour
 * localement, et on ne relit le serveur qu'en cas d'échec. Une relecture systématique
 * écraserait la saisie en cours dans le champ voisin.
 */
export function useMileage(referenceDate: Ref<string>) {
  const api = useRequestFetch()

  const { data: entries, error, isLoading, refresh } = useLoading(
    () => `mileage-${referenceDate.value}`,
    () => api<MileageEntry[]>('/api/mileage', { query: { date: referenceDate.value } }),
    [referenceDate],
  )

  const drafts = ref<Record<string, string>>({})
  const inFlight = ref<string[]>([])
  const failure = ref('')

  function isPending(assistantId: string): boolean {
    return inFlight.value.includes(assistantId)
  }

  function kilometersOf(assistantId: string): number | null {
    return entries.value?.find(entry => entry.assistantId === assistantId)?.kilometers ?? null
  }

  /**
   * Le texte du champ : le brouillon s'il existe, sinon ce que le serveur connaît.
   *
   * Le repli n'est pas une coquetterie : un `watch` qui remplirait les brouillons à l'arrivée
   * des données ne s'exécute pas avant le rendu serveur, et le champ s'affichait vide alors
   * qu'une valeur était déclarée. Calculer à la lecture supprime le problème — et le watch.
   */
  function draftOf(assistantId: string): string {
    return drafts.value[assistantId] ?? formatKilometers(kilometersOf(assistantId))
  }

  function setDraft(assistantId: string, value: string): void {
    drafts.value = { ...drafts.value, [assistantId]: value }
  }

  /** Oublie le brouillon : le champ reprend la valeur du serveur. */
  function clearDraft(assistantId: string): void {
    // On reconstruit sans la clé plutôt que de la supprimer : la reconstruction remplace
    // l'objet, ce qui déclenche la réactivité sans `delete` sur une clé calculée.
    drafts.value = Object.fromEntries(
      Object.entries(drafts.value).filter(([id]) => id !== assistantId),
    )
  }

  /** Remplace la liste par une version modifiée : `useAsyncData` est superficiel. */
  function applyLocally(assistantId: string, assistantName: string, kilometers: number): void {
    const others = (entries.value ?? []).filter(entry => entry.assistantId !== assistantId)

    entries.value = kilometers === 0
      ? others
      : [...others, { date: referenceDate.value, assistantId, assistantName, kilometers }]
  }

  /**
   * Enregistre ce que contient le champ. Une saisie illisible n'est PAS envoyée : elle est
   * signalée, et le champ revient à ce que le serveur connaît.
   */
  async function save(assistantId: string, assistantName: string): Promise<void> {
    if (isPending(assistantId)) return

    // Champ vidé : c'est un EFFACEMENT du relevé, pas une saisie illisible. Le serveur reçoit 0,
    // qu'il interprète comme « rien de déclaré » (même règle que `PUT /api/mileage/:date`) : sans
    // cette distinction, vider le champ laissait le relevé en place et le compteur du mois faux.
    const draft = draftOf(assistantId).trim()
    const kilometers = draft === '' ? 0 : kilometersFromInput(draft)

    if (kilometers === null) {
      failure.value = 'Kilomètres illisibles : un nombre, par exemple 12,5.'
      clearDraft(assistantId)
      return
    }

    failure.value = ''
    inFlight.value = [...inFlight.value, assistantId]

    try {
      await api(`/api/mileage/${referenceDate.value}`, {
        method: 'PUT',
        body: { assistantId, kilometers },
      })
      applyLocally(assistantId, assistantName, kilometers)
      // Le champ reprend la forme canonique : « 12,50 » tapé devient « 12,5 ». Un effacement,
      // lui, rend la main au serveur : le champ reste vide.
      if (kilometers === 0) clearDraft(assistantId)
      else setDraft(assistantId, formatKilometers(kilometers))
    }
    catch {
      // Refus du serveur : l'affichage optimiste est faux, on resynchronise.
      failure.value = 'Kilomètres non enregistrés.'
      clearDraft(assistantId)
      await refresh()
    }
    finally {
      inFlight.value = inFlight.value.filter(id => id !== assistantId)
    }
  }

  return { entries, error, isLoading, failure, isPending, kilometersOf, draftOf, setDraft, save, refresh }
}
