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

describe('validateEnv con variables faltantes', () => {
  it('falla con un mensaje que nombra la variable que falta', () => {
    const sinDatabaseUrl = { ...validEnv, DATABASE_URL: undefined };

    expect(() => validateEnv(sinDatabaseUrl)).toThrow(/DATABASE_URL/);
  });
});

describe('validateEnv con PORT fuera de rango', () => {
  it.each(['', '0', '65536'])('rechaza PORT=%p porque no es un puerto entre 1 y 65535', (port) => {
    expect(() => validateEnv({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });
});

describe('validateEnv con NODE_ENV inválido', () => {
  it('rechaza un entorno que no sea development, test o production', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
