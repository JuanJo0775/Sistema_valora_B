# AS-E2 · Registro de decisiones arquitectónicas (ADR) de Valora

> **Entregable 2 de Arquitectura de Software II · Corte 1**
> Registro inicial de ADR: cada decisión estructural con su contexto, alternativas consideradas, decisión adoptada y consecuencias (guía del proyecto, sección 9, Corte 1, entregable 2; mínimo exigible en la sección 8.1).
> Este documento es un **índice**: los textos de cada decisión están en `docs/adr/`. Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.

Estado de este documento: borrador para revisión del equipo. Nada de lo que sigue se ha confirmado con el equipo; los huecos se marcan `PENDIENTE (equipo)` y lo que es una lectura del redactor se marca `SUPUESTO:`.

## 1. Alcance y cómo se construyó

- **Qué cubre:** 21 ADR (ADR-001 a ADR-021) y la plantilla [`0000-template.md`](../adr/0000-template.md).
- **Fuente de cada ADR:** la base «ADRs» de Notion (registro oficial, según `docs/decisiones/README.md` y `PLAN_MAESTRO.md`). Los archivos `docs/adr/0001` a `0019` se migraron copiando literalmente las propiedades de texto de cada fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación) y, cuando existía, el cuerpo de la página. Los archivos [`0020`](../adr/0020-imagenes-productos.md) y [`0021`](../adr/0021-acceso-datos-drizzle.md) ya existían en el repositorio y no se tocaron.
- **Estados:** se copiaron de Notion y no se cambiaron. Cuando otra fuente dice algo distinto, se anota en la sección 3, sin corregir.
- **Lo que no se hizo:** no se migró la fila de Notion sin ID ni título (página `41539c4a833b802b9845e01a454cd1ef`, estado Propuesto, todos los textos vacíos); no se editó Notion.
- **Lectura de Notion usada:** 22 filas, una por ID de ADR-001 a ADR-021 más la fila sin ID. Una lectura posterior (delta del 16/17-nov) cuenta 25 filas con duplicados en ADR-019, 020 y 021 (ver sección 3, punto 12).

## 2. Registro: índice de decisiones

Columnas: estado en Notion, estado en `docs/DECISIONS.md` (o la fuente indicada), archivo en `docs/adr/`, escenarios de calidad (EC) relacionados según Notion y si la fila trae los cuatro textos que pide la guía. «Cuerpo de página» indica si la página de Notion tiene contenido además de las propiedades.

| ID | Título (Notion) | Estado en Notion | Estado en `DECISIONS.md` | Archivo | EC relacionados | Textos de la guía (contexto, alternativas, decisión, consecuencias) | Cuerpo de página en Notion |
|---|---|---|---|---|---|---|---|
| ADR-001 | Estilo arquitectónico: monolito modular | Aceptado (2026-10-23) | Aprobada | [0001](../adr/0001-monolito-modular.md) | EC-05, EC-04 | Sí | No |
| ADR-002 | Estilo de API: REST con OpenAPI y dos superficies | Aceptado (2026-10-23) | Aprobada | [0002](../adr/0002-api-rest-openapi.md) | EC-01, EC-04, EC-07 | Sí | No |
| ADR-003 | Persistencia: base de datos relacional con soporte geoespacial | Aceptado (2026-11-03) | Aceptado el 3-nov-2026 | [0003](../adr/0003-persistencia-postgresql-postgis.md) | EC-03, EC-04 | Sí | No |
| ADR-004 | Separar escritura y lectura con un modelo de precio vigente precalculado | Propuesto | Aceptado el 12-nov-2026 | [0004](../adr/0004-cqrs-precio-vigente.md) | EC-02, EC-04 | Sí | No |
| ADR-005 | Modelo de vigencia y confiabilidad: TTL por categoría y score ponderado | Aceptado (2026-11-11) | Aceptado el 11-nov-2026; valores provisionales | [0005](../adr/0005-vigencia-confiabilidad.md) | EC-02, EC-03 | Sí | No |
| ADR-006 | Detección de reportes anómalos: reglas estadísticas y revisión humana | Propuesto | Sin entrada | [0006](../adr/0006-reportes-anomalos.md) | EC-03 | Sí | No |
| ADR-007 | Catálogo canónico con presentaciones y unidad base | Aceptado (2026-11-11) | Contradictorio: «aceptado el 11-nov» y «sigue propuesto» | [0007](../adr/0007-catalogo-canonico.md) | EC-01, EC-06 | Sí | No |
| ADR-008 | Resolución entre precio oficial y precio reportado | Propuesto | Sin entrada | [0008](../adr/0008-precio-oficial-vs-reportado.md) | EC-02, EC-03, EC-05 | Sí | No |
| ADR-009 | Neutralidad: promociones separadas del orden de la comparación | Propuesto | Sin estado en la tabla; aplicado en la issue #21 | [0009](../adr/0009-neutralidad-promociones.md) | EC-06 | Sí | No |
| ADR-010 | Cliente: aplicación web progresiva con cola de envío sin conexión | Aceptado (2026-10-30) | Aprobada | [0010](../adr/0010-pwa-cola-offline.md) | EC-01, EC-07 | Sí | Sí |
| ADR-011 | Datos iniciales: referencia pública y siembra manual | Aceptado (2026-10-30) | Aprobada | [0011](../adr/0011-datos-iniciales.md) | EC-02 | Sí | No |
| ADR-012 | Despliegue reproducible y mecanismo de operación | En discusión (fecha 2026-11-11) | Aceptado el 16-nov-2026 en `DECISIONS.md` (Render, Neon, Vercel; PR #123); el estado de Notion lo decide el equipo | [0012](../adr/0012-despliegue-reproducible.md) | EC-04 | Sí | No |
| ADR-013 | Privacidad por diseño: identidad del reportante separada y no pública | Propuesto | Sin entrada | [0013](../adr/0013-privacidad-por-diseno.md) | EC-03, EC-08 | Sí | No |
| ADR-014 | Autenticación y autorización con control de acceso por rol | Aceptado (2026-11-03) | Aprobada | [0014](../adr/0014-autenticacion-rbac.md) | EC-03, EC-08 | Sí | No |
| ADR-015 | Comunicación entre módulos con eventos de dominio internos | Aceptado (2026-11-11) | Aceptado el 11-nov-2026 | [0015](../adr/0015-eventos-dominio-outbox.md) | EC-05 | Sí | No |
| ADR-016 | Participación de comercios pequeños sin punto de venta | Propuesto | Sin entrada | [0016](../adr/0016-comercios-pequenos.md) | EC-02, EC-05 | Sí | No |
| ADR-017 | Frontend PWA: React + Vite con vite-plugin-pwa | Aceptado (sin fecha en la propiedad) | No figura en `DECISIONS.md`; `PLAN_MAESTRO.md`: aceptado el 8-nov-2026 | [0017](../adr/0017-frontend-react-vite-pwa.md) | EC-01, EC-07 | Sí | Sí |
| ADR-018 | Backend: NestJS sobre Express | Aceptado (2026-11-08) | Aceptado el 8-nov-2026 | [0018](../adr/0018-backend-nestjs-express.md) | EC-04, EC-05, EC-08 | Sí | Sí |
| ADR-019 | Mapa de establecimientos: OpenStreetMap con Leaflet | Propuesto (el texto dice «ACEPTADA el 16-nov-2026») | Sin entrada; el repo usa «ADR-019» para los tipos de establecimiento | [0019](../adr/0019-mapa-osm-leaflet.md) | EC-04, EC-08 | Sí | Sí |
| ADR-020 | Imágenes de productos y de tiendas | Aceptado (sin fecha en la propiedad; el texto dice 15-nov-2026) | Aceptado el 15-nov-2026 | [0020](../adr/0020-imagenes-productos.md) (ya existía) | EC-01, EC-08 | Sí | Sí |
| ADR-021 | Acceso a datos: Drizzle ORM con migraciones SQL versionadas | Aceptado (2026-11-11) | Aceptado el 11-nov-2026 | [0021](../adr/0021-acceso-datos-drizzle.md) (ya existía) | EC-03, EC-05 | Sí | Sí |

Recuento por estado en Notion (21 ADR): Aceptado 13 (ADR-001, 002, 003, 005, 007, 010, 011, 014, 015, 017, 018, 020, 021); Propuesto 7 (ADR-004, 006, 008, 009, 013, 016, 019); En discusión 1 (ADR-012).

Notas de lectura de la tabla:

- Las columnas «Estado en `DECISIONS.md`» se tomaron de `docs/DECISIONS.md`, `docs/PLAN_MAESTRO.md` y del inventario del repositorio; «Sin entrada» significa que el ADR no figura en el registro del repositorio, no que no exista.
- Los requisitos funcionales y no funcionales relacionados (RF/RNF) están en Notion como relaciones; la extracción solo trajo las URL de sus páginas. Cada archivo de `docs/adr/` indica cuántas relaciones tiene y deja `PENDIENTE (equipo)` listar los identificadores.

## 3. Discrepancias abiertas

Ninguna se corrigió; cada una necesita una decisión del equipo.

**Entre la propiedad de Notion y el texto del mismo ADR**

1. **ADR-012.** Estado «En discusión», pero el texto de la decisión dice «DECIDIDO (15-nov-2026): SÍ se usa Docker» y deja en discusión solo el proveedor y la orquestación. La fecha de la propiedad es 2026-11-11. AS-E3 (Notion, borrador del 16-nov) dice «Decidido el 15-nov-2026»; la Auditoría de Notion (11-nov) dice que Docker no forma parte del MVP aprobado; `docs/diagramas/12-despliegue.mmd` dice «Sin Docker en el MVP»; `DECISIONS.md` mantenía «ADR-012 en discusión» hasta que el 16-nov-2026 lo registró como aceptado (Render, Neon, Vercel; PR #123). El estado en Notion sigue sin cambiarse aquí. Ver [0012](../adr/0012-despliegue-reproducible.md).

**ADR-022 (Propuesto, rama `feat/despliegue-iac`, sin integrar).** Fotos del moderador a Supabase Storage porque el disco de Render es efímero: [0022](../adr/0022-fotos-supabase-storage.md). No está en el recuento de Notion (21 ADR) ni cambia el estado de ningún otro ADR; su estado lo decide el equipo.
2. **ADR-019.** Estado «Propuesto» y fecha vacía, pero el texto dice «ACEPTADA el 16-nov-2026 (frontend #18)» y el cuerpo tiene una sección «Aceptación (16 de noviembre de 2026)». Ver [0019](../adr/0019-mapa-osm-leaflet.md).
3. **ADR-019, dos temas distintos.** En Notion trata del mapa (OpenStreetMap con Leaflet). En el repositorio (`DECISIONS.md`, issues #13, #50 y #51) «ADR-019» se usa para los tipos de establecimiento (barrio, minimercado, supermercado, descuento), sin entrada en el registro. Además, ADR-003 cita ADR-019 con fecha 10-nov-2026, ADR-007 cita ADR-020 con fecha 10-nov-2026 y ADR-020 se acepta el 15-nov-2026.
4. **ADR-017 y ADR-020.** La propiedad Fecha de decisión está vacía; el texto dice 8-nov-2026 y 15-nov-2026 respectivamente. Fechas de decisión vacías en Notion también en ADR-004, 006, 008, 009, 013, 016 y 019.

**Entre ADR**

5. **ADR-010 frente a ADR-017.** El cuerpo de la página de ADR-010 dice que ADR-017 «continúa Propuesto hasta validación técnica»; en Notion ADR-017 es Aceptado y `PLAN_MAESTRO.md` lo da por aceptado (8-nov-2026).
6. **ADR-015 frente a ADR-012.** La alternativa C de ADR-015 invoca «la decisión de no usar Docker en el MVP», regla que ADR-012 reemplazó el 15-nov-2026.

**Entre Notion y el repositorio**

7. **ADR-007.** En Notion es Aceptado (2026-11-11). En `DECISIONS.md` aparece aceptado (sección Catálogo, 11-nov) y «sigue propuesto» (sección Precio por unidad base). La Auditoría y AS-E1/AS-E2 de Notion lo cuentan aún entre los propuestos.
8. **ADR-004.** Notion: Propuesto. `DECISIONS.md`: «aceptado el 12 de noviembre de 2026».
9. **ADR-016.** Notion: participación de comercios pequeños sin punto de venta. `openapi.yaml` usa «ADR-016» para la carga masiva de precios oficiales por plantilla CSV (relacionado con una de las piezas de la decisión, pero el título no coincide).
10. **ADR-006, 008, 009, 013, 016 y 019.** Sin entrada en la tabla de «Aprobadas» de `DECISIONS.md`. ADR-009 y ADR-019 se aplican en issues (#21; #13, #50, #51), ADR-013 y ADR-016 se citan en `openapi.yaml` y ADR-006 y ADR-008 solo en `docs/diagramas/README.md`.
11. **Enlaces de ADR-020 y ADR-021.** Los archivos del repositorio enlazan a las páginas de Notion `414056e503118161b411e8a01e2e782f` (ADR-020) y `415056e5031181c78644c792debc2b65` (ADR-021). La lectura de la base usada aquí devuelve otras páginas para esos ID (`41539c4a833b80d8b1f3c1efdc75327b` y `41539c4a833b801c853fcfa3bfebb841`). SUPUESTO: puede tratarse de las filas duplicadas que menciona el punto 12; no se verificó.
12. **Filas duplicadas.** La lectura usada (22 filas) no tiene duplicados. Una lectura posterior (25 filas) reporta ADR-019 con dos filas (ambas Propuesto), ADR-020 con dos (Propuesto y Aceptado) y ADR-021 con dos (ambas Aceptado), más la fila sin ID. PENDIENTE (equipo): revisar la base en Notion y dejar una fila por ADR.
13. **ADR-020 y ADR-021.** Constan como Aceptado, pero su campo «Responsables» dice «pendiente de revisión del equipo».
14. **Resumen de AS-E1 y AS-E2 en Notion.** Siguen con el conteo del 9-nov («8 aceptados, 9 propuestos y 1 en discusión»), anterior a los cambios de estado de ADR-005, 007, 015 y 021 (y a ADR-017 y 018). Este índice los reemplaza una vez revisado.
15. **`ARCHITECTURE.md`.** Dice que los detalles «se validan al cerrar ADR-003/004 y el stack», cuando ADR-003 (3-nov) y ADR-017 y ADR-018 (8-nov) ya figuran aceptados.

## 4. Cobertura frente a lo que exige la guía

La guía pide, para cada decisión estructural, **contexto, alternativas consideradas, decisión adoptada y consecuencias**.

- **Los 21 ADR traen los cuatro textos** en las propiedades de su fila de Notion, y así se migraron a `docs/adr/`.
- **Quince ADR tienen la página de Notion en blanco** (ADR-001 a 009, 011 a 016); el texto está solo en las propiedades. SUPUESTO: la guía no exige que el texto esté en el cuerpo de la página sino que exista; si el equipo quiere que Notion muestre el texto completo en la página, es un trabajo editorial pendiente en Notion.
- **Pendientes que impiden darlos por cumplidos todavía** (todos `PENDIENTE (equipo)`):
  - **Estado sin confirmar.** ADR-004, 006, 008, 009, 013, 016 y 019 están Propuesto en Notion; ADR-012 está En discusión (ver sección 3).
  - **Responsables.** Ningún ADR indica quién lo elaboró o revisó; la plantilla lo pide.
  - **Requisitos.** Los RF/RNF relacionados no están resueltos como identificadores.
  - **Fechas.** Fecha de decisión vacía en ADR-004, 006, 008, 009, 013, 016, 017, 019 y 020 (en la propiedad de Notion).
  - **Verificación.** La plantilla tiene una sección «Verificación»; las fuentes la incluyen dentro de «Consecuencias / verificación»; ADR-015 y ADR-021 citan pruebas concretas (issue #12) y otros ADR mencionan pruebas previstas en términos generales. Nada de esto prueba que las decisiones ya estén implementadas.
  - **Valores provisionales.** ADR-005 acepta el modelo, no los valores (TTL de 7 y 14 días, pesos del score).
  - **Preguntas de diseño.** La propiedad está vacía en Notion en ADR-010, 012, 014 y 021.
- **Alternativas descartadas:** según la fuente, cada uno de los 21 ADR lista al menos dos alternativas; la profundidad del análisis de cada una varía y no se evaluó aquí.

## 5. Riesgos y decisiones pendientes

| # | Riesgo o decisión pendiente | Qué hace falta |
|---|---|---|
| 1 | El estado de ADR-012 contradice su propio texto y varias fuentes | El equipo decide si se cierra como Aceptado (Docker) y se abre otro ADR para proveedor y orquestación, o se mantiene En discusión |
| 2 | ADR-019 usa el mismo número para dos temas y Notion tiene filas duplicadas | Aclarar la numeración y dejar una sola fila por ADR en Notion |
| 3 | ADR-004 y ADR-007 tienen estados distintos entre Notion y `DECISIONS.md` | Confirmar el estado vigente y alinear Notion, `DECISIONS.md` y AS-E1 |
| 4 | Siete ADR siguen Propuesto, entre ellos decisiones ya aplicadas en el código (ADR-009, 004) | Decidir en equipo cuáles se aceptan antes de la entrega y registrar la fecha |
| 5 | Sin responsables ni requisitos RF/RNF identificados | Completar en cada ADR |
| 6 | Los resúmenes de AS-E1 y AS-E2 en Notion están desactualizados | Reemplazarlos por este índice o actualizarlos tras la revisión |
| 7 | Alcance de RDA3 (orquestación) sin confirmar con el docente, según ADR-012 | Confirmar con el docente |
| 8 | Los textos se migraron sin edición; pueden contener afirmaciones que ya no son ciertas (ADR-015 y la regla sin Docker) | Revisión del equipo, ADR por ADR |

## 6. Fuentes de referencia

- Notion, base ADRs: filas de ADR-001 a ADR-021 (páginas citadas en cada archivo de `docs/adr/`).
- ADR-012 (despliegue), ADR-019 (mapa), ADR-007 (catálogo), ADR-004 (CQRS ligero), ADR-010 y ADR-017 (cliente PWA), ADR-015 (outbox), ADR-020 y ADR-021 (archivos ya existentes en `docs/adr/`).
- `docs/DECISIONS.md`, `docs/PLAN_MAESTRO.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/diagramas/README.md`, `docs/diagramas/12-despliegue.mmd`.
- `docs/academico/guia/Guia_Proyecto_Nuclear_VI_II-2026.md`, secciones 8.1 y 9 (Corte 1).
- Plantilla: `docs/adr/0000-template.md`.
- Notion, lectura del 16/17-nov-2026: AS-E1, AS-E2, AS-E3, Auditoría (para las discrepancias 1 y 14).

Redactado con apoyo de IA (Claude Code); el equipo debe revisarlo y poder defenderlo.
