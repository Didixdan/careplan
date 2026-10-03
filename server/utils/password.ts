import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Hachage scrypt autonome (indépendant de Nuxt) : utilisable par le seed (tsx) ET par
// la couche d'authentification. Format auto-suffisant `salt:hash` en hexadécimal.
export function scryptHash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function scryptVerify(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false

  const expected = Buffer.from(hash, 'hex')
  const provided = scryptSync(password, salt, expected.length)

  return expected.length === provided.length && timingSafeEqual(expected, provided)
}
