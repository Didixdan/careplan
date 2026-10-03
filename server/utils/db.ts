import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

let client: ReturnType<typeof postgres> | null = null

function getClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL absente : copier .env.example en .env.')
  }
  client ??= postgres(url)
  return client
}

/** Instance Drizzle sur un client Postgres unique et paresseux. */
export function useDb() {
  return drizzle(getClient(), { schema })
}

/** Ferme le pool — utilisé par les scripts autonomes (seed) qui doivent se terminer. */
export async function closeDb() {
  await client?.end()
  client = null
}
