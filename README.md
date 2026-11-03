# Valora — Backend

API y lógica de negocio de **Valora**, plataforma colaborativa para comparar precios entre tiendas de barrio, minimercados y supermercados de Armenia y el Quindío.

> Este repositorio contiene el backend. El frontend vive en [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F).

## Estado

<badge>Base documental inicial</badge>

- Lenguaje aprobado: TypeScript.
- Estilo aprobado: monolito modular.
- API aprobada: REST sobre HTTPS, JSON y contrato OpenAPI 3.x bajo `/v1`.
- Decisiones aceptadas: sesiones administradas por servidor, PWA con registro offline-first y carga inicial manual con SIPSA solo como referencia comparable.
- Pendiente: framework concreto, motor de persistencia, estrategia CQRS/outbox y mecanismo de despliegue reproducible.
- Docker no forma parte del MVP aprobado.

Este repositorio comienza como esqueleto documental y de organización. No se afirma que la API esté implementada, desplegada o probada.

## Responsabilidades

- Identidad, autenticación, sesiones y autorización RBAC.
- Catálogo de productos y presentaciones.
- Directorio y geolocalización de establecimientos.
- Registro e historial de reportes de precios.
- Reglas de confiabilidad, detección de anomalías y moderación.
- Consulta y comparación de precios.
- Carga semilla manual y referencias SIPSA.
- Módulo comercial del Corte 3, según el alcance aprobado.

## Estructura prevista

```text
docs/
  adr/                 Decisiones arquitectónicas
  api/                 Contrato OpenAPI, fuente de verdad del backend
  architecture/        Contextos, módulos y dependencias
  epics/               Alcance y criterios de las épicas
src/
  modules/             Módulos del monolito modular
tests/
  unit/
  integration/
  contract/
  architecture/
```

La estructura de código se materializará cuando el equipo cierre framework y herramientas. Los módulos no deben convertirse en microservicios: el estilo aprobado es un monolito modular.

## Repositorios

- Backend: [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B)
- Frontend: [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F)

## Trabajo

Las épicas se registran como issues con prefijo `[EPIC]`. Cada PR debe enlazar la épica y los requisitos relacionados. Consultar [CONTRIBUTING.md](CONTRIBUTING.md).

## Decisiones y alcance

- [Decisiones vigentes](docs/DECISIONS.md)
- [Arquitectura y límites de módulos](docs/ARCHITECTURE.md)
- [Contrato de API](docs/API_CONTRACT.md)
- [Épicas](docs/epics/README.md)
- [Plantilla ADR](docs/adr/0000-template.md)
- [Propuesta de modelo C4 (Structurizr DSL, pendiente de aprobación)](docs/c4/structurizr-proposal.dsl)

## Alcance excluido del MVP

Venta en línea, carrito, pagos, pedidos, domicilios, alertas de bajada de precio y extracción automatizada de catálogos de terceros. Las alertas son opcionales/futuras; SIPSA no se presenta como precio minorista de tienda.
