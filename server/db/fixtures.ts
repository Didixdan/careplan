import type { AssistantColor } from '../../app/utils/colors'
import { addDays, startOfWeek } from '../../app/utils/date'
import type { Status } from '../../shared/types/planning'

/**
 * Données de référence (fixtures) : une seule source pour le seed local ET les tests.
 * Les entités sont identifiées par un `slug` stable ; les identifiants réels (uuid)
 * sont attribués par la base au moment du seed. Les créneaux portent volontairement
 * les cas qui cassent une vue mal conçue : passage de minuit, une journée vide, des
 * chevauchements, les quatre statuts, et un co-assistant.
 */

export interface AssistantReference {
  slug: string
  firstName: string
  lastName: string
  color: AssistantColor
  email: string
  contractedMinutes: number | null
}

export interface BeneficiaryReference {
  slug: string
  firstName: string
  lastName: string
  /**
   * Taux horaire en centimes, comme en base. `null` est un cas à part entière : c'est lui qui
   * fait écrire « À saisir » dans l'export CESU, donc le jeu de données doit en garder un.
   */
  hourlyRateCents: number | null
}

export const assistantFixtures: AssistantReference[] = [
  { slug: 'camille', firstName: 'Camille', lastName: 'Roussel', color: 'assistant-5', email: 'camille@careplan.local', contractedMinutes: 30 * 60 },
  { slug: 'sofia', firstName: 'Sofia', lastName: 'Lambert', color: 'assistant-3', email: 'sofia@careplan.local', contractedMinutes: 24 * 60 },
  { slug: 'nadia', firstName: 'Nadia', lastName: 'Benali', color: 'assistant-6', email: 'nadia@careplan.local', contractedMinutes: 20 * 60 },
  { slug: 'yves', firstName: 'Yves', lastName: 'Marchand', color: 'assistant-1', email: 'yves@careplan.local', contractedMinutes: 12 * 60 },
]

export const beneficiaryFixtures: BeneficiaryReference[] = [
  { slug: 'dupont', firstName: 'Élise', lastName: 'Dupont', hourlyRateCents: 1650 },
  { slug: 'bernard', firstName: 'Robert', lastName: 'Bernard', hourlyRateCents: 1550 },
  { slug: 'petit', firstName: 'Lucie', lastName: 'Petit', hourlyRateCents: null },
]

/** Modèle d'un créneau : références par slug, statut en anglais. */
type Model = {
  day: number
  start: string
  end: string
  title: string
  beneficiary: string
  primaryAssistant: string
  status: Status
  coAssistants?: string[]
}

const MODELS: Model[] = [
  { day: 0, start: '08:00', end: '10:00', title: 'Aide à la toilette et habillage', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'completed' },
  { day: 0, start: '11:30', end: '13:00', title: 'Courses et préparation du repas', beneficiary: 'bernard', primaryAssistant: 'sofia', status: 'completed' },
  { day: 0, start: '14:00', end: '14:30', title: 'Passage court, traitement', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'to_validate' },
  { day: 0, start: '17:00', end: '19:30', title: 'Aide au dîner et coucher', beneficiary: 'bernard', primaryAssistant: 'nadia', status: 'planned' },

  { day: 1, start: '07:30', end: '09:00', title: 'Lever et petit-déjeuner', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 1, start: '10:00', end: '12:00', title: 'Ménage et linge', beneficiary: 'petit', primaryAssistant: 'sofia', status: 'planned' },
  // Chevauchement volontaire avec le créneau de 10:00.
  { day: 1, start: '11:00', end: '12:30', title: 'Accompagnement sortie', beneficiary: 'bernard', primaryAssistant: 'nadia', status: 'planned' },
  { day: 1, start: '18:00', end: '20:00', title: 'Préparation du dîner', beneficiary: 'petit', primaryAssistant: 'yves', status: 'planned' },

  { day: 2, start: '08:00', end: '09:30', title: 'Aide à la toilette', beneficiary: 'bernard', primaryAssistant: 'camille', status: 'planned' },
  { day: 2, start: '09:00', end: '11:00', title: 'Courses', beneficiary: 'dupont', primaryAssistant: 'sofia', status: 'cancelled' },
  { day: 2, start: '15:00', end: '16:30', title: 'Compagnie et lecture', beneficiary: 'petit', primaryAssistant: 'nadia', status: 'planned' },

  // Long créneau avec un co-assistant : exercice du binôme et de l'affichage.
  { day: 3, start: '08:00', end: '12:00', title: 'Garde de jour étendue', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned', coAssistants: ['nadia'] },
  { day: 3, start: '13:00', end: '14:00', title: 'Repas', beneficiary: 'bernard', primaryAssistant: 'yves', status: 'planned' },
  // Créneau de nuit : début après la fin, la durée doit rester correcte.
  { day: 3, start: '22:00', end: '01:00', title: 'Veille de nuit', beneficiary: 'petit', primaryAssistant: 'nadia', status: 'planned' },

  { day: 4, start: '09:00', end: '11:30', title: 'Aide à la toilette et ménage', beneficiary: 'bernard', primaryAssistant: 'sofia', status: 'planned' },
  { day: 4, start: '12:00', end: '13:00', title: 'Déjeuner', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 4, start: '16:00', end: '18:00', title: 'Accompagnement administratif', beneficiary: 'petit', primaryAssistant: 'yves', status: 'to_validate' },

  // Le samedi (index 5) est volontairement vide : la vue semaine doit gérer une colonne
  // sans créneau.

  { day: 6, start: '09:00', end: '11:00', title: 'Aide à la toilette et au lever', beneficiary: 'petit', primaryAssistant: 'sofia', status: 'completed' },
  { day: 6, start: '11:30', end: '12:30', title: 'Préparation du déjeuner', beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 6, start: '15:00', end: '17:00', title: 'Promenade et compagnie', beneficiary: 'bernard', primaryAssistant: 'yves', status: 'planned' },
]

export interface AppointmentReference {
  id: string
  date: string
  start: string
  end: string
  title: string
  beneficiarySlug: string
  primaryAssistantSlug: string
  status: Status
  coAssistantSlugs: string[]
}

export function buildAppointments(reference: string): AppointmentReference[] {
  const monday = startOfWeek(reference)

  return MODELS.map((model, index) => ({
    id: `demo-${index}`,
    date: addDays(monday, model.day),
    start: model.start,
    end: model.end,
    title: model.title,
    beneficiarySlug: model.beneficiary,
    primaryAssistantSlug: model.primaryAssistant,
    status: model.status,
    coAssistantSlugs: model.coAssistants ?? [],
  }))
}
