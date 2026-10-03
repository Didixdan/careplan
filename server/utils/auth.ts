/** Exige une session et le rôle `admin` ; lève sinon. Retourne l'utilisateur connecté. */
export async function requireAdmin(event: Parameters<typeof requireUserSession>[0]) {
  const { user } = await requireUserSession(event)

  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'administrateur.' })
  }

  return user
}

/**
 * Exige une session d'écriture : l'administrateur ou un aidant.
 *
 * Sert aux exports, qui sont des documents de gestion — un aidant exporte les siens, un
 * lecteur n'en produit aucun : la famille REÇOIT le message hebdomadaire, elle ne génère ni
 * un fichier de paie ni un relevé d'heures.
 */
export async function requireWriter(event: Parameters<typeof requireUserSession>[0]) {
  const { user } = await requireUserSession(event)

  if (user.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'administrateur et aux aidants.' })
  }

  return user
}
