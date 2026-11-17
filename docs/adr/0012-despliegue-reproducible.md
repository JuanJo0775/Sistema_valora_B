# ADR-012: Despliegue reproducible y mecanismo de operación

- **Estado:** En discusión
- **Fecha:** 2026-11-11
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-04
- **Requisitos relacionados:** en Notion hay 0 relaciones con RF y 3 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 2 / Despliegue y operación / sin dato en la fuente
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81e7ac7cc212b784c492)

Fuente: Notion, base ADRs, página 40239c4a833b81e7ac7cc212b784c492; estado copiado de Notion.

Nota del repo: DECISIONS.md registra este ADR como aceptado el 16-nov-2026 con Render, Neon y Vercel; la propiedad de Notion sigue siendo la fuente del estado.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Discrepancias señaladas (no corregidas)

- **Discrepancia de estado.** La propiedad Estado de Notion es «En discusión», pero el texto de la decisión empieza por «DECIDIDO (15-nov-2026): SÍ se usa Docker» y deja «EN DISCUSIÓN» solo el proveedor y la orquestación. Además, la fecha de la propiedad es 2026-11-11, anterior a la decisión del 15-nov. No se corrigió; el estado copiado es el de la propiedad.
- Otras fuentes: `docs/DECISIONS.md` mantiene «ADR-012 en discusión» y atribuye a este ADR el cambio a Docker del 15-nov; `docs/diagramas/12-despliegue.mmd` aún dice «Sin Docker en el MVP»; la Auditoría de Notion (11-nov) dice que Docker no forma parte del MVP aprobado.

## Contexto

El despliegue reproducible es un mínimo exigible por RNF-009, que en su RN1 pide «infraestructura y contenedores como código». El RDA3 de Arquitectura de Software II aborda enfoques cloud y herramientas de orquestación según las necesidades del proyecto. El 11-nov-2026 se había aprobado no usar Docker en el MVP, lo que contradecía RNF-009 RN1. El 15-nov-2026 el equipo revisó las propuestas de despliegue (página «Propuestas de despliegue — insumo para ADR-012») y cambió esa regla. Sigue pendiente el proveedor y confirmar con el docente qué orquestación espera RDA3.

## Alternativas consideradas

A) Despliegue manual en una máquina virtual: rápido, pero no reproducible.

B) Plataforma (PaaS) sin Docker: lo más simple, pero no cumple RNF-009 RN1 y la orquestación queda oculta.

C) Plataforma (PaaS) con Docker: imagen como código e infraestructura como código (archivo de la plataforma o Terraform); la plataforma orquesta (salud, reinicio, despliegue sin corte).

D) Terraform + nube (AWS, Google Cloud o Azure) con servicio de contenedores: más completo, más trabajo y riesgo de costos.

E) Orquestador propio (Kubernetes gestionado o k3s): orquestación explícita, pero la operación queda a cargo del equipo.

## Decisión

DECIDIDO (15-nov-2026): SÍ se usa Docker. El backend se empaqueta en una imagen descrita por un Dockerfile en el repositorio (contenedor como código, RNF-009 RN1). Esto reemplaza la regla «sin Docker en el MVP» del 11-nov-2026. La CI sigue usando contenedores de servicio con PostgreSQL + PostGIS para las pruebas.

Se mantiene: los integrantes no necesitan Docker para desarrollar; pueden seguir con PostgreSQL local. Docker Compose para desarrollo local es opcional y entra solo si alguien lo necesita.

EN DISCUSIÓN: proveedor y orquestación. Recomendación: alternativa C (plataforma con Docker y base PostgreSQL + PostGIS administrada), si el docente acepta la orquestación de la plataforma para RDA3; si exige Terraform, la misma infraestructura se describe con Terraform; si exige Kubernetes, alternativa E.

Pipeline previsto: al mezclar dev en main se construye la imagen, se aplican las migraciones, se despliega y se corre la prueba de humo (pnpm smoke -- --solo-lectura); si falla, la CI queda en rojo.

## Consecuencias

(+) Cumple RNF-009 RN1: contenedores e infraestructura como código.

(+) La misma imagen corre en la CI y en el despliegue; entornos iguales.

(+) El pipeline y la orquestación de la plataforma sirven de evidencia para RDA3 y la calidad del proceso.

(−) Hay que mantener un Dockerfile y aprender lo básico de Docker; se mitiga con un Dockerfile corto y documentado.

(−) El disco del contenedor se borra en cada despliegue: las fotos (ADR-020) necesitan disco persistente o almacenamiento de objetos.

(−) El outbox corre dentro del proceso: antes de usar más de una copia hay que comprobar que un evento no se entregue dos veces.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-012](https://app.notion.com/p/40239c4a833b81e7ac7cc212b784c492)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
