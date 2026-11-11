export interface DatabaseEnv {
  NODE_ENV: string;
  DATABASE_URL: string;
  DATABASE_URL_TEST: string;
}

export function resolveDatabaseUrl(env: DatabaseEnv): string {
  return env.DATABASE_URL;
}
