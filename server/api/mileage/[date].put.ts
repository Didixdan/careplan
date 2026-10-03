import { setMileage } from '../../services/mileage'
import { requireWriter } from '../../utils/auth'

/**
 * Déclare (ou efface) les kilomètres d'un aidant pour un jour — la seule écriture de cette
 * fonctionnalité, et elle est idempotente : l'index unique (aidant, date) fait qu'une seconde
 * déclaration remplace la première.
 *
 * Une valeur à zéro efface la ligne. Un aidant ne peut écrire que pour lui-même : son
 * identifiant vient de la session, jamais du corps de la requête.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriter(event)
  const date = getRouterParam(event, 'date') ?? ''
  const body = await readBody<{ assistantId?: string, kilometers?: number | string | null }>(event)

  const assistantId = user.role === 'admin' ? body?.assistantId : user.assistantId
  if (!assistantId) {
    throw createError({ statusCode: 400, statusMessage: 'Paramètre `assistantId` requis.' })
  }

  // Absent ou vide : c'est un zéro, donc un effacement. Le service refuse le reste.
  await setMileage(date, assistantId, Number(body?.kilometers ?? 0), user)

  return { ok: true }
})
