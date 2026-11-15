# Grill — issue #25: prueba de contrato contra `docs/openapi.yaml`

- **Relación:** PR-09, ADR-002, EC-08, insumo de AS-E3.
- **Fecha:** 15 de noviembre de 2026. Las 4 decisiones las aprobó el equipo en la conversación de trabajo.

## 1. Herramienta

**Decisión:** `ajv` (JSON Schema 2020-12, el de OpenAPI 3.1) con `ajv-formats` y `yaml`, solo como dependencias de desarrollo. **Descartado:** `jest-openapi`, que solo entiende OpenAPI 3.0 y no se mantiene.

## 2. Qué se verifica

- **Inventario de rutas** (`test/contract/routes.contract.spec.ts`): toda ruta del código está en el contrato y toda ruta del contrato existe en el código, salvo las de `/commerce` (corte 3).
- **Respuestas reales** (`test/contract/responses.contract.spec.ts`): health, productos, comparación, historial, cercanía, precios por tienda, registro de precios (201, reintento 200, 400, 401, 409), sesión y mis aportes, incluidos los errores.

## 3. Modo estricto

**Decisión:** en la prueba, un objeto con propiedades declaradas no acepta campos que el contrato no nombra (se agrega `additionalProperties: false` donde el contrato no dice otra cosa). Un dato que se cuele en una respuesta, por ejemplo del reportante, hace fallar la CI (EC-08). Una prueba comprueba que el validador de verdad rechaza un campo de más, un tipo equivocado y un código no documentado.

## 4. Dónde corre

**Decisión:** `test/contract/`, dentro del job **Pruebas** de la CI.

## Resultado al construirla

La prueba encontró una diferencia: `GET /v1/health` existía en el código y no en el contrato. Se documentó. Todas las demás respuestas ya cumplían el contrato en modo estricto.
