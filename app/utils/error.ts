/** Extrait un message lisible d'une erreur de `$fetch` (NuxtError / H3), avec repli. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) return data.statusMessage
  }
  if (error instanceof Error && error.message) return error.message
  return ''
}
