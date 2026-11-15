# Plan — issue #27: propuestas de tiendas y duplicados

- **Rama:** `feat/establishments-propuestas` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #27`.
- **Relación:** Corte 2, épica #3. RF-005, EC-08, PR-15, PR-24, ADR-019.
- **Decisiones:** `grill.md` (3 preguntas más la común con la #26). Contrato: `contrato-api.md`.
- **Dependencias nuevas:** ninguna. **Migración:** `0018_establishments-proposals`.

## Ciclos TDD

Cada ciclo es un commit `test(...)` (rojo) y uno `feat(...)` (verde), más un `refactor` solo si hay uno real.

**Dominio (`src/domain/store-proposal.ts`):**

1. Nombres equivalentes: «Tienda Esperanza» y «Tienda La Esperanza» sí; «Tienda Esperanza» y «Tienda El Sol», no; sin tildes ni mayúsculas.
2. Zona: un punto en Armenia está dentro; uno en Bogotá, fuera.

**Persistencia (integración):**

3. Una propuesta se guarda pendiente, aparece en la lista de pendientes y sale al decidirla; aprobar crea la tienda con el id de la propuesta; las tiendas a menos de 50 m de un punto, con su distancia.

**Casos de uso:**

4. `ProposeStore`: guarda la propuesta pendiente con la clave seudónima de quien la hace.
5. `StoreProposalsQueue`: las pendientes con sus posibles duplicados (equivalentes a menos de 50 m) y si están fuera de la zona, la más antigua primero.
6. `DecideStoreProposal`: aprobar crea la tienda; fusionar exige una tienda existente y no crea nada; rechazar no crea nada; siempre con motivo; una decidida o inexistente no se encuentra.

**HTTP:**

7. Proponer: 202, 400, 401, 403.
8. Lista y decisión del moderador: 200, 204, 400, 403, 404, 422; la tienda aprobada aparece en `/nearby` y la pendiente no.
9. La matriz de autorización y el guardián incluyen las rutas nuevas; la prueba de privacidad del esquema sigue en verde.

## Otras tareas

- **Documentos:** `openapi.yaml`, matriz, README y `DECISIONS.md`. **Notion:** EPIC-B03 y RF-005.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
