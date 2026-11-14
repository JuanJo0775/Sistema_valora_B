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
| reliability | Vigencia, reputación, corroboración y detección de anomalías | EC-02, EC-03 |
| moderation | Cola, revisión, decisiones y auditoría | Reportes dudosos y gestión |
| comparison | Consulta, normalización por unidad, estado de confianza y orden neutral | Comparación |
| imports | Carga semilla manual y tratamiento de referencias SIPSA | RF-014 |
| commerce | Perfiles, precios oficiales, promociones e integración con reportes | Corte 3; RF-015 a RF-018 |

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

## API

REST sobre HTTPS, JSON y OpenAPI 3.x, versionada bajo `/v1`. La autorización es por operación y rol. La clave de idempotencia para registrar reportes debe validarse y persistirse en el servidor.

## Integración con frontend

El backend es la fuente de verdad del contrato OpenAPI. El frontend consume ese contrato y no debe duplicar manualmente tipos de API cuando sea posible generarlos desde OpenAPI. La estrategia de generación se definirá cuando se cierre el stack.

## No incluido en el MVP

- Microservicios, broker distribuido o Kubernetes.
- Docker / Docker Compose / Testcontainers en el despliegue y en el desarrollo local. La CI de GitHub Actions sí usa contenedores de servicio de PostgreSQL + PostGIS para las pruebas (aclaración de ADR-012, 11 de noviembre de 2026).
- Integración automática completa con SIPSA.
- Scraping de catálogos de cadenas.
- Sistema de alertas de bajada de precio.
