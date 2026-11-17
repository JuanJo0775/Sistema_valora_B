import { validateEnv } from './env.validation';

const validEnv = {
  PORT: '3000',
  DATABASE_URL: 'postgresql://valora:valora@localhost:5432/valora_dev',
  DATABASE_URL_TEST: 'postgresql://valora:valora@localhost:5432/valora_test',
  SESSION_SECRET: 'secreto-de-ejemplo',
  REPORTER_KEY_SECRET: 'otro-secreto-de-ejemplo',
  NODE_ENV: 'development',
  OUTBOX_POLL_INTERVAL_MS: '5000',
  OUTBOX_MAX_ATTEMPTS: '5',
  MEDIA_DIR: 'media',
  MEDIA_PUBLIC_URL: 'http://localhost:3000/media',
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

describe('validateEnv con las variables del repartidor de eventos', () => {
  it('convierte el intervalo y los intentos a números', () => {
    const env = validateEnv(validEnv);

    expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(5000);
    expect(env.OUTBOX_MAX_ATTEMPTS).toBe(5);
  });

  it.each(['OUTBOX_POLL_INTERVAL_MS', 'OUTBOX_MAX_ATTEMPTS'])(
    'falla si %s falta o no es un entero mayor que cero',
    (variable) => {
      expect(() => validateEnv({ ...validEnv, [variable]: undefined })).toThrow(variable);
      expect(() => validateEnv({ ...validEnv, [variable]: '0' })).toThrow(variable);
    },
  );
});

describe('validateEnv con NODE_ENV inválido', () => {
  it('rechaza un entorno que no sea development, test o production', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('validateEnv con el secreto de la clave del reportante (#31)', () => {
  it('falla con un mensaje que nombra REPORTER_KEY_SECRET si falta', () => {
    expect(() => validateEnv({ ...validEnv, REPORTER_KEY_SECRET: undefined })).toThrow(
      /REPORTER_KEY_SECRET/,
    );
  });
});

describe('validateEnv con la carpeta de fotos (ADR-020, #88)', () => {
  it.each(['MEDIA_DIR', 'MEDIA_PUBLIC_URL'])('falla si %s falta', (variable) => {
    expect(() => validateEnv({ ...validEnv, [variable]: undefined })).toThrow(variable);
  });
});

describe('validateEnv con TRUST_PROXY (ADR-012: Vercel y Render delante de la API)', () => {
  it('es opcional y vale 0 (sin proxy) cuando falta', () => {
    expect(validateEnv(validEnv).TRUST_PROXY).toBe(0);
  });

  it('convierte los saltos de proxy a número', () => {
    expect(validateEnv({ ...validEnv, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
  });

  it.each(['-1', '6', 'si'])('rechaza TRUST_PROXY=%p', (valor) => {
    expect(() => validateEnv({ ...validEnv, TRUST_PROXY: valor })).toThrow(/TRUST_PROXY/);
  });
});

describe('validateEnv con Supabase Storage (ADR-022)', () => {
  it('sin SUPABASE_URL las fotos siguen en la carpeta local', () => {
    const env = validateEnv(validEnv);

    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_BUCKET).toBe('productos');
  });

  it('con SUPABASE_URL exige la clave secreta', () => {
    const conUrl = { ...validEnv, SUPABASE_URL: 'https://abc123.supabase.co' };

    expect(() => validateEnv(conUrl)).toThrow(/SUPABASE_SECRET_KEY/);
    expect(validateEnv({ ...conUrl, SUPABASE_SECRET_KEY: 'clave-x' }).SUPABASE_URL).toBe(
      'https://abc123.supabase.co',
    );
  });

  it('SUPABASE_URL debe ser una dirección https', () => {
    expect(() =>
      validateEnv({ ...validEnv, SUPABASE_URL: 'ftp://x', SUPABASE_SECRET_KEY: 'k' }),
    ).toThrow(/SUPABASE_URL/);
  });
});
