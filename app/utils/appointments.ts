import type { Appointment, Status } from '~~/shared/types/planning'

/** Position cible d'un déplacement : date civile et heures `'HH:MM'`. */
export interface AppointmentPosition {
  date: string
  start: string
  end: string
}

/**
 * Renvoie une NOUVELLE liste où le créneau `id` reçoit `changes`.
 *
 * La liste est **remplacée**, jamais mutée par index : `useAsyncData` renvoie une
 * référence superficielle (`experimental.defaults.useAsyncData.deep = false` dans
 * Nuxt 4), donc une écriture `list[i] = …` ne déclencherait aucun rendu — la
 * modification resterait invisible jusqu'à la prochaine relecture du serveur.
 *
 * Les créneaux non visés sont réutilisés tels quels ; un `id` absent laisse donc
 * le contenu identique.
 */
function changed(
  list: Appointment[],
  id: string,
  changes: Partial<Appointment>,
): Appointment[] {
  return list.map(item => (item.id === id ? { ...item, ...changes } : item))
}

/** Déplace un créneau dans la liste affichée, sans relire le serveur. */
export function applyMove(
  list: Appointment[],
  id: string,
  position: AppointmentPosition,
): Appointment[] {
  return changed(list, id, position)
}

/**
 * Change le statut d'un créneau dans la liste affichée, sans relire le serveur.
 *
 * Même invariant que `applyMove` : une nouvelle liste, sinon la carte ne se redessinerait
 * pas — et ici, ce serait pire qu'un défaut d'affichage : les boutons d'action rapide ne
 * changeraient pas, et l'utilisateur cliquerait deux fois sur la même transition.
 */
export function applyStatus(
  list: Appointment[],
  id: string,
  status: Status,
): Appointment[] {
  return changed(list, id, { status })
}
