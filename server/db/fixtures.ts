import type { AssistantColor } from '../../app/utils/colors'
import { addDays, startOfWeek } from '../../app/utils/date'
import { tagKey } from '../../app/utils/tags'
import type { Status } from '../../shared/types/planning'

/**
 * Données de référence (fixtures) : une seule source pour le seed local ET les tests.
 * Les entités sont identifiées par un `slug` stable ; les identifiants réels (uuid)
 * sont attribués par la base au moment du seed. Les créneaux portent volontairement
 * les cas qui cassent une vue mal conçue : passage de minuit, une journée vide, des
 * chevauchements, les quatre statuts, un co-assistant, et un créneau à quatre tags (pour que
 * la règle « trois tags affichés, puis +N » soit visible à l'écran).
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
  /**
   * Teinte du rail droit du calendrier, ou `null` pour « aucun marquage ». Le cas `null` est
   * volontairement présent : sans lui, la vue qui ne pose pas de rail ne serait exercée nulle
   * part, et une couleur inventée passerait inaperçue.
   */
  color: AssistantColor | null
}

export const assistantFixtures: AssistantReference[] = [
  { slug: 'damien', firstName: 'Damien', lastName: 'Martin', color: 'assistant-5', email: 'damien.martin@careplan.local', contractedMinutes: 30 * 60 },
  { slug: 'camille', firstName: 'Camille', lastName: 'Roussel', color: 'assistant-5', email: 'camille@careplan.local', contractedMinutes: 30 * 60 },
  { slug: 'sofia', firstName: 'Sofia', lastName: 'Lambert', color: 'assistant-3', email: 'sofia@careplan.local', contractedMinutes: 24 * 60 },
  { slug: 'nadia', firstName: 'Nadia', lastName: 'Benali', color: 'assistant-6', email: 'nadia@careplan.local', contractedMinutes: 20 * 60 },
  { slug: 'yves', firstName: 'Yves', lastName: 'Marchand', color: 'assistant-1', email: 'yves@careplan.local', contractedMinutes: 12 * 60 },
]

export const beneficiaryFixtures: BeneficiaryReference[] = [
  { slug: 'dupont', firstName: 'Élise', lastName: 'Dupont', hourlyRateCents: 1650, color: 'assistant-6' },
  { slug: 'bernard', firstName: 'Robert', lastName: 'Bernard', hourlyRateCents: 1550, color: 'assistant-2' },
  // Sans couleur, à dessein : c'est le cas « aucun marquage ».
  { slug: 'petit', firstName: 'Lucie', lastName: 'Petit', hourlyRateCents: null, color: null },
]

/** Modèle d'un créneau : références par slug, tags par NOM, statut en anglais. */
type Model = {
  day: number
  start: string
  end: string
  /** Au moins un tag, comme l'exige l'application : ces libellés remplacent l'ancien intitulé. */
  tags: string[]
  beneficiary: string
  primaryAssistant: string
  status: Status
  coAssistants?: string[]
}

const MODELS: Model[] = [
  { day: 0, start: '08:00', end: '10:00', tags: ['Aide à la toilette', 'Habillage'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'completed' },
  { day: 0, start: '11:30', end: '13:00', tags: ['Courses', 'Préparation du repas'], beneficiary: 'bernard', primaryAssistant: 'sofia', status: 'completed' },
  { day: 0, start: '14:00', end: '14:30', tags: ['Traitement et prise de médicaments'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'to_validate' },
  { day: 0, start: '17:00', end: '19:30', tags: ['Préparation du repas', 'Coucher'], beneficiary: 'bernard', primaryAssistant: 'damien', status: 'planned' },

  { day: 1, start: '07:30', end: '09:00', tags: ['Lever', 'Aide à la toilette'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 1, start: '10:00', end: '12:00', tags: ['Ménage et linge'], beneficiary: 'petit', primaryAssistant: 'sofia', status: 'planned' },
  // Chevauchement volontaire avec le créneau de 10:00.
  { day: 1, start: '11:00', end: '12:30', tags: ['Accompagnement sortie'], beneficiary: 'bernard', primaryAssistant: 'nadia', status: 'planned' },
  { day: 1, start: '18:00', end: '20:00', tags: ['Préparation du repas'], beneficiary: 'petit', primaryAssistant: 'yves', status: 'planned' },

  { day: 2, start: '08:00', end: '09:30', tags: ['Aide à la toilette'], beneficiary: 'bernard', primaryAssistant: 'camille', status: 'planned' },
  { day: 2, start: '09:00', end: '11:00', tags: ['Courses'], beneficiary: 'dupont', primaryAssistant: 'sofia', status: 'cancelled' },
  { day: 2, start: '15:00', end: '16:30', tags: ['Compagnie et lecture'], beneficiary: 'petit', primaryAssistant: 'nadia', status: 'planned' },

  // Long créneau avec un co-assistant ET quatre tags : l'écran n'en montre que trois, puis « +N ».
  { day: 3, start: '08:00', end: '12:00', tags: ['Aide à la toilette', 'Habillage', 'Ménage et linge', 'Préparation du repas'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned', coAssistants: ['nadia'] },
  { day: 3, start: '13:00', end: '14:00', tags: ['Préparation du repas'], beneficiary: 'bernard', primaryAssistant: 'yves', status: 'planned' },
  // Créneau de nuit : début après la fin, la durée doit rester correcte.
  { day: 3, start: '22:00', end: '01:00', tags: ['Veille de nuit'], beneficiary: 'petit', primaryAssistant: 'nadia', status: 'planned' },

  { day: 4, start: '09:00', end: '11:30', tags: ['Aide à la toilette', 'Ménage et linge'], beneficiary: 'bernard', primaryAssistant: 'sofia', status: 'planned' },
  { day: 4, start: '12:00', end: '13:00', tags: ['Préparation du repas'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 4, start: '16:00', end: '18:00', tags: ['Accompagnement administratif'], beneficiary: 'petit', primaryAssistant: 'damien', status: 'to_validate' },

  // Le samedi (index 5) est volontairement vide : la vue semaine doit gérer une colonne
  // sans créneau.

  { day: 6, start: '09:00', end: '11:00', tags: ['Aide à la toilette', 'Lever'], beneficiary: 'petit', primaryAssistant: 'sofia', status: 'completed' },
  { day: 6, start: '11:30', end: '12:30', tags: ['Préparation du repas'], beneficiary: 'dupont', primaryAssistant: 'camille', status: 'planned' },
  { day: 6, start: '15:00', end: '17:00', tags: ['Accompagnement sortie', 'Compagnie et lecture'], beneficiary: 'bernard', primaryAssistant: 'nadia', status: 'planned' },
]

export interface AppointmentReference {
  id: string
  date: string
  start: string
  end: string
  tags: string[]
  beneficiarySlug: string
  primaryAssistantSlug: string
  status: Status
  coAssistantSlugs: string[]
}

/**
 * Le vocabulaire de démonstration : les tags distincts des modèles.
 *
 * La clé de dédoublonnage est celle de l'application (`tagKey`) : deux modèles qui écriraient
 * « Courses » et « courses » ne produiraient qu'un tag, exactement comme à l'écran.
 */
export function buildTags(): string[] {
  const byKey = new Map<string, string>()

  for (const model of MODELS) {
    for (const tag of model.tags) {
      const key = tagKey(tag)
      if (!byKey.has(key)) byKey.set(key, tag)
    }
  }

  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'fr'))
}

export function buildAppointments(reference: string): AppointmentReference[] {
  const monday = startOfWeek(reference)

  return MODELS.map((model, index) => ({
    id: `demo-${index}`,
    date: addDays(monday, model.day),
    start: model.start,
    end: model.end,
    tags: model.tags,
    beneficiarySlug: model.beneficiary,
    primaryAssistantSlug: model.primaryAssistant,
    status: model.status,
    coAssistantSlugs: model.coAssistants ?? [],
  }))
}
