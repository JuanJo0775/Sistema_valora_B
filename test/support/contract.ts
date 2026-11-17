import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

// Prueba de contrato (#25, PR-09, ADR-002): las respuestas reales se validan contra docs/openapi.yaml.

type Json = Record<string, unknown>;

const CONTRACT_ID = 'openapi.json';
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Modo estricto (grill de la #25, pregunta 3): un objeto con propiedades declaradas no acepta campos
// que el contrato no nombra, salvo que el contrato diga lo contrario. Así un dato que se cuele en una
// respuesta (por ejemplo, del reportante, EC-08) hace fallar la prueba.
function strict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strict);
  if (!isObject(node)) return node;
  const copy: Json = {};
  for (const [key, value] of Object.entries(node)) copy[key] = strict(value);
  if (isObject(copy['properties']) && !('additionalProperties' in copy)) {
    copy['additionalProperties'] = false;
  }
  return copy;
}

export const contract = parse(
  readFileSync(join(__dirname, '..', '..', 'docs', 'openapi.yaml'), 'utf8'),
) as Json;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(strict(contract) as Json, CONTRACT_ID);

// «GET /products/:productId», como las nombra Nest, desde «/products/{productId}» del contrato.
export function contractRoutes(): string[] {
  const paths = contract['paths'] as Record<string, Json>;
  return Object.entries(paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => method in item).map(
      (method) => `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`,
    ),
  );
}

const pointer = (...parts: string[]): string =>
  parts.map((part) => part.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

// Valida el cuerpo de una respuesta real contra el contrato. `route` va como en contractRoutes().
// Devuelve la lista de errores (vacía si cumple) para que el mensaje de la prueba diga qué falló.
export function contractErrors(route: string, status: number, body: unknown): string[] {
  const [method = '', nestPath = ''] = route.split(' ');
  const path = nestPath.replace(/:(\w+)/g, '{$1}');
  const operation = (contract['paths'] as Record<string, Json | undefined>)[path]?.[
    method.toLowerCase()
  ] as Json | undefined;
  if (!operation) return [`${route} no está en docs/openapi.yaml`];
  const responses = operation['responses'] as Record<string, Json>;
  let response = responses[String(status)];
  if (!response) return [`${route} no documenta la respuesta ${String(status)}`];
  let location = `#/${pointer('paths', path, method.toLowerCase(), 'responses', String(status))}`;
  const ref = response['$ref'];
  if (typeof ref === 'string') {
    const name = ref.split('/').pop() ?? '';
    response =
      (contract['components'] as { responses: Record<string, Json> }).responses[name] ?? {};
    location = `#/${pointer('components', 'responses', name)}`;
  }
  const content = response['content'] as Record<string, Json> | undefined;
  if (!content?.['application/json']) {
    return body === '' || body === undefined || (isObject(body) && Object.keys(body).length === 0)
      ? []
      : [`${route} ${String(status)} no documenta cuerpo, pero la respuesta trae uno`];
  }
  const validate = ajv.compile({
    $ref: `${CONTRACT_ID}${location}/${pointer('content', 'application/json', 'schema')}`,
  });
  if (validate(body)) return [];
  return (validate.errors ?? []).map(
    (error) =>
      `${route} ${String(status)}: ${error.instancePath || '(raíz)'} ${error.message ?? ''}${
        error.keyword === 'additionalProperties'
          ? ` (${String((error.params as { additionalProperty?: string }).additionalProperty)})`
          : ''
      }`,
  );
}
