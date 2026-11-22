# Plan de implementación del módulo comercial (EPIC-B08, Corte 3)

**Objetivo:** que un comercio verificado publique precios oficiales y promociones, y que la comparación los muestre con su fuente, sin cambiar el orden neutral ni rediseñar el núcleo.
**RF / EC / ADR:** RF-015 a RF-018 · EC-05 (evolución sin rediseño), EC-06 (neutralidad), EC-03, EC-08 · ADR-001, ADR-005, ADR-008, ADR-009, ADR-015, ADR-016; borradores ADR-023 a ADR-027 (AS-E4).
**Decisiones:** `grill.md` (D1 a D8). **Contrato:** `contrato-api.md`.
**Fuera de alcance (Corte 3):** varias tiendas por cuenta (D3), oficiales en el historial de 30 días (D8), alertas al consumidor (RF-019), texto libre en promociones (D6), procesamiento del archivo en segundo plano (D7).

> **Regla de EC-05:** antes del **primer commit de código** del módulo, el equipo registra la estimación de esfuerzo (tabla de abajo) con su fecha en AS-E4, sección 4. Al terminar cada paso se anota el esfuerzo real. Este plan **no propone cifras**.

## Pasos (cada uno es una rama y un pull request)

Orden: B1 → (B2, B3, B7) → (B4, B5, B6) → B8 → B9. El frontend empieza cada pantalla cuando el contrato de su paso está en `dev`. TDD en todas las reglas de `domain` y en los casos de uso.

| # | Issue | Rama | Entrega | TDD | Criterio de terminado |
|---|---|---|---|---|---|
| B1 | B#201 | `feat/commerce-registro-tienda-existente` | Módulo `commerce` (`/nuevo-modulo`); `POST /v1/commerce/claims` con tienda existente; presencia a 50 m (regla pura), NIT con dígito de verificación (regla pura), tienda sin dueño, una por cuenta; `MerchantVerified` → rol `comercio`; `GET /v1/commerce/me` | Sí | Pruebas de dominio y caso de uso; integración HTTP; `depcheck` con `nucleo-no-conoce-commerce` en verde; la ubicación no se guarda (prueba guardiana) |
| B2 | B#202 | `feat/commerce-registro-tienda-nueva` | `newEstablishment` → propuesta en `establishments` + solicitud pre-aprobada; verificación al aprobarse la tienda | Sí | Flujo completo propuesta → aprobación → verificado |
| B3 | B#203 | `feat/commerce-precios-oficiales` | `PUT`, `GET` y `POST /reconfirm` de precios oficiales; vigencia de ADR-005; `OfficialPricePublished` en la misma transacción (ADR-023) | Sí | Solo el comercio verificado publica en **su** tienda; reconfirmar actualiza todos |
| B7 | B#207 | `feat/commerce-datos-tienda` | `PATCH /v1/commerce/establishment` por la interfaz de `establishments` (D5) | Sí | Nombre duplicado cercano y ubicación quedan en revisión |
| B4 | B#204 | `feat/comparison-precio-oficial` | Regla oficial frente a reportado en `domain` (mediana corroborada, D1); `comparison` recibe eventos; `ComparisonItem` con `source: oficial`, `reportId` opcional, `discrepancy` | Sí | Casos de la mediana (par, impar, extremo), recientes y posteriores, umbral 5 %; prueba de propiedad: el orden no cambia con o sin promociones (ADR-009) |
| B5 | B#205 | `feat/commerce-carga-csv` | `POST /bulk` 200, 1.000 filas, informe por fila, idempotente, reconfirma (D7) | Sí | Archivo con filas buenas y malas; repetido no duplica |
| B6 | B#206 | `feat/commerce-promociones` | Promociones con oficial vigente, pausa al vencer, condiciones fijas (D6); `promotions` en la comparación | Sí | Promoción sin oficial vigente → 422; pausa y reactivación al reconfirmar |
| B8 | B#208 | `feat/commerce-denuncias-revocacion` | Denuncias, disputas, decisión del moderador; revocar retira precios y promociones (D3) | Sí | Revocar deja la tienda con precios de la comunidad; queda la bitácora |
| B9 | B#209 | `feat/commerce-avisos` | `GET /v1/commerce/alerts` + correo: discrepancia y vencimiento (D4) | Sí | Aviso un día antes; aviso de discrepancia corroborada |
| — | B#210 | `docs/adr-modulo-comercial` | ADR-023 a ADR-027 «Propuesto» y diagramas | No | Después de validar con el docente el 23-nov |
| F1 | F#165 | `feat/comercios-registro` | `/comercios/registro` con ubicación y estado pre-aprobado | Vitest y Playwright | Flujo de las dos ramas (tienda del mapa y nueva) |
| F2 | F#166 | `feat/comercios-precios` | Panel de precios, reconfirmar, CSV con informe, avisos | Vitest | Informe por fila y descarga de las que fallaron |
| F3 | F#167 | `feat/comercios-promociones` | Promociones con condiciones fijas | Vitest | Estados activa, pausada, vencida |
| F4 | F#168 | `feat/comparacion-precio-oficial` | Fuente «Oficial», discrepancia, bloque de promociones | Vitest + axe | Tipos regenerados; accesibilidad AA |
| F5 | F#169 | `feat/comercios-datos-denuncias` | Datos de la tienda, denuncia, cola del moderador | Vitest | Revisión de nombre y ubicación visible |

## Estimación de esfuerzo (EC-05) — la llena el equipo antes del primer commit

Fecha de la estimación: ____ · Método: ____ (por ejemplo, horas ideales por persona, consenso del equipo)

| Paso | Estimado (h) | Real (h) | Desviación |
|---|---|---|---|
| B1 | | | |
| B2 | | | |
| B3 | | | |
| B7 | | | |
| B4 | | | |
| B5 | | | |
| B6 | | | |
| B8 | | | |
| B9 | | | |
| ADR y diagramas | | | |
| F1 | | | |
| F2 | | | |
| F3 | | | |
| F4 | | | |
| F5 | | | |
| **Total** | | | **Meta: 30 % o menos** |

## Riesgos y decisiones abiertas

- **Validación del docente (23-nov):** la verificación por presencia frente a RF-015. Si pide otra cosa, cambia B1 y B2, y la estimación se hace después.
- **Cambio incompatible en la comparación** (`reportId` opcional): B4 y F4 van coordinados.
- **Ubicación falseada:** la verificación por presencia no es infalible; lo cubren las denuncias (B8).
- **Correo:** los avisos (B9) dependen de Resend en producción (`EMAIL_PROVIDER=resend`).

## Reparto sugerido

B1, B2 y B3 en orden (base del módulo). Después, en paralelo: B4 (núcleo de la comparación), B5 y B6 (comercio), B7 (soporte). El frontend sigue a cada contrato. Los responsables los asigna el equipo en las issues.
