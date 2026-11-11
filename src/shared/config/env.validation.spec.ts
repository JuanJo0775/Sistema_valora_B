import { validateEnv } from './env.validation';

const validEnv = {
  PORT: '3000',
  DATABASE_URL: 'postgresql://valora:valora@localhost:5432/valora_dev',
  DATABASE_URL_TEST: 'postgresql://valora:valora@localhost:5432/valora_test',
  SESSION_SECRET: 'secreto-de-ejemplo',
  NODE_ENV: 'development',
};

describe('validateEnv', () => {
  it('devuelve la configuración con el puerto como número', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });
});
