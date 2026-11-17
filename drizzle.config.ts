import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit no lee .env por sí mismo; en la CI las variables ya vienen del entorno.
if (existsSync('.env')) process.loadEnvFile('.env');

// ADR-021: cada módulo define sus tablas en infrastructure/schema.ts; las migraciones van en una sola
// carpeta (drizzle/) para toda la base (grill de la #42, pregunta 2).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/infrastructure/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
