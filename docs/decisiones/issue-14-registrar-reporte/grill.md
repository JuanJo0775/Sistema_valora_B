# Grill — issue #14: `POST /v1/reports` con `Idempotency-Key`

- **Fuentes:**
  - Issue #14 (paso 5 del H2-01, épica #4): reintento con la misma clave y el mismo cuerpo no duplica y devuelve la respuesta original, con otro cuerpo 409; `observedAt` y `receivedAt` por separado; publicar `PriceReported` por outbox y actualizar `price_current`; un reporte tardío no reemplaza uno más reciente.
  - RF-006 y RF-007; EC-01, EC-02, EC-04, EC-07 y EC-08.
  - ADR-004 (CQRS ligero con precio vigente precalculado): **Propuesto**. ADR-010 (cola sin conexión con `Idempotency-Key`) y ADR-015 (outbox, aceptado).
  - `docs/openapi.yaml`: `POST /reports`, `ReportCreate` y `ReportReceipt`.
  - Issues relacionadas: #15 (comparación, paso 6), #16 (sesión, paso 7: «`POST /v1/reports` exige sesión»), #29 (validaciones: 24 h y límite por usuario, Corte 2) y #31 (vigencia y confiabilidad en `price_current`, Corte 2).
- **Fecha:** 2026-11-12.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Huecos

1. **ADR-004 sigue propuesto**, pero la #14 exige actualizar `price_current`. Además, por la arquitectura, `price_current` es del módulo `comparison`, que aún no existe.
2. **No hay sesión todavía** (llega en la #16, paso 7): ¿quién es el reportante en la #14?
3. **Dos significados de 409:** la #14 lo usa para «misma clave, otro cuerpo»; el contrato, para «mismo producto y tienda en la última hora».
4. **Qué validaciones entran en la #14** y cuáles quedan en la #29 (24 h y límite por usuario).
5. **Presentación o tienda inexistentes:** cómo se comprueba sin leer tablas de otros módulos.
6. **Cuánto tiempo se guardan las claves de idempotencia.**
7. **Reporte tardío:** qué significa «más reciente» (`observedAt` o `receivedAt`).
8. **Valores en español del contrato** (`priceType`: `normal`, `oferta`, `combo`; `status`: `recibido`…) y qué significa `combo`.

## Preguntas

### 1. ¿Aceptamos ADR-004 y dónde vive `price_current`?

- **Decisión:** se acepta ADR-004 (CQRS ligero). `price_current` vive en un módulo nuevo, `comparison`, y lo actualiza en la #14 un suscriptor de `PriceReported` que llega por el outbox (ADR-015).
- **Alcance en la #14:** solo lo mínimo de `price_current`: presentación, tienda, precio, hora de observación e id del reporte. La ruta de lectura llega en la #15; la vigencia y la confiabilidad, en la #31.
- **Razón:** la #14 lo pide en dos criterios («se actualiza `price_current`» y «un reporte tardío no reemplaza uno más reciente»), y el segundo solo se prueba si la tabla existe. Además valida el camino completo del esqueleto: reporte → evento → tabla de lectura.
- **Pendiente:** cambiar ADR-004 a «Aceptado» en Notion; el texto se muestra junto con el plan.

### 2. ¿Quién es el reportante si todavía no hay sesión?

- **Decisión:** la #14 funciona sin sesión. `pricing.reports.reporter_id` existe pero es opcional y no tiene llave foránea (no se cruzan esquemas). La #16 agrega el guard de sesión y CSRF, y vuelve la columna obligatoria con una migración nueva.
- **Contrato:** el 401 de `POST /reports` se marca como «desde la #16».
- **Razón:** respeta el orden del H2-01 (primero el camino del precio, después la seguridad) y deja el cambio de la #16 pequeño y visible. Solo hay datos de desarrollo, así que no se pierde nada.
- **Privacidad (EC-08):** `reporter_id` nunca sale en respuestas públicas ni en los logs.

### 3. ¿Qué significa 409?

- **Decisión:** 409 con dos `code` distintos. `IDEMPOTENCY_KEY_REUSED` (misma clave, otro cuerpo) se construye en la #14. `DUPLICATE_REPORT` (misma cuenta, producto y tienda en la última hora) pasa a la #29, con las demás validaciones por usuario.
- **Razón:** la regla de la hora necesita saber quién reporta, y eso no existe hasta la #16; sin cuenta, bloquearía a cualquier persona. El frontend distingue los casos por el `code` del formato de errores `{ code, message }`.
- **Contrato:** el 409 lista los dos códigos; `DUPLICATE_REPORT` queda marcado «desde la #29».

### 4. ¿Qué validaciones entran en la #14?

- **Decisión:**
  - Formato en el DTO, con respuesta 400: ids UUID, `priceCop` entero de 1 a 10.000.000, `priceType` de la lista, `observedAt` ISO e `Idempotency-Key` UUID.
  - Regla de dominio, con respuesta 422: `observedAt` no puede estar en el futuro, con 5 minutos de margen por la diferencia de relojes. La hora sale de un puerto de reloj. Se construye con TDD en `src/domain/`.
  - La ventana de 24 h y el límite por usuario quedan en la #29.
- **Razón:** un `observedAt` futuro sería «el más reciente» para siempre y ningún reporte real lo reemplazaría en `price_current`, lo que rompe un criterio de la propia #14.

### 5. ¿Cómo sabe `pricing` que la presentación y la tienda existen?

- **Decisión:** `catalog` publica `PresentationExists` y `establishments` publica `EstablishmentExists` en su `index.ts` (mismo patrón que `ImportCatalog`). `pricing` las recibe detrás de sus propios puertos, así que las pruebas usan dobles. Si una no existe: 422 con `UNKNOWN_PRESENTATION` o `UNKNOWN_ESTABLISHMENT`.
- **Dirección permitida:** el núcleo conoce a los módulos de soporte, nunca al revés; dependency-cruiser lo verifica.
- **Razón:** sin la comprobación, un id inventado llenaría `price_current` de basura. Son dos consultas por llave primaria, que no ponen en riesgo los 2 s de EC-01, y el reportante se entera del error de inmediato.

### 6. ¿Dónde se guarda la `Idempotency-Key` y por cuánto tiempo?

- **Decisión:** en la misma fila de `pricing.reports`: `idempotency_key` con índice único y `request_hash` (SHA-256 de los campos del reporte). Dura lo mismo que el reporte, es decir, para siempre; no hay tarea de limpieza.
- **Comportamiento:** misma clave y misma huella → 200 con la respuesta original, reconstruida de la fila (`id`, `status: recibido`, `receivedAt`). Misma clave y otra huella → 409 `IDEMPOTENCY_KEY_REUSED`. Dos reintentos simultáneos: uno inserta, el otro choca con el índice y devuelve la respuesta original.
- **Alcance de la clave:** única en toda la tabla mientras no haya sesión; al ser UUID, un choque entre personas es prácticamente imposible.
- **Razón:** KISS y EC-07: la cola sin conexión puede guardar reportes varios días, y una clave que caduca permitiría duplicados tardíos.

### 7. ¿Qué significa «más reciente» en `price_current`?

- **Decisión:** gana el mayor `observedAt` (la hora en que se vio el precio). En un empate gana el mayor `receivedAt`, para que el resultado no dependa del orden en que el outbox entrega los eventos. El reporte tardío se guarda igual, pero no reemplaza.
- **Construcción:** la regla «¿este reporte reemplaza al vigente?» es una función pura en `src/domain/`, hecha con TDD. El upsert de `price_current` repite la condición en su `WHERE`, así dos eventos simultáneos no dejan un precio viejo.
- **Razón:** la comparación debe mostrar el precio más nuevo en la tienda, no el último que llegó al servidor; encaja con la cola sin conexión (ADR-010).

### 8. ¿Valores en español? ¿Qué es `combo`?

- **Decisión:** los valores siguen en español (`normal`, `oferta`; `recibido`, `en_revision`, `vigente`, `descartado`), como el resto del contrato (`descuento`, `barrio`, `minimercado`). `combo` se quita del contrato hasta que alguien defina qué significa, quizá con las promociones de comercio (ADR-009, Corte 3).
- **En la #14:** `priceType` acepta `normal` (por defecto) y `oferta`; `status` siempre es `recibido`. Los demás estados llegan con la moderación.
- **Razón:** YAGNI. Con «2 × $5.000» no se sabe si `priceCop` es el total o el de una unidad, y un precio por unidad base mal calculado dañaría la comparación. Ninguna pantalla del MVP lo pide.

## Resultado

Grill cerrado con 8 decisiones. Siguen `contrato-api.md` y `plan.md`.
