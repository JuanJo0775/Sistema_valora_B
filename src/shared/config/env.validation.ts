export interface Env {
  PORT: number;
  DATABASE_URL: string;
  DATABASE_URL_TEST: string;
  SESSION_SECRET: string;
  NODE_ENV: string;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  return {
    PORT: Number(raw['PORT']),
    DATABASE_URL: raw['DATABASE_URL'] as string,
    DATABASE_URL_TEST: raw['DATABASE_URL_TEST'] as string,
    SESSION_SECRET: raw['SESSION_SECRET'] as string,
    NODE_ENV: raw['NODE_ENV'] as string,
  };
}
