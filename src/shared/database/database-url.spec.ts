import { resolveDatabaseUrl } from './database-url';

const urls = {
  DATABASE_URL: 'postgresql://valora:valora@localhost:5432/valora_dev',
  DATABASE_URL_TEST: 'postgresql://valora:valora@localhost:5432/valora_test',
};

describe('base de datos según el entorno', () => {
  it('en desarrollo usa DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ ...urls, NODE_ENV: 'development' })).toBe(urls.DATABASE_URL);
  });

  it('en pruebas usa DATABASE_URL_TEST', () => {
    expect(resolveDatabaseUrl({ ...urls, NODE_ENV: 'test' })).toBe(urls.DATABASE_URL_TEST);
  });

  it('en pruebas se niega a usar una base cuyo nombre no termina en _test', () => {
    const pointingToDev = { ...urls, NODE_ENV: 'test', DATABASE_URL_TEST: urls.DATABASE_URL };

    expect(() => resolveDatabaseUrl(pointingToDev)).toThrow(
      'Las pruebas solo pueden usar una base cuyo nombre termine en _test (recibida: valora_dev).',
    );
  });
});
