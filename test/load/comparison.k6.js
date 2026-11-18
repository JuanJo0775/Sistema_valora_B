// Prueba de carga de la comparación de precios (EC-04, RNF-004, PR-12, issue #35).
// Corre con k6, no con Jest: el archivo no termina en .spec.ts.
//   k6 run -e API_URL=https://<api>/v1 -e SUMMARY_PATH=summary.json test/load/comparison.k6.js
// Opcionales: LOAD_VUS (50), LOAD_DURATION (2m) y WARMUP_DURATION (90s), para ensayos cortos.
// API_URL es obligatoria y no se escribe aquí: sale del workflow load.yml. No la apuntes a producción (ADR-031).
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';

const API_URL = (__ENV.API_URL || '').replace(/\/+$/, '');
const SUMMARY_PATH = __ENV.SUMMARY_PATH || 'summary.json';
const LOAD_VUS = Number(__ENV.LOAD_VUS || 50);
const LOAD_DURATION = __ENV.LOAD_DURATION || '2m';
const WARMUP_DURATION = __ENV.WARMUP_DURATION || '90s';

// Búsquedas de productos de consumo masivo de la semilla.
const SEARCH_TERMS = ['arroz', 'leche', 'aceite', 'azucar', 'cafe', 'huevos', 'panela', 'frijol'];
// Otros municipios del Quindío (#106). La mayoría de usuarios consulta Armenia.
const OTHER_MUNICIPALITIES = ['calarca', 'la-tebaida', 'montenegro', 'circasia'];

// Errores separados por causa, solo de la carga (no del calentamiento).
const tooManyRequests = new Counter('errores_429');
const serverErrors = new Counter('errores_5xx');
const timeouts = new Counter('errores_tiempo_agotado');
const otherErrors = new Counter('errores_otros');

export const options = {
  scenarios: {
    // Despierta Render y Neon (plan gratuito). Sus métricas no cuentan: los umbrales filtran por escenario.
    calentamiento: {
      executor: 'constant-vus',
      vus: 5,
      duration: WARMUP_DURATION,
      tags: { escenario: 'calentamiento' },
    },
    // LOAD_VUS usuarios virtuales (50 por defecto): rampa de 1 minuto y LOAD_DURATION sostenidos.
    carga: {
      executor: 'ramping-vus',
      startTime: WARMUP_DURATION,
      startVUs: 0,
      stages: [
        { duration: '1m', target: LOAD_VUS },
        { duration: LOAD_DURATION, target: LOAD_VUS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { escenario: 'carga' },
    },
  },
  thresholds: {
    'http_req_duration{escenario:carga}': ['p(95)<2000'],
    'http_req_failed{escenario:carga}': ['rate<0.01'],
    // Sin umbral real: solo para que el resumen traiga el total de peticiones de la carga.
    'http_reqs{escenario:carga}': ['count>=0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function productIds(body) {
  try {
    return JSON.parse(body).items.map((item) => item.id);
  } catch {
    return [];
  }
}

export function setup() {
  if (!API_URL) {
    fail('Falta API_URL (un entorno local o efímero, por ejemplo http://localhost:3000/v1).');
  }
  const ids = new Set();
  for (const term of SEARCH_TERMS) {
    const res = http.get(`${API_URL}/products?q=${term}&limit=5`, { timeout: '60s' });
    productIds(res.body).forEach((id) => ids.add(id));
  }
  if (ids.size === 0) {
    fail('La búsqueda de productos no devolvió ids: no hay nada que comparar.');
  }
  return { ids: [...ids] };
}

function countError(res) {
  if (res.status === 0) {
    timeouts.add(1);
  } else if (res.status === 429) {
    tooManyRequests.add(1);
  } else if (res.status >= 500) {
    serverErrors.add(1);
  } else if (res.status >= 400) {
    otherErrors.add(1);
  }
}

export default function (data) {
  // Elección determinista (sin Math.random): reparte productos y municipios entre usuarios e iteraciones.
  const turn = __VU * 7 + __ITER * 13;
  const productId = data.ids[turn % data.ids.length];
  // 1 de cada 5 consultas pide otro municipio; las demás, Armenia. Sin ubicación (lat, lng).
  const municipality =
    turn % 5 === 0 ? OTHER_MUNICIPALITIES[turn % OTHER_MUNICIPALITIES.length] : 'armenia';

  const res = http.get(`${API_URL}/products/${productId}/comparison?municipality=${municipality}`, {
    // A los 30 s la petición cuenta como tiempo agotado: el usuario ya se fue.
    timeout: '30s',
    // El cuerpo no se usa: no se guarda, para no gastar memoria del runner.
    responseType: 'none',
    tags: { name: 'GET /v1/products/{id}/comparison' },
  });
  check(res, { 'responde 200': (r) => r.status === 200 });
  if (exec.scenario.name === 'carga' && res.status !== 200) {
    countError(res);
  }

  // Tiempo de pensar de 1 a 3 s: lo que tarda una persona en leer la lista antes de buscar otro producto.
  sleep(1 + (turn % 21) / 10);
}

function metric(data, name) {
  return data.metrics[name] ? data.metrics[name].values : {};
}

export function handleSummary(data) {
  const duration = metric(data, 'http_req_duration{escenario:carga}');
  const failed = metric(data, 'http_req_failed{escenario:carga}');
  const requests = metric(data, 'http_reqs{escenario:carga}');
  const errorCount = (name) => metric(data, name).count || 0;
  // Duración de la carga: rampa de subida, meseta y bajada.
  const loadSeconds = 60 + parseDuration(LOAD_DURATION) + 15;
  const result = {
    fecha: new Date().toISOString(),
    escenario: { usuariosVirtuales: LOAD_VUS, duracion: LOAD_DURATION, rampaSubida: '1m' },
    meta: { p95Ms: 2000, tasaErrorMax: 0.01 },
    latenciaMs: {
      p50: duration.med,
      p90: duration['p(90)'],
      p95: duration['p(95)'],
      p99: duration['p(99)'],
      promedio: duration.avg,
      maximo: duration.max,
    },
    tasaError: failed.rate,
    totalPeticiones: requests.count,
    peticionesPorSegundo: requests.count / loadSeconds,
    errores: {
      http429: errorCount('errores_429'),
      http5xx: errorCount('errores_5xx'),
      tiempoAgotado: errorCount('errores_tiempo_agotado'),
      otros4xx: errorCount('errores_otros'),
    },
    umbrales: Object.fromEntries(
      Object.entries(data.metrics)
        .filter(([, m]) => m.thresholds)
        .map(([name, m]) => [name, Object.values(m.thresholds).every((t) => t.ok)]),
    ),
  };
  return {
    [SUMMARY_PATH]: JSON.stringify(result, null, 2),
    stdout: `${JSON.stringify(result, null, 2)}\n`,
  };
}

// "10m", "90s" o "1m30s" a segundos.
function parseDuration(text) {
  let seconds = 0;
  for (const [, value, unit] of text.matchAll(/(\d+)([hms])/g)) {
    seconds += Number(value) * { h: 3600, m: 60, s: 1 }[unit];
  }
  return seconds;
}
