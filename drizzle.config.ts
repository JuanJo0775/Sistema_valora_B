import { defineConfig } from 'drizzle-kit';

// ADR-021: cada módulo define sus tablas en infrastructure/schema.ts; las migraciones van en una sola
// carpeta (drizzle/) para toda la base (grill de la #42, pregunta 2).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/infrastructure/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
