export interface DatabaseEnv {
  NODE_ENV: string;
  DATABASE_URL: string;
  DATABASE_URL_TEST: string;
}

const TEST_DATABASE_SUFFIX = '_test';

// Nombre de la base al final de la URL: postgresql://usuario:clave@host:puerto/<base>
export function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

// Grill de la #42, pregunta 4: con NODE_ENV=test se usa DATABASE_URL_TEST, y solo si es una base de pruebas.
export function resolveDatabaseUrl(env: DatabaseEnv): string {
  if (env.NODE_ENV !== 'test') return env.DATABASE_URL;

  const name = databaseNameOf(env.DATABASE_URL_TEST);
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Las pruebas solo pueden usar una base cuyo nombre termine en ${TEST_DATABASE_SUFFIX} (recibida: ${name}).`,
    );
  }
  return env.DATABASE_URL_TEST;
}
