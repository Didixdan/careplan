import type { Appointment, Status } from '~~/shared/types/planning'
import { applyStatus } from '~~/app/utils/appointments'

/**
 * Changement de statut en action rapide, appliqué de façon OPTIMISTE.
 *
 * Même leçon que le glisser-déposer : la carte se met à jour immédiatement, sans relire le
 * serveur — une relecture ferait clignoter la grille et remettrait le défilement à zéro.
 *
 * Les créneaux en vol sont retenus : sans ce verrou, un double-tap enchaînerait deux
 * transitions. Depuis « à vérifier », le premier appui passe en planifié et les boutons
 * deviennent « réalisé / annulé » : le second appui, au même endroit, validerait le passage
 * sans que personne ne l'ait demandé.
 */
export function useAppointmentStatus(
  appointments: Ref<Appointment[] | undefined>,
  refresh: () => Promise<void>,
) {
  const inFlight = ref<string[]>([])

  function isStatusPending(id: string): boolean {
    return inFlight.value.includes(id)
  }

  async function changeStatus(appointment: Appointment, status: Status): Promise<void> {
    if (isStatusPending(appointment.id)) return

    // Déplacement optimiste, comme au dépôt d'un glisser : la carte change d'état tout de
    // suite. La liste est REMPLACÉE (`useAsyncData` est superficiel), sinon rien ne bouge.
    const list = appointments.value
    if (list) appointments.value = applyStatus(list, appointment.id, status)
    inFlight.value = [...inFlight.value, appointment.id]

    try {
      await $fetch(`/api/appointments/${appointment.id}/status`, {
        method: 'PATCH',
        body: { status: status },
      })
    }
    catch {
      // Refus du serveur (403, 409…) : l'affichage optimiste est faux, on resynchronise.
      await refresh()
    }
    finally {
      inFlight.value = inFlight.value.filter(id => id !== appointment.id)
    }
  }

  return { changeStatus, isStatusPending }
}
