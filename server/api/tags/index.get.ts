import { listTags } from '../../services/tags'
import { requireWriter } from '../../utils/auth'

/**
 * Catalogue des tags, avec le nombre de créneaux qui les portent.
 *
 * Ouvert à l'administration ET aux aidants : le formulaire d'un créneau en a besoin pour son
 * autocomplete. Un lecteur, lui, ne remplit aucun formulaire — même règle que
 * `/api/appointments/options`.
 */
export default defineEventHandler(async (event) => {
  await requireWriter(event)
  return listTags()
})
