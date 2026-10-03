import { defineConfig } from 'drizzle-kit'

// drizzle-kit lit `.env` depuis le répertoire courant : `DATABASE_URL` y est disponible.
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
