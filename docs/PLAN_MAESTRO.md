# Valora — Plan maestro de repositorios, arquitectura, épicas y decisiones

**Proyecto:** Seminario Nuclear 4 — Proyecto Nuclear VI, periodo II-2026  
**Producto:** Plataforma colaborativa de comparación de precios entre tiendas de barrio, minimercados y supermercados, con foco inicial en Armenia y el Quindío.  
**Documento de referencia:** alcance, coordinación y decisiones estructurales de Valora  
**Estado:** Ambos repositorios oficiales son públicos y contienen implementación funcional, documentación, pruebas automatizadas y CI. El estado de cada épica se verifica con issues y PR; no equivale a cierre global ni a aceptación académica.

---

## 1. Repositorios oficiales

| Repositorio | Responsabilidad | Visibilidad | Estado |
|---|---|---|---|
| [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B) | Backend: API, dominio, reglas, persistencia y seguridad | Público | Implementación NestJS, módulos, migraciones, pruebas y CI integradas |
| [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F) | Frontend: aplicación web responsiva/PWA, flujos y experiencia | Público | PWA React + Vite, módulos funcionales, pruebas y CI integradas |

Los repositorios comenzaron con documentación base; desde entonces incorporaron código, migraciones, contratos, pruebas, workflows y despliegue. El historial Git y los PR constituyen la evidencia de implementación y contribución.

### Estructura del backend

```text
Sistema_valora_B/
├── README.md
├── CONTRIBUTING.md
└── docs/
    ├── DECISIONS.md
    ├── ARCHITECTURE.md
    ├── API_CONTRACT.md
    ├── adr/
    │   └── 0000-template.md
    └── epics/
        └── README.md
```

### Estructura del frontend

```text
Sistema_valora_F/
├── README.md
├── CONTRIBUTING.md
└── docs/
    ├── UX.md
    ├── OFFLINE_FIRST.md
    ├── API_INTEGRATION.md
    ├── EPICS.md
    └── EPICS_LINKS.md
```

Los nombres de carpetas de código son estructuras previstas, no módulos implementados. Frameworks aceptados el 8 de noviembre de 2026: React + Vite con vite-plugin-pwa en el frontend (ADR-017) y NestJS sobre Express en el backend (ADR-018). Su validación práctica se hace con el esqueleto de extremo a extremo (H2-01).

---

## 2. Línea base arquitectónica y decisiones aceptadas

Esta sección conserva únicamente la línea base que condiciona el trabajo de ambos repositorios. El registro completo y vigente de decisiones —incluidos estado, fecha de decisión, contexto, alternativas, consecuencias y trazabilidad— se mantiene en la **[base de datos ADRs de Notion](https://app.notion.com/p/400b339af98d48f78c8616dd39951756)**.

### Decisiones aceptadas que forman la línea base

| ADR | Decisión | Fecha registrada en el ADR | Aplicación en el proyecto |
|---|---|---:|---|
| [ADR-001](https://app.notion.com/p/40239c4a833b81b38475fb73c96d3c80) | Monolito modular | 23/10/2026 | Un backend desplegable con módulos y límites de dominio explícitos. No microservicios en el MVP. |
| [ADR-002](https://app.notion.com/p/40239c4a833b8197a703d87ea6ee2506) | REST sobre HTTPS, JSON y OpenAPI 3.x, versión `/v1` | 23/10/2026 | Contrato independiente del framework; dos superficies lógicas con autorización diferenciada. |
| [ADR-003](https://app.notion.com/p/40239c4a833b818ab129d6c98834db24) | PostgreSQL + PostGIS | 03/11/2026 | Persistencia relacional y soporte geoespacial. La versión exacta y configuración operativa se fijan en implementación. |
| [ADR-010](https://app.notion.com/p/40239c4a833b81d79bb4e1099a4022cc) | PWA con cola de envío sin conexión | 30/10/2026 | Cola local persistente para registrar precios; la consulta de precios requiere conexión. |
| [ADR-011](https://app.notion.com/p/40239c4a833b81cd9caac5adf5849150) | Referencia pública y siembra manual | 30/10/2026 | SIPSA se usa como referencia mayorista cuando existe comparabilidad; no representa precio de tienda. Sin integración automática completa ni scraping en el MVP. |
| [ADR-014](https://app.notion.com/p/40239c4a833b81b1b88ad6b6ff46366d) | Sesiones administradas por servidor y autorización RBAC | 03/11/2026 | Cookie HttpOnly/Secure/SameSite, protección CSRF, contraseñas con Argon2id y permisos validados en servidor. No sustituir por JWT bearer sin nueva decisión. |

Las fechas anteriores reproducen el campo **Fecha de decisión** de cada ADR. En ADR-001 y ADR-002 corresponden a la fecha de registro disponible en Notion; no se dispone de una evidencia independiente más precisa del momento de aprobación.

### Otras restricciones de alcance vigentes

- **Lenguaje principal:** TypeScript.
- **Despliegue:** ADR-012 aceptado: imagen Docker en Render, PostgreSQL + PostGIS en Neon y PWA en Vercel, que reenvía `/v1/*` a Render. PR #125 confirma que Render es la orquestación elegida por el equipo; no queda pendiente confirmación con el docente. El workflow automatizado sigue pendiente de validación reproducible (B#23).
- **Alertas:** RF-019 es opcional/futuro y queda fuera del MVP; no comprometer infraestructura de alertas.
- **Frameworks:** aceptados el 8 de noviembre de 2026. Frontend: React + TypeScript + Vite con vite-plugin-pwa (ADR-017), que reemplaza la propuesta de Next.js + Serwist. Backend: NestJS sobre Express (ADR-018).
- **Autenticación:** la estrategia general está aceptada, pero la expiración, rotación y revocación de sesiones deben concretarse como trabajo de diseño/implementación, sin reinterpretar la decisión ya aceptada.

### Parámetros y criterios de calidad

- EC-02: el precio anterior deja de mostrarse como vigente en máximo 5 minutos; criterio aprobado.
- EC-03: detección mínima de anomalías del 80 % sobre conjunto etiquetado; aprobado.
- 40 % de desviación inicial frente a la mediana: provisional y parametrizable; requiere calibración.
- Falsos positivos: registrar y medir; no hay umbral máximo independiente aprobado.
- TTL de 7/14 días, discrepancia del 5 % y reconfirmación: propuestas/valores por justificar, no decisiones cerradas.
- RNF-013/EC-07: prueba prevista de 50 registros offline, 100 % sincronizados, 0 duplicados y p95 ≤60 s tras reconexión. Es criterio de aceptación, no resultado obtenido.

---

## 3. Gobierno de decisiones y mantenimiento de este plan

### Fuente única de verdad

La [base de datos ADRs de Notion](https://app.notion.com/p/400b339af98d48f78c8616dd39951756) es la única fuente de verdad para:

- Estado actual de cada ADR (Propuesto, En discusión, Aceptado, Rechazado o Reemplazado).
- Fecha de decisión/aceptación.
- Contexto, alternativas consideradas, decisión adoptada, consecuencias y vínculos con RF, RNF y EC.

**No se deben copiar al plan maestro listados de ADR pendientes ni recuentos por estado.** Esos datos cambian durante el proyecto y duplicarlos genera desactualización. Para conocer el estado actual, abrir directamente la base de datos ADRs. Esta guía conserva solo la línea base aceptada que afecta a la coordinación de los repositorios y enlaza cada decisión a su ficha original.

### Cuándo actualizar este archivo

Actualizar este plan únicamente cuando ocurra uno de estos cambios con impacto transversal:

1. Se acepta, reemplaza o revoca una decisión que modifica la línea base técnica o el alcance del MVP.
2. Cambia la distribución de responsabilidades entre frontend y backend, o la dependencia entre épicas.
3. Cambia el alcance de una entrega formal o una restricción académica confirmada.
4. Cambia una regla de trabajo común que afecte a ambos repositorios.

No actualizarlo por cambios rutinarios de estado de un ADR, comentarios, fechas tentativas, avance diario de issues ni decisiones que no alteren la línea base. Esos movimientos permanecen en su fuente correspondiente.

### Procedimiento mínimo de sincronización

- Primero actualizar y aceptar la decisión en Notion, con su fecha y trazabilidad.
- Después, solo si afecta la línea base de este plan, modificar la fila o regla correspondiente y enlazar el ADR.
- No reescribir el plan completo ni replicar el contenido del ADR.
- Si una decisión cambia, conservar el historial mediante un commit descriptivo en Git.
- Los estados de issues y el avance de implementación se consultan directamente en GitHub; este documento no sustituye esos tableros.

**Regla de interpretación:** una alternativa mencionada en una épica, issue o documento técnico no se convierte en decisión aprobada. Solo el estado Aceptado de su ADR autoriza tratarla como línea base.

---

## 4. Épicas del backend

Los issues están creados en el repositorio backend. El detalle, criterios y estado vivo se mantienen en GitHub.

| ID | Épica | Issue | Incremento |
|---|---|---|---|
| EPIC-B01 | Identidad, sesiones y autorización | [#1](https://github.com/JuanJo0775/Sistema_valora_B/issues/1) | Núcleo |
| EPIC-B02 | Catálogo de productos y presentaciones | [#2](https://github.com/JuanJo0775/Sistema_valora_B/issues/2) | Núcleo |
| EPIC-B03 | Directorio y ubicación de establecimientos | [#3](https://github.com/JuanJo0775/Sistema_valora_B/issues/3) | Núcleo |
| EPIC-B04 | Registro e historial de reportes de precios | [#4](https://github.com/JuanJo0775/Sistema_valora_B/issues/4) | Núcleo |
| EPIC-B05 | Confiabilidad, anomalías y moderación | [#5](https://github.com/JuanJo0775/Sistema_valora_B/issues/5) | Núcleo |
| EPIC-B06 | Consulta y comparación neutral de precios | [#6](https://github.com/JuanJo0775/Sistema_valora_B/issues/6) | Núcleo |
| EPIC-B07 | Carga semilla y referencias SIPSA | [#7](https://github.com/JuanJo0775/Sistema_valora_B/issues/7) | Núcleo |
| EPIC-B08 | Módulo comercial: perfiles, precios oficiales y promociones | [#8](https://github.com/JuanJo0775/Sistema_valora_B/issues/8) | Corte 3 |

## 5. Épicas del frontend

Los issues están creados en el repositorio frontend; los títulos siguientes se han contrastado con GitHub.

| ID | Épica | Issue | Incremento |
|---|---|---|---|
| EPIC-F01 | Consulta pública y búsqueda de productos | [#1](https://github.com/JuanJo0775/Sistema_valora_F/issues/1) | Núcleo |
| EPIC-F02 | Comparación de precios y establecimientos | [#2](https://github.com/JuanJo0775/Sistema_valora_F/issues/2) | Núcleo |
| EPIC-F03 | Flujo rápido de registro de precios | [#3](https://github.com/JuanJo0775/Sistema_valora_F/issues/3) | Núcleo |
| EPIC-F04 | PWA y cola persistente offline-first | [#4](https://github.com/JuanJo0775/Sistema_valora_F/issues/4) | Núcleo |
| EPIC-F05 | Sesión, aportes propios y experiencia de moderación | [#5](https://github.com/JuanJo0775/Sistema_valora_F/issues/5) | Núcleo |
| EPIC-F06 | Accesibilidad y prueba de usabilidad | [#6](https://github.com/JuanJo0775/Sistema_valora_F/issues/6) | Núcleo |
| EPIC-F07 | Portal de comercios y precios oficiales | [#7](https://github.com/JuanJo0775/Sistema_valora_F/issues/7) | Corte 3 |
| EPIC-F08 | Promociones e integración comercial neutral | [#8](https://github.com/JuanJo0775/Sistema_valora_F/issues/8) | Corte 3 |

### Cómo se relacionan las épicas

- EPIC-F01/F02 consumen EPIC-B02/B03/B06.
- EPIC-F03/F04 consumen EPIC-B04 y requieren coordinación de idempotencia/estados.
- EPIC-F05 consume EPIC-B01/B05.
- EPIC-F06 es transversal y valida EC-01/EC-08 y WCAG 2.2 AA.
- EPIC-F07/F08 consumen EPIC-B08, que depende de que el núcleo ya esté estable.
- EPIC-B07 alimenta catálogo/datos iniciales; no es integración automática SIPSA.

---

## 6. Flujo de trabajo del equipo

1. Mantener `main` protegido mediante PR y revisión de otro integrante cuando la configuración del repositorio lo permita.
2. Crear ramas cortas por tarea: `feat/`, `fix/`, `test/`, `docs/`.
3. Usar Conventional Commits.
4. Cada issue de implementación debe enlazarse a una épica y a RF/RNF/EC aplicables.
5. Reglas de negocio: TDD rojo → verde → refactor. Conservar evidencia del historial.
6. Actualizar OpenAPI cuando cambie el contrato.
7. Cambios estructurales: registrar ADR antes de asumir la decisión como aprobada.
8. Mantener frontend y backend coordinados mediante el contrato OpenAPI, no por tipos internos compartidos.
9. No declarar funcionalidad, pruebas, despliegue, entrevistas o benchmarking como realizados sin evidencia verificable.

### Definition of Done transversal

- [ ] Requisito y criterios de aceptación enlazados.
- [ ] Implementación dentro del límite de módulo correspondiente.
- [ ] Pruebas automatizadas escritas y ejecutadas; TDD para reglas de negocio.
- [ ] Contrato OpenAPI actualizado si aplica.
- [ ] Revisión de privacidad, seguridad y neutralidad.
- [ ] Revisión de código por otro integrante.
- [ ] Evidencia de ejecución adjunta al PR.
- [ ] Documentación y ADR actualizados si hubo decisión estructural.

---

## 7. Actividad H1-01 del calendario — repositorio y herramientas

La actividad H1-01 pide: equipo conformado, repositorio Git con historial por integrante, herramienta de modelado C4 elegida, plantilla ADR y tablero de trabajo.

### Evidencia ya preparada

- [x] Repositorio backend privado creado: [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B).
- [x] Repositorio frontend privado creado: [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F).
- [x] README y reglas de contribución en ambos.
- [x] Plantilla ADR en backend.
- [x] Épicas registradas como issues GitHub: 8 backend y 8 frontend.
- [x] Documentación inicial de arquitectura, API, UX y offline-first.

### Pendiente para declarar H1-01 entregado

- [ ] Cada integrante debe aceptar/acceder a ambos repositorios y realizar commits propios; no se debe simular autoría.
- [ ] Elegir formalmente la herramienta C4 (por ejemplo, Structurizr, Mermaid u otra) y dejar la decisión registrada.
- [ ] Crear/configurar un tablero de trabajo (GitHub Projects u otra herramienta acordada) y vincular los issues.
- [ ] Confirmar los integrantes y responsables en el calendario de Notion.
- [ ] Verificar permisos y que cada integrante pueda abrir PR.

**Estado recomendado de H1-01:** En progreso. La estructura Git y el backlog están preparados, pero aún no hay historial de contribución de todos los integrantes ni herramienta C4/tablero confirmados. No marcar Entregado todavía.

---

## 8. Próximos pasos sugeridos

1. Invitar a los demás integrantes como colaboradores en ambos repositorios.
2. Confirmar herramienta C4 y crear el tablero con las 16 épicas.
3. Resolver las propuestas de framework frontend/backend mediante sus ADR; la persistencia PostgreSQL + PostGIS ya está aceptada en ADR-003.
4. Desglosar cada épica en historias pequeñas y pruebas de aceptación.
5. Elaborar el contrato OpenAPI preliminar antes de implementar endpoints, manteniéndolo alineado con ADR-002.
6. Comenzar por el flujo vertical mínimo: catálogo → establecimiento → reporte → comparación.
7. Ejecutar TDD sobre normalización por unidad, dinero, idempotencia, vigencia y orden neutral.

---

## 9. Historial de organización

- Estado verificado el 17-nov-2026: ambos repositorios son públicos, tienen implementación integrada y CI. Los issues principales de las 17 épicas siguen abiertos; no declarar cierre de épicas por el solo hecho de que sus funcionalidades estén implementadas.
- Se inicializó `main` con documentación base en cada repositorio.
- Se añadieron guías de contribución y reglas de alcance.
- Se registraron 8 épicas backend y 8 épicas frontend como issues.
- Se actualizaron los índices de épicas con sus enlaces.
- No se subió código de aplicación, secretos, datos personales ni credenciales.
- No se cambió el calendario ni se marcó H1-01 como entregado.
- La base de datos ADRs de Notion se establece como fuente única de verdad para estados y fechas; este plan conserva solo la línea base transversal y evita duplicar estados cambiantes.


## Estado técnico verificado — 17 de noviembre de 2026

- **Gobierno de arquitectura:** 22 ADR numerados en Notion; 16 aceptados y 6 propuestos. ADR-004 se aceptó el 12-nov-2026 (PR B#58) y se alineó en Notion. ADR-022 sigue Propuesto aunque el adaptador Supabase esté implementado; falta prueba de foto real tras redespliegue.
- **Backend:** CI #105, 816 pruebas aprobadas y 96,3 % de cobertura de líneas; SonarQube Quality Gate aprobado. Smoke local: 22/22 pasos con semilla y 7/7 en solo lectura (PR B#113).
- **Frontend:** CI #81, 330 pruebas aprobadas y 98,65 % de cobertura; Quality Gate aprobado con un hallazgo MAJOR de mantenibilidad en `RoleChange.tsx:14`.
- **Despliegue:** topología Render/Neon/Vercel seleccionada; existe workflow `.github/workflows/deploy.yml` y runbook. La corrida #43999270545 falló porque `DATABASE_URL` llegó vacía. B#23 sigue abierto; se requieren tres despliegues consecutivos correctos y prueba de humo pública.
- **Datos:** catálogo inicial de 31 productos y 37 presentaciones; los CSV conservan `verificar=no`. SIPSA tiene cuatro referencias marcadas `verificar=no`; la muestra de exactitud sigue vacía. B#118 y evaluación de exactitud pendientes.
- **Validación integral:** B#17 y F#27 Playwright E2E pendientes; B#35 k6 pendiente; F#28 auditoría WCAG 2.2 AA y prueba de usabilidad pendientes.
- **Corte 3:** B08/F07/F08 y H2-05 siguen documentados como alcance futuro; no se detectó implementación funcional del módulo comercial.

Los estados «implementado», «integrado», «probado», «desplegado» y «aceptado» no son intercambiables. El cierre de cada épica requiere cumplir su issue padre y los criterios de aceptación asociados.
