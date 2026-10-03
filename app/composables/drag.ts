import type { Appointment } from '~~/shared/types/planning'
import { applyMove } from '~~/app/utils/appointments'
import { conflictingIds } from '~~/app/utils/conflicts'
import { durationInMinutes } from '~~/app/utils/duration'
import { isDragGesture } from '~~/app/utils/gesture'
import { GRID_START_MINUTES, GRID_END_MINUTES, minutesToTime, pxToMinutes } from '~~/app/utils/grid'

export interface GhostPosition {
  date: string
  start: string
  end: string
}

/**
 * État du glisser-déposer d'un créneau, partagé entre la grille et les créneaux.
 * Le déplacement est suivi globalement (pointermove/up sur `window`) pour permettre
 * de franchir les colonnes (changement de jour) en vue semaine.
 *
 * Le même geste sert à deux choses, distinguées par `isDragGesture` : un appui sans
 * déplacement SÉLECTIONNE le créneau (sa fiche s'ouvre), un appui qui bouge le DÉPLACE.
 *
 * `appointments` est la référence ÉCRIVABLE de la liste affichée : le déplacement y
 * est appliqué localement, sans relire le serveur (voir `releaseDrag`).
 */
export function useAppointmentDrag(appointments: Ref<Appointment[] | undefined>, refresh: () => Promise<void>) {
  const canEdit = useCanEditAppointments()
  const draggedAppointment = ref<Appointment | null>(null)
  const selectedAppointment = ref<Appointment | null>(null)
  const ghostPosition = ref<GhostPosition | null>(null)
  const hasConflict = ref(false)

  let offsetPx = 0
  let dragging = false
  /** Appui en cours, pas encore qualifié : ni tap, ni glisser. */
  let pressed: Appointment | null = null
  /** Le seuil a été franchi : c'est un vrai glisser. */
  let armed = false
  let originX = 0
  let originY = 0

  function startDrag(appointment: Appointment, event: PointerEvent) {
    if (dragging) return
    dragging = true
    armed = false
    pressed = appointment
    originX = event.clientX
    originY = event.clientY

    const target = event.currentTarget as HTMLElement
    offsetPx = event.clientY - target.getBoundingClientRect().top

    // La carte porte `@pointerdown.prevent` (pour ne pas sélectionner le texte pendant le
    // geste), ce qui supprime le focus que le navigateur donne d'ordinaire à l'appui. Sans lui,
    // la modale ouverte par un tap n'a plus d'élément déclencheur à qui RENDRE le focus : Échap
    // la referme en laissant le focus sur `<body>`, et la personne perd sa place.
    target.focus()

    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', releaseDrag)
  }

  function moveDrag(event: PointerEvent) {
    const appointment = pressed
    if (!appointment) return

    if (!armed) {
      if (!isDragGesture({ x: originX, y: originY }, { x: event.clientX, y: event.clientY })) return

      armed = true
      draggedAppointment.value = appointment
      // Le créneau quitte sa place : la fiche ouverte ne décrit plus rien de vrai.
      selectedAppointment.value = null
    }

    const element = document.elementFromPoint(event.clientX, event.clientY)
    const grid = element?.closest('[data-grid]') as HTMLElement | null
    const date = grid?.dataset.date

    if (!grid || !date) {
      ghostPosition.value = null
      hasConflict.value = false
      return
    }

    const rect = grid.getBoundingClientRect()
    const startMinutes = pxToMinutes(event.clientY - rect.top - offsetPx)
    const duration = durationInMinutes(appointment.start, appointment.end) ?? 0
    const endMinutes = startMinutes + duration

    if (startMinutes < GRID_START_MINUTES || endMinutes > GRID_END_MINUTES) {
      ghostPosition.value = null
      hasConflict.value = false
      return
    }

    const start = minutesToTime(startMinutes)
    const end = minutesToTime(endMinutes)
    ghostPosition.value = { date, start, end }
    hasConflict.value = conflictsAt(appointment, date, start, end)
  }

  /**
   * Aperçu du conflit. Il applique la MÊME règle que le serveur (`conflictingIds`) : une
   * règle écrite deux fois finit par diverger, et l'aperçu mentirait.
   *
   * Limite connue : la vue jour ne charge que le jour affiché, donc un créneau de nuit de
   * la veille lui est invisible. Le serveur, lui, regarde J-1 … J+1 et reste la référence ;
   * un refus (409) resynchronise l'affichage.
   */
  function conflictsAt(appointment: Appointment, date: string, start: string, end: string): boolean {
    const assistantIds = [appointment.primaryAssistantId, ...appointment.coAssistantIds]
    const others = (appointments.value ?? [])
      .filter(other => other.id !== appointment.id)
      .map(other => ({
        id: other.id,
        date: other.date,
        start: other.start,
        end: other.end,
        assistantIds: [other.primaryAssistantId, ...other.coAssistantIds],
      }))

    return conflictingIds({ date, start, end, assistantIds }, others).length > 0
  }

  async function releaseDrag() {
    window.removeEventListener('pointermove', moveDrag)
    window.removeEventListener('pointerup', releaseDrag)

    const appointment = pressed
    const position = ghostPosition.value
    const conflict = hasConflict.value
    const wasDragging = armed

    dragging = false
    armed = false
    pressed = null
    draggedAppointment.value = null
    ghostPosition.value = null
    hasConflict.value = false

    if (!appointment) return

    // Appui sans déplacement : c'est une sélection, pas un déplacement. Un lecteur n'a rien
    // à ouvrir : sa carte n'est pas activable (même règle que `tabindex`), et le tap ne fait
    // donc rien plutôt que d'ouvrir un formulaire qu'il n'a pas le droit d'envoyer.
    if (!wasDragging) {
      if (canEdit.value) selectedAppointment.value = appointment
      return
    }

    if (!position || conflict) return

    const { date, start, end } = position

    // Déplacement optimiste : la carte se pose immédiatement là où elle a été lâchée.
    // Recharger la liste depuis le serveur ferait disparaître la grille le temps de la
    // requête, ce qui remettrait le défilement à zéro.
    const list = appointments.value
    if (list) appointments.value = applyMove(list, appointment.id, position)

    try {
      await $fetch(`/api/appointments/${appointment.id}`, {
        method: 'PUT',
        body: { date, start, end },
      })
    }
    catch {
      // Refus du serveur (403, 409…) : l'affichage optimiste est faux, on resynchronise.
      await refresh()
    }
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', moveDrag)
    window.removeEventListener('pointerup', releaseDrag)
  })

  return { draggedAppointment, selectedAppointment, ghostPosition, hasConflict, startDrag }
}
