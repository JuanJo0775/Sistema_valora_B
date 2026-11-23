# ADR-017: Frontend PWA: React + Vite con vite-plugin-pwa

- **Estado:** Aceptado
- **Fecha:** 2026-11-08
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-01, EC-07
- **Requisitos relacionados:** en Notion hay 0 relaciones con RF y 0 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Estructura / P8 Inmediato vs diferido
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40d39c4a833b81aab6ebe8c4cf246552)

Fuente: Notion, base ADRs, página 40d39c4a833b81aab6ebe8c4cf246552; estado copiado de Notion.

> El texto de las secciones Contexto a Consecuencias está copiado de las propiedades de texto de la fila; el cuerpo de la página de Notion se copia al final, tal cual (con sus títulos bajados un nivel). Los saltos `<br />` de las propiedades se muestran como párrafos.

## Nota de registro

Resuelto el 23-nov-2026: aceptado el 8-nov-2026, como dice el texto de la decisión y la propiedad Fecha de decisión de Notion. ADR-010 lo llama «continúa Propuesto» por haberse redactado antes: vale este estado.

## Contexto

El cliente principal debe ser una PWA responsive para consumidores y reportantes. ADR-010 acepta la PWA con cola local para registrar precios sin conexión; ADR-002 define una API REST independiente bajo /v1. Se necesita seleccionar un framework frontend que facilite la interfaz y la instalación PWA sin acoplar el cliente al backend.

## Alternativas consideradas

A) Next.js con App Router y Serwist: framework React con renderizado en servidor, componentes de servidor y rutas por archivos; Serwist integra el service worker. Requiere un servidor Node.js propio en producción y su fuerte (renderizado en servidor y SEO) no es un requisito de Valora. B) React con Vite y vite-plugin-pwa: aplicación de una sola página (SPA) que corre completa en el navegador; el build son archivos estáticos; vite-plugin-pwa genera el manifest y el service worker con Workbox. Requiere elegir por separado el enrutador (React Router). C) Angular o SvelteKit: no se consideran porque el equipo trabaja con React y TypeScript.

## Decisión

ACEPTADA (8 de noviembre de 2026): el frontend es una PWA hecha con React, TypeScript y Vite, con vite-plugin-pwa (Workbox) para el manifest y el service worker y React Router para la navegación entre las áreas /, /comercios y /moderacion. La cola de reportes pendientes se guarda en IndexedDB según ADR-010; Dexie sigue como biblioteca candidata. El frontend consume la API REST /v1 del backend NestJS (ADR-018) y genera su cliente tipado desde docs/openapi.yaml. Se descarta Next.js porque su principal ventaja, el renderizado en servidor, no se necesita, y porque exigiría desplegar y mantener un segundo servidor Node.js. La consulta de precios sigue requiriendo conexión; solo el registro funciona sin conexión.

## Consecuencias

(+) Todo el cliente corre en el navegador: el service worker, la cola en IndexedDB y la sincronización son más simples de implementar y probar (EC-01, EC-07). (+) El build son archivos estáticos que sirve Caddy: un solo servidor de aplicación en producción (NestJS), lo que simplifica ADR-012. (+) Workbox, usado por vite-plugin-pwa, es una librería madura para estrategias de caché. (+) Vite da arranque y recarga rápidos, y Vitest comparte su configuración para las pruebas del frontend. (+) Separación clara: toda la lógica de negocio queda en el backend. (−) Sin renderizado en servidor: las páginas de productos no se indexan bien en buscadores; no es un requisito de la guía. (−) Hay que elegir y configurar por separado enrutador y manejo de datos (React Router y, opcionalmente, TanStack Query). (−) La primera carga descarga toda la aplicación; se mitiga con división de código por ruta. (−) vite-plugin-pwa no implementa la cola ni la idempotencia: siguen siendo lógica de la aplicación y de la API.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-017](https://app.notion.com/p/40d39c4a833b81aab6ebe8c4cf246552)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente

## Cuerpo de la página de Notion (copiado tal cual)

<callout icon="🟢" color="green_bg">
<b>Estado: ACEPTADO · 8 de noviembre de 2026.</b><br />La decisión vigente para el frontend de Valora es React + TypeScript + Vite con vite-plugin-pwa (Workbox) y React Router. Esta decisión reemplaza la propuesta anterior de Next.js + Serwist; esa combinación no forma parte del stack aprobado.
</callout>

### Decisión adoptada

Construir el frontend como una PWA con React, TypeScript y Vite. Usar vite-plugin-pwa con Workbox para generar y gestionar el manifest y el service worker, y React Router para la navegación entre las áreas /, /comercios y /moderacion.

La cola de reportes pendientes se persiste en IndexedDB conforme a ADR-010. Dexie continúa como biblioteca candidata y no se considera seleccionada. El frontend consume la API REST /v1 del backend NestJS sobre Express definido en ADR-018 y genera el cliente tipado desde docs/openapi.yaml.

La consulta de precios requiere conexión. El comportamiento sin conexión se limita al registro local de reportes y su sincronización posterior, con idempotencia en la API.

### Alternativas consideradas

- <b>React + TypeScript + Vite + vite-plugin-pwa (seleccionada):</b> aplicación de cliente con build estático, service worker integrado mediante Workbox y separación clara del backend. React Router se configura por separado.
- <b>Next.js App Router + Serwist (descartada):</b> incorpora renderizado en servidor y requiere mantener un servidor Node.js adicional; esas capacidades no son necesarias para el alcance de Valora.
- <b>Angular o SvelteKit:</b> no se seleccionan para este proyecto; el equipo trabaja con React y TypeScript.

### Consecuencias

- El build del frontend produce archivos estáticos que pueden servirse mediante el proxy/servidor web elegido para el despliegue.
- El ciclo de vida del service worker y las estrategias de caché se gestionan con vite-plugin-pwa/Workbox.
- La cola, persistencia, reintentos e idempotencia son responsabilidad de la aplicación y de la API; el plugin PWA no implementa por sí solo la sincronización de reportes.
- La ausencia de renderizado en servidor no afecta un requisito del proyecto.
- El frontend mantiene la separación del dominio y consume el contrato REST/OpenAPI del backend.

### Criterios de validación de la implementación

La decisión arquitectónica está aceptada. Su implementación todavía debe demostrarse con evidencia en los cortes de construcción: instalación de la PWA, persistencia local tras cerrar y abrir, registro sin conexión, recuperación de conectividad y sincronización sin duplicados. No se declara implementada hasta que esas pruebas se ejecuten.

### Referencias relacionadas

- <mention url="https://app.notion.com/p/40d39c4a833b80ffa47cfb7c2d06254e">Arquitectura y stack tecnológico</mention>
- <mention url="https://app.notion.com/p/40d39c4a833b81d79bb4e1099a4022cc" />
- <mention url="https://app.notion.com/p/40d39c4a833b818fa69deb7b39138d16">Backend: NestJS sobre Express</mention>
