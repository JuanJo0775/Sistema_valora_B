import { resolveDatabaseUrl } from './database-url';

const urls = {
  DATABASE_URL: 'postgresql://valora:valora@localhost:5432/valora_dev',
  DATABASE_URL_TEST: 'postgresql://valora:valora@localhost:5432/valora_test',
};

describe('base de datos según el entorno', () => {
  it('en desarrollo usa DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ ...urls, NODE_ENV: 'development' })).toBe(urls.DATABASE_URL);
  });
});
