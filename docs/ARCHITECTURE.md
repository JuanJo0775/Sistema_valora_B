# Arquitectura del backend

## Estilo aprobado

El backend implementará un **monolito modular**. Los módulos se organizan por capacidades del dominio y comparten un único despliegue. La separación de repositorios frontend/backend no convierte al backend en microservicios.

## Módulos de dominio previstos

| Módulo | Responsabilidad principal | Requisitos/área |
|---|---|---|
| identity | Cuentas, sesiones, roles, autorización y consentimiento | Registro, inicio de sesión, RBAC, privacidad |
| catalog | Productos canónicos, categorías, presentaciones, alias y solicitudes | Catálogo y equivalencia de productos |
| establishments | Directorio, tipo, dirección, ubicación y sugerencias/duplicados | RF-005 |
| pricing | Reportes de precios, hora de observación, historial e idempotencia | Registro de precios y offline |
| reliability | Vigencia, reputación, corroboración, detección de anomalías y moderación (marcas, cola, decisiones y bitácora) | EC-02, EC-03, RF-011 a RF-013 |
| comparison | Consulta, normalización por unidad, estado de confianza y orden neutral | Comparación |
| imports | Carga semilla manual y tratamiento de referencias SIPSA | RF-014 |
| commerce | Perfiles, precios oficiales, promociones e integración con reportes | Corte 3; RF-015 a RF-018 |

La moderación no es un módulo aparte: vive en `reliability`, porque decide sobre sus observaciones y cambia la reputación (grill de la #32, pregunta 2).

Los nombres son límites lógicos propuestos para organizar el trabajo. Los detalles internos, la persistencia y las dependencias se validan al cerrar ADR-003/004 y el stack.

## Reglas de dependencia

1. Cada módulo expone una interfaz pública.
2. Un módulo no accede directamente a tablas o repositorios internos de otro.
3. La lógica de dominio no depende de HTTP, framework, base de datos ni infraestructura.
4. `comparison` no depende de relaciones comerciales ni de patrocinio.
5. `commerce` no puede alterar el orden neutral de resultados.
6. Los datos personales del reportante se separan de los datos públicos del reporte.
7. Los reportes se conservan como historial; la moderación cambia su estado, no los borra.

## Flujo de un precio reportado (issue #31)

```text
pricing ──PriceReported v2──► reliability ──PriceAssessed v1──► comparison
(guarda el reporte)            (evalúa anómalos, guarda          (actualiza price_current;
                               observación y reputación)          un sospechoso no reemplaza)
```

Los eventos viajan por el outbox (ADR-015). `PriceReported` v2 lleva solo una clave seudónima del reportante (`reporterKey`) y el día de creación de su cuenta. Al consultar, `comparison` pide a `reliability` el nivel de confiabilidad y las confirmaciones de cada precio (`ReliabilityOfPrices`), calculados a la hora actual.

## Moderación (issue #32)

```text
reportante ──POST /reports/{id}/flag──► reliability.flags ──► cola (GET /moderation/queue)
moderador ──POST /moderation/{id}/decision──► reliability.moderation_log (inmutable)
  aprobar   ──PriceAssessed v1 (normal)──────────────► comparison (vuelve a mostrarlo)
  descartar ──PriceWithdrawn v1 (con reemplazo o null)─► comparison (muestra el reemplazo o nada)
```

La decisión, la reputación del autor y el evento se confirman en una sola transacción. La cola y la bitácora solo guardan claves seudónimas (EC-08).

Desde la #33, `observar_cuentas` y el tercer descarte seguido de un autor publican `ReporterSuspensionRequested` v1; `identity` busca la cuenta por su clave seudónima, la suspende 7 días, guarda la causa (`observada_por_moderacion` o `descartes_seguidos`, ADR-039) y revoca sus sesiones. Desde el ADR-039, `observar_cuentas` además retira el reporte (`PriceWithdrawn`), como un descarte que no baja la reputación. Desde la #71, el autor de un reporte descartado puede apelar (también con una sesión limitada si está suspendido); si otro moderador acepta la apelación, `reliability` publica `PriceAssessed` y `ReporterSuspensionLifted` v1, y `identity` levanta la suspensión que causó ese descarte. Desde la #29, cuando una cuenta llega a 20 reportes en una hora, `pricing` publica `ReportBurstDetected` v1 (clave seudónima y reportes) y `reliability` los pone en la cola con el motivo `rafaga`.

Desde el ADR-040, cuando un comercio deja su tienda, `commerce` publica `MerchantLeft` (con los mismos eventos de retiro de precios y promociones de la revocación) e `identity` devuelve la cuenta a reportante; si además elimina la tienda que creó, publica `MerchantEstablishmentDeleted` y `establishments` la marca `retirada`, con lo que sale de todas las lecturas públicas.

## API

REST sobre HTTPS, JSON y OpenAPI 3.x, versionada bajo `/v1`. La autorización es por operación y rol. La clave de idempotencia para registrar reportes debe validarse y persistirse en el servidor.

## Integración con frontend

El backend es la fuente de verdad del contrato OpenAPI. El frontend consume ese contrato y no debe duplicar manualmente tipos de API cuando sea posible generarlos desde OpenAPI. La estrategia de generación se definirá cuando se cierre el stack.

## No incluido en el MVP

- Microservicios, broker distribuido o Kubernetes.
- Docker obligatorio en el desarrollo local y Testcontainers. El despliegue **sí** usa una imagen Docker en Render, con la base en Neon y la PWA en Vercel (ADR-012, aceptado el 16 de noviembre de 2026) y la CI usa contenedores de servicio de PostgreSQL + PostGIS para las pruebas.
- Integración automática completa con SIPSA.
- Scraping de catálogos de cadenas.
- Sistema de alertas de bajada de precio.
