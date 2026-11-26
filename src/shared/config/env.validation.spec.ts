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

describe('validateEnv con el correo de verificación (ADR-029)', () => {
  const conResend = {
    ...validEnv,
    EMAIL_PROVIDER: 'resend',
    EMAIL_API_KEY: 're_clave-de-prueba',
    EMAIL_FROM: 'Valora <no-responder@valora.example>',
    APP_URL: 'https://valora.example',
  };

  it('por defecto el correo va a la consola y no pide nada más', () => {
    const env = validateEnv(validEnv);

    expect(env.EMAIL_PROVIDER).toBe('console');
    expect(env.EMAIL_API_KEY).toBeUndefined();
  });

  it('con resend acepta la configuración completa', () => {
    const env = validateEnv(conResend);

    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.APP_URL).toBe('https://valora.example');
  });

  it.each(['EMAIL_API_KEY', 'EMAIL_FROM', 'APP_URL'])('con resend exige %s', (name) => {
    expect(() => validateEnv({ ...conResend, [name]: undefined })).toThrow(new RegExp(name));
  });

  it('rechaza un proveedor desconocido', () => {
    expect(() => validateEnv({ ...validEnv, EMAIL_PROVIDER: 'otro' })).toThrow(/EMAIL_PROVIDER/);
  });

  it('APP_URL, si se da, debe ser una dirección http o https', () => {
    expect(() => validateEnv({ ...validEnv, APP_URL: 'ftp://x' })).toThrow(/APP_URL/);
    expect(validateEnv({ ...validEnv, APP_URL: 'http://localhost:5173' }).APP_URL).toBe(
      'http://localhost:5173',
    );
  });
});

describe('validateEnv con REQUIRE_VERIFIED_EMAIL (ADR-029)', () => {
  const produccion = { ...validEnv, NODE_ENV: 'production' };

  it('por defecto es true y acepta true y false como texto', () => {
    expect(validateEnv(validEnv).REQUIRE_VERIFIED_EMAIL).toBe(true);
    expect(
      validateEnv({ ...validEnv, REQUIRE_VERIFIED_EMAIL: 'false' }).REQUIRE_VERIFIED_EMAIL,
    ).toBe(false);
    expect(
      validateEnv({ ...validEnv, REQUIRE_VERIFIED_EMAIL: 'true' }).REQUIRE_VERIFIED_EMAIL,
    ).toBe(true);
  });

  it('rechaza un valor que no es booleano', () => {
    expect(() => validateEnv({ ...validEnv, REQUIRE_VERIFIED_EMAIL: 'quizas' })).toThrow(
      /REQUIRE_VERIFIED_EMAIL/,
    );
  });

  it('en producción, exigir la verificación con EMAIL_PROVIDER=console no arranca', () => {
    expect(() => validateEnv(produccion)).toThrow(/REQUIRE_VERIFIED_EMAIL/);
  });

  it('en producción arranca si no se exige la verificación, o si hay un proveedor real', () => {
    expect(() => validateEnv({ ...produccion, REQUIRE_VERIFIED_EMAIL: 'false' })).not.toThrow();
    expect(() =>
      validateEnv({
        ...produccion,
        EMAIL_PROVIDER: 'resend',
        EMAIL_API_KEY: 're_x',
        EMAIL_FROM: 'Valora <a@valora.example>',
        APP_URL: 'https://valora.example',
      }),
    ).not.toThrow();
  });
});

describe('validateEnv con el inicio de sesión con Google (ADR-029, fase 2)', () => {
  const google = {
    GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'GOCSPX-secreto-de-ejemplo',
    GOOGLE_REDIRECT_URI: 'https://www.valoora.app/v1/auth/google/callback',
  };

  it('sin ninguna variable de Google la API arranca y el inicio con Google queda apagado', () => {
    const env = validateEnv(validEnv);

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('con las tres variables acepta la configuración', () => {
    const env = validateEnv({ ...validEnv, ...google });

    expect(env.GOOGLE_REDIRECT_URI).toBe(google.GOOGLE_REDIRECT_URI);
  });

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'])(
    'si falta %s y están las otras, no arranca y nombra la que falta',
    (missing) => {
      expect(() => validateEnv({ ...validEnv, ...google, [missing]: undefined })).toThrow(
        new RegExp(missing),
      );
    },
  );

  // #182: un panel como el de Render puede dejar una variable creada pero vacía. Vacía es ausente: la API
  // arranca con Google apagado en lugar de caerse.
  it('las variables de Google vacías cuentan como ausentes', () => {
    const env = validateEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '  ',
      GOOGLE_REDIRECT_URI: '',
    });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.GOOGLE_REDIRECT_URI).toBeUndefined();
  });

  it('GOOGLE_REDIRECT_URI debe ser una dirección http o https', () => {
    expect(() =>
      validateEnv({ ...validEnv, ...google, GOOGLE_REDIRECT_URI: 'no-es-una-url' }),
    ).toThrow(/GOOGLE_REDIRECT_URI/);
  });
});

describe('validateEnv con los avisos push (ADR-044, ADR-045)', () => {
  it('por defecto los avisos van a la consola y no piden claves', () => {
    const env = validateEnv(validEnv);

    expect(env.PUSH_PROVIDER).toBe('console');
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
  });
});
