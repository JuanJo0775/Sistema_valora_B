// Prueba de humo (RNF-009): recorre por HTTP el camino completo de Valora contra una API encendida,
// con los datos de la semilla. Responde «¿está todo conectado?», que las pruebas automáticas no
// cubren porque cada una vacía sus tablas.
//
//   pnpm smoke                    recorrido completo (crea cuentas y precios de prueba)
//   pnpm smoke -- --solo-lectura  solo consultas públicas (para el sistema desplegado)
//
// Variables: SMOKE_URL (por defecto http://localhost:3000). Para probar la moderación:
// SMOKE_MODERATOR_EMAIL y SMOKE_MODERATOR_PASSWORD de una cuenta moderadora. Registrar precios exige el
// correo verificado (ADR-029): para el recorrido completo, SMOKE_REPORTER_EMAIL y
// SMOKE_REPORTER_PASSWORD de una cuenta reportante ya verificada; sin ellas, la cuenta nueva que crea la
// prueba recibe 403 EMAIL_NOT_VERIFIED al reportar.

const BASE = `${(process.env['SMOKE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '')}/v1`;
const READ_ONLY = process.argv.includes('--solo-lectura');
// Centro de Armenia: la semilla trae sus tiendas.
const CENTER = { lat: '4.5339', lng: '-75.6811' };
// La entrega del outbox tarda unos segundos (OUTBOX_POLL_INTERVAL_MS).
const WAIT_MS = 45_000;

type Json = Record<string, unknown>;

// El texto de un campo de la respuesta, o '' si no es texto.
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

interface Session {
  cookie: string;
  csrf: string;
}

interface Reply {
  status: number;
  body: Json;
}

const results: { step: string; ok: boolean; detail: string }[] = [];

function record(step: string, ok: boolean, detail = ''): void {
  results.push({ step, ok, detail });
  process.stdout.write(`${ok ? '  ✔' : '  ✘'} ${step}${detail ? ` — ${detail}` : ''}\n`);
}

async function call(
  method: string,
  path: string,
  options: { session?: Session; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply & { headers: Headers }> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.session) {
    headers['Cookie'] = options.session.cookie;
    if (method !== 'GET') headers['X-CSRF-Token'] = options.session.csrf;
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const raw = await response.text();
  const body = (raw ? JSON.parse(raw) : {}) as Json;
  return { status: response.status, body, headers: response.headers };
}

const items = (body: Json): Json[] =>
  Array.isArray(body['items']) ? (body['items'] as Json[]) : [];

async function waitFor(check: () => Promise<boolean>): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

async function signIn(email: string, password: string, register: boolean): Promise<Session | null> {
  if (register) {
    const created = await call('POST', '/auth/register', {
      body: { email, displayName: 'Prueba de Humo', password, acceptedPolicyVersion: '2026-11' },
    });
    if (created.status !== 201) return null;
  }
  const login = await call('POST', '/auth/login', { body: { email, password } });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  if (login.status !== 204 || !cookie) return null;
  const session = await call('GET', '/auth/session', { session: { cookie, csrf: '' } });
  return { cookie, csrf: text(session.body['csrfToken']) };
}

async function main(): Promise<void> {
  process.stdout.write(`Prueba de humo contra ${BASE}${READ_ONLY ? ' (solo lectura)' : ''}\n\n`);

  // 1. Consultas públicas.
  const health = await call('GET', '/health');
  record('La API responde', health.status === 200 && health.body['status'] === 'ok');

  const search = await call('GET', '/products?q=banano');
  const product = items(search.body)[0];
  const presentations = (product?.['presentations'] ?? []) as Json[];
  const presentationId = text(presentations[0]?.['id']);
  const productId = text(product?.['id']);
  record(
    'La búsqueda encuentra un producto de la semilla',
    search.status === 200 && productId !== '' && presentationId !== '',
    productId ? String(product?.['name']) : '¿se corrió pnpm db:seed?',
  );

  const nearby = await call(
    'GET',
    `/establishments/nearby?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=3`,
  );
  const store = items(nearby.body)[0];
  const storeId = text(store?.['id']);
  record(
    'Hay tiendas cerca del centro de Armenia',
    nearby.status === 200 && storeId !== '',
    storeId
      ? `${String(store?.['name'])} (${String(store?.['municipality'])})`
      : '¿se corrió pnpm db:seed?',
  );

  if (productId) {
    const detail = await call('GET', `/products/${productId}`);
    record('El detalle del producto responde', detail.status === 200);
    const history = await call('GET', `/products/${productId}/history`);
    record('El historial responde', history.status === 200);
    const byMunicipality = await call(
      'GET',
      `/products/${productId}/comparison?municipality=armenia`,
    );
    record('La comparación por municipio responde sin ubicación', byMunicipality.status === 200);
    if (byMunicipality.body['wholesaleReference']) {
      record('La referencia SIPSA sale aparte en la comparación', true);
    } else {
      process.stdout.write(
        '  · Sin referencia SIPSA vigente para este producto (no es un error).\n',
      );
    }
  }

  if (READ_ONLY || !productId || !storeId) return;

  // 2. Un reportante registra un precio.
  const stamp = Date.now();
  const password = 'clave-de-humo-larga';
  const reporterEmail = process.env['SMOKE_REPORTER_EMAIL'];
  const reporterPassword = process.env['SMOKE_REPORTER_PASSWORD'];
  const author =
    reporterEmail && reporterPassword
      ? await signIn(reporterEmail, reporterPassword, false)
      : await signIn(`humo-${String(stamp)}-a@valora.test`, password, true);
  const flagger = await signIn(`humo-${String(stamp)}-b@valora.test`, password, true);
  record('Dos reportantes se registran e inician sesión', author !== null && flagger !== null);
  if (!author || !flagger) return;

  const key = crypto.randomUUID();
  const report = {
    presentationId,
    establishmentId: storeId,
    priceCop: 1450,
    observedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  };
  const sent = await call('POST', '/reports', {
    session: author,
    body: report,
    headers: { 'Idempotency-Key': key },
  });
  const reportId = text(sent.body['id']);
  record(
    'El reporte se recibe (201)',
    sent.status === 201 && reportId !== '',
    `status ${String(sent.status)}`,
  );
  const retry = await call('POST', '/reports', {
    session: author,
    body: report,
    headers: { 'Idempotency-Key': key },
  });
  record(
    'El reintento con la misma clave no duplica (200)',
    retry.status === 200 && retry.body['id'] === reportId,
  );
  const duplicate = await call('POST', '/reports', {
    session: author,
    body: { ...report, priceCop: 1500 },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
  record(
    'Otro reporte de lo mismo en la misma hora se rechaza y dice desde cuándo (409)',
    duplicate.status === 409 && typeof duplicate.body['availableFrom'] === 'string',
  );

  // 3. El precio llega a la comparación por el outbox (reliability → comparison).
  const shown = (body: Json) =>
    ((body['results'] ?? []) as Json[]).some((item) => item['reportId'] === reportId);
  const inComparison = await waitFor(async () => {
    const comparison = await call(
      'GET',
      `/products/${productId}/comparison?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=3`,
    );
    return shown(comparison.body);
  });
  record(
    'El precio aparece en la comparación',
    inComparison,
    inComparison ? '' : `esperé ${String(WAIT_MS / 1000)} s`,
  );
  const storePrices = await call('GET', `/establishments/${storeId}/prices`);
  record(
    'El precio aparece en la página de la tienda',
    ((storePrices.body['prices'] ?? []) as Json[]).some((item) => item['reportId'] === reportId),
  );
  const mine = await call('GET', '/me/reports', { session: author });
  record(
    'El autor ve su aporte en «mis aportes»',
    items(mine.body).some((item) => item['reportId'] === reportId),
  );

  // 4. Otra cuenta lo marca como dudoso.
  const flag = await call('POST', `/reports/${reportId}/flag`, {
    session: flagger,
    body: { reason: 'precio_falso', comment: 'Prueba de humo' },
  });
  record('Otra cuenta lo marca como dudoso (202)', flag.status === 202);

  // 5. Moderación, si hay una cuenta moderadora.
  const moderatorEmail = process.env['SMOKE_MODERATOR_EMAIL'];
  const moderatorPassword = process.env['SMOKE_MODERATOR_PASSWORD'];
  if (!moderatorEmail || !moderatorPassword) {
    process.stdout.write(
      '  · Sin SMOKE_MODERATOR_EMAIL y SMOKE_MODERATOR_PASSWORD: se salta la moderación.\n',
    );
  } else {
    const moderator = await signIn(moderatorEmail, moderatorPassword, false);
    record('El moderador inicia sesión', moderator !== null);
    if (moderator) {
      const queue = await call('GET', '/moderation/queue', { session: moderator });
      record(
        'El precio marcado está en la cola de moderación',
        items(queue.body).some((item) => item['id'] === reportId),
      );
      const decision = await call('POST', `/moderation/${reportId}/decision`, {
        session: moderator,
        body: { decision: 'descartar', note: 'Prueba de humo: precio falso' },
      });
      record('El moderador lo descarta con motivo (204)', decision.status === 204);
      const gone = await waitFor(async () => {
        const comparison = await call(
          'GET',
          `/products/${productId}/comparison?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusKm=3`,
        );
        return !shown(comparison.body);
      });
      record('El precio descartado deja de mostrarse', gone);
      const status = await call('GET', `/me/reports/${reportId}/status`, { session: author });
      record('El autor ve su aporte como descartado', status.body['status'] === 'descartado');
      const appeal = await call('POST', `/reports/${reportId}/appeal`, {
        session: author,
        body: { note: 'Prueba de humo: el precio era real' },
      });
      record('El autor apela el descarte (202)', appeal.status === 202);
    }
  }

  const logout = await call('POST', '/auth/logout', { session: author });
  record('El autor cierra sesión', logout.status === 204);
}

main()
  .catch((error: unknown) => {
    record('La prueba terminó sin errores inesperados', false, String(error));
  })
  .finally(() => {
    const failed = results.filter((result) => !result.ok);
    process.stdout.write(
      `\n${String(results.length - failed.length)} de ${String(results.length)} pasos en verde.\n`,
    );
    process.exitCode = failed.length > 0 ? 1 : 0;
  });
