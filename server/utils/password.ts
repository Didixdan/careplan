import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

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

/**
 * Alphabet SANS caractères ambigus : ni `0`/`O`, ni `1`/`I`/`l`, ni `o`.
 *
 * Un mot de passe est transmis à la voix ou recopié à la main — le projet n'envoie aucun email
 * (docs/decisions.md §2). « 0 » confondu avec « O » est alors un échec de connexion que personne
 * ne comprend. 56 caractères sur 16 positions ≈ 93 bits : largement au-delà du nécessaire.
 */
export const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Mot de passe aléatoire, à afficher UNE fois et à transmettre : rien ne le stocke en clair, et
 * rien ne permet de le relire.
 *
 * `randomInt` (et non `Math.random`) : un générateur prévisible pour un mot de passe n'est pas un
 * mot de passe. `randomInt` évite en plus le biais du modulo sur un alphabet non puissance de deux.
 */
export function generatePassword(length = 16): string {
  return Array.from(
    { length },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]!,
  ).join('')
}
