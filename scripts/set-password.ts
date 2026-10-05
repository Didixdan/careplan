import { loadEnvFile } from 'node:process'
import { eq } from 'drizzle-orm'
import { users } from '../server/db/schema'
import { closeDb, useDb } from '../server/utils/db'
import { generatePassword, scryptHash } from '../server/utils/password'

/**
 * Repose le mot de passe d'un compte.
 *
 * Le projet n'envoie **aucun email** : l'administrateur crée les comptes et transmet les mots de
 * passe lui-même ([`docs/decisions.md`](../docs/decisions.md) §2). Ce script est donc le seul
 * chemin pour en reposer un — sans lui, il fallait hacher à la main puis écrire du SQL.
 *
 * Usage :
 *   pnpm user:password <email>                 génère un mot de passe, l'enregistre, l'affiche
 *   pnpm user:password <email> <motdepasse>    enregistre celui-ci (déjà connu de la personne)
 *
 * Le hachage est celui de l'application (`scryptHash`, `server/utils/password.ts`) : un mot de
 * passe posé ici se vérifie à la connexion comme tous les autres. L'email est normalisé comme à la
 * connexion (espaces retirés, minuscules), sans quoi « Admin@… » ne trouverait aucun compte.
 *
 * Aucune longueur minimale n'est imposée : la politique de mot de passe est un choix de
 * l'administrateur, et un refus ici ne ferait que pousser à contourner le script.
 */

try {
  loadEnvFile('.env')
}
catch {
  // `.env` absent : DATABASE_URL viendra de l'environnement.
}

const USAGE = 'Usage : pnpm user:password <email> [motdepasse]'

/**
 * Contexte affiché avant l'écriture : on ne veut pas reposer un mot de passe de production en
 * croyant viser la base locale. Les identifiants, eux, ne sont jamais affichés.
 */
function databaseLabel(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`
  }
  catch {
    return 'DATABASE_URL illisible'
  }
}

async function setPassword(email: string, provided?: string): Promise<void> {
  const password = provided === undefined || provided === '' ? generatePassword() : provided
  const db = useDb()

  console.log(`\n  → Base : ${databaseLabel()}`)

  // `users.email` est UNIQUE : la mise à jour touche zéro ou une ligne, jamais plusieurs.
  const updated = await db
    .update(users)
    .set({ hashedPassword: scryptHash(password) })
    .where(eq(users.email, email))
    .returning({ role: users.role })

  const account = updated[0]
  if (!account) {
    // Pas de liste des comptes existants : ce script ne doit pas devenir un annuaire.
    throw new Error(`Aucun compte avec l'email « ${email} ».`)
  }

  console.log(`\n  ✓ Mot de passe changé pour ${email} (rôle ${account.role}).`)

  if (provided === undefined || provided === '') {
    // Affiché UNE fois : rien ne garde ce mot de passe en clair, donc rien ne permettra de le relire.
    console.log(`\n  Nouveau mot de passe : ${password}\n`)
    console.log('  Transmettez-le maintenant : il ne sera plus affiché.\n')
  }
}

async function main() {
  const [rawEmail, provided] = process.argv.slice(2)
  const email = rawEmail?.trim().toLowerCase()

  if (!email) {
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  try {
    await setPassword(email, provided)
  }
  catch (error) {
    console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
  finally {
    await closeDb()
  }
}

await main()
