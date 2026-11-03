# Valora — Plan maestro de repositorios, arquitectura, épicas y decisiones

**Proyecto:** Seminario Nuclear 4 — Proyecto Nuclear VI, periodo II-2026  
**Producto:** Plataforma colaborativa de comparación de precios entre tiendas de barrio, minimercados y supermercados, con foco inicial en Armenia y el Quindío.  
**Fecha de organización:** 3 de noviembre de 2026  
**Estado:** Repositorios privados inicializados, documentación base publicada y backlog de épicas creado. No equivale a implementación ni a cumplimiento total de H1-01.

---

## 1. Repositorios oficiales

| Repositorio | Responsabilidad | Visibilidad | Estado |
|---|---|---|---|
| [Sistema_valora_B](https://github.com/JuanJo0775/Sistema_valora_B) | Backend: API, dominio, reglas, persistencia y seguridad | Privado | Inicializado con documentación base |
| [Sistema_valora_F](https://github.com/JuanJo0775/Sistema_valora_F) | Frontend: aplicación web responsiva/PWA, flujos y experiencia | Privado | Inicializado con documentación base |

Ambos repositorios estaban vacíos al comenzar esta organización. Se crearon commits iniciales en `main` con README, .gitignore, contribución y documentos de arquitectura/alcance.

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

Los nombres de carpetas de código son estructuras previstas, no módulos implementados. No se seleccionó un framework concreto.

---

## 2. Decisiones aprobadas que guían el trabajo

Estas decisiones proceden del estado vigente de Notion y de las aprobaciones documentadas. Deben mantenerse consistentes en ambos repositorios.

| Tema | Decisión aprobada | Aplicación |
|---|---|---|
| Estilo arquitectónico | Monolito modular | Un backend desplegable con módulos y límites de dominio explícitos. No microservicios en el MVP. |
| Lenguaje principal | TypeScript | Lenguaje principal del proyecto. |
| API | REST sobre HTTPS, JSON y OpenAPI 3.x, versión `/v1` | Contrato de integración independiente del framework. |
| Cliente | Web responsiva con PWA | Una sola experiencia web; sin app nativa en el MVP. |
| Offline | Cola local persistente para registro de precios | Solo el registro funciona sin conexión; consultar precios requiere conexión. |
| Autenticación | Sesión administrada por servidor, cookie HttpOnly/Secure/SameSite, CSRF y Argon2id | No reemplazar por JWT bearer sin nueva decisión aceptada. |
| Autorización | RBAC validado en servidor | Los permisos no se confían al frontend. |
| Datos iniciales | Carga manual y siembra acotada | SIPSA es referencia mayorista cuando hay comparabilidad; no precio de tienda. Sin integración automática completa ni scraping en el MVP. |
| Despliegue | Sin Docker en el MVP | Mecanismo reproducible y proveedor siguen pendientes en ADR-012; confirmar RDA3 con el docente. |
| Alertas | RF-019 opcional/futuro | Fuera del MVP; sin infraestructura de alertas comprometida. |

### Parámetros de calidad que deben conservar su estado

- EC-02: el precio anterior deja de mostrarse como vigente en máximo 5 minutos; criterio aprobado.
- EC-03: detección mínima de anomalías del 80 % sobre conjunto etiquetado; aprobado.
- 40 % de desviación inicial frente a la mediana: provisional y parametrizable; requiere calibración.
- Falsos positivos: registrar y medir; no hay umbral máximo independiente aprobado.
- TTL de 7/14 días, discrepancia del 5 % y reconfirmación: propuestas/valores por justificar, no decisiones cerradas.
- RNF-013/EC-07: prueba prevista de 50 registros offline, 100 % sincronizados, 0 duplicados y p95 ≤60 s tras reconexión. Es criterio de aceptación, no resultado obtenido.

---

## 3. Decisiones que siguen abiertas

No cerrar estas decisiones solo por haber creado los repositorios.

| Tema | Estado | Acción antes de implementarlo |
|---|---|---|
| Framework backend | Pendiente | Comparar opciones compatibles con TypeScript, experiencia del equipo, modularidad y OpenAPI. |
| Framework UI | Pendiente | Elegir opción web/PWA según conocimiento del equipo, accesibilidad y soporte offline. |
| Base de datos | ADR-003 propuesto | Evaluar persistencia relacional/geoespacial y capacidad real del equipo. PostgreSQL + PostGIS es candidato, no aprobación. |
| CQRS ligero/outbox | ADR-004 propuesto | Decidir si la proyección de lectura aporta valor suficiente para EC-04/EC-02 y mantener complejidad mínima. |
| TTL y score | ADR-005 propuesto | Justificar valores con entrevistas y datos representativos. |
| Despliegue | ADR-012 en discusión | Confirmar con docente el alcance de RDA3; elegir proveedor/mecanismo reproducible sin asumir Docker/Kubernetes. |
| Expiración/rotación/revocación de sesión | ADR-014 aceptado, ciclo de vida incompleto | Definir expiración por inactividad y absoluta, rotación de identificador y revocación en logout/bloqueo. |
| Contrato OpenAPI | Decisión aceptada, artefacto por elaborar | Inventariar endpoints y modelos, crear YAML y validar respuestas/pruebas de contrato. |

**Regla:** una tecnología que aparece en un issue o documento como alternativa no se convierte en decisión. Las decisiones estructurales requieren ADR y aceptación del equipo.

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

Los issues están creados en el repositorio frontend.

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
3. Realizar una sesión corta para cerrar framework backend, framework UI y base de datos con ADRs, sin alterar decisiones ya aprobadas.
4. Desglosar cada épica en historias pequeñas y pruebas de aceptación.
5. Elaborar el contrato OpenAPI preliminar antes de implementar endpoints.
6. Comenzar por el flujo vertical mínimo: catálogo → establecimiento → reporte → comparación.
7. Ejecutar TDD sobre normalización por unidad, dinero, idempotencia, vigencia y orden neutral.

---

## 9. Historial de organización

- Se verificó que ambos repositorios existían, estaban vacíos y ya eran privados.
- Se inicializó `main` con documentación base en cada repositorio.
- Se añadieron guías de contribución y reglas de alcance.
- Se registraron 8 épicas backend y 8 épicas frontend como issues.
- Se actualizaron los índices de épicas con sus enlaces.
- No se subió código de aplicación, secretos, datos personales ni credenciales.
- No se cambió el calendario ni se marcó H1-01 como entregado.
