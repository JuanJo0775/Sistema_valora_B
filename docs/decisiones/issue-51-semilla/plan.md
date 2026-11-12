# Plan — issue #51: semilla `pnpm db:seed` idempotente

- **Objetivo:** `pnpm db:seed` carga en la base de `DATABASE_URL` las tiendas y los productos verificados de `seed/`, sin duplicar al repetirse, según las 6 decisiones del grill.
- **Relación:** issue padre #13, épica #2 y #3, RF-014 (RN4 y RN5), RF-003 RN2, RF-005, ADR-011, ADR-019 y ADR-021.
- **Fuera de alcance:** precios (llegan con `pricing`, #14), referencias SIPSA y la revisión de los datos (la hace el equipo).

## Dependencias

Ninguna nueva. El UUID v5 se calcula con `node:crypto` (SHA-1); el CSV se lee con código propio.

## Rama y pull request

`feat/semilla`, que sale de `dev`. Un pull request hacia `dev` con `Closes #51` (y, al mezclarse, se cierra también #13).

## Diseño

Respeta el monolito modular: el módulo `imports` (RF-014) **no escribe tablas de otros esquemas**. Pide a `catalog` y a `establishments` que guarden los datos por su interfaz pública.

- **`src/domain/gtin.ts`:** `isValidGtin(code)`. Regla pura, con TDD.
- **`catalog` (interfaz pública):** caso de uso `ImportCatalog` con `upsertProduct`, `upsertPresentation` y `listIds`. Inserta o actualiza por id (`ON CONFLICT (id) DO UPDATE`).
- **`establishments` (interfaz pública):** caso de uso `ImportEstablishments` con `upsertEstablishment` y `listIds`.
- **Módulo nuevo `imports`** (creado siguiendo `/nuevo-modulo`, sin rutas HTTP ni tablas propias):
  - `application/`:
    - `stable-id.ts`: UUID v5 con un espacio de nombres fijo de Valora.
    - Caso de uso `RunSeed`:
      1. Lee las filas por un puerto `SeedSource`.
      2. Separa las verificadas de las pendientes.
      3. **Valida todas las verificadas antes de escribir:** categoría, unidad, cantidad, unidades del empaque, código de barras (`isValidGtin`), códigos repetidos en el archivo, tipo de tienda, coordenadas, fuente y fecha (y responsable en productos), y que un producto no tenga dos categorías distintas.
      4. **Si alguna fila tiene errores, no escribe nada** y devuelve la lista de errores con el archivo y el número de fila.
      5. Si todo está bien, guarda por las interfaces de `catalog` y `establishments`.
      6. Devuelve un resumen: cargadas, saltadas por pendientes y registros de la base que ya no están en los CSV.
  - `infrastructure/csv-seed-source.ts`: lee `seed/*.csv` (con o sin BOM, separador `;`, columnas por nombre).
- **`src/seed.ts`:** arranca un contexto de NestJS sin servidor HTTP, ejecuta `RunSeed`, imprime el resumen y sale con código 1 si hubo errores. Script `db:seed` en `package.json`.
- **Datos:** `productos-propuesta.csv` y `tiendas-osm.csv` se **mueven** a `seed/productos.csv` y `seed/tiendas.csv`, y las dos guías pasan a `seed/README.md`.
- **Decisión propia que conviene revisar:** «todo o nada» en la validación (paso 4). Así una semilla con un error nunca deja la base a medias. La escritura no va en una sola transacción entre módulos; si falla a mitad por otra causa (por ejemplo, la base se cae), volver a correrla lo arregla, porque es idempotente.

## Ciclos TDD

Cada ciclo es un commit `test(…)` (rojo) y otro `feat(…)` (verde), más `refactor` cuando aplique.

**Dominio (`src/domain/gtin.spec.ts`):**

1. Un EAN-13 con su dígito de control correcto es válido.
2. Un EAN-13 con el dígito de control cambiado no es válido.
3. EAN-8, UPC-A y GTIN-14 correctos son válidos.
4. Otros largos (9, 10, 11) y textos con letras no son válidos.

**Caso de uso `RunSeed` (dobles detrás de los puertos):**

5. Una tienda verificada se guarda con su id fijo; una pendiente se salta y se cuenta.
6. Un producto verificado se guarda con todas sus presentaciones; uno sin responsable se salta.
7. Una fila verificada inválida (código de barras, categoría, unidad, falta fuente) hace que no se guarde nada, y el error nombra el archivo y la fila.
8. Informa los registros de la base que ya no están en los CSV, sin borrarlos.

**Integración (`valora_test`):**

9. `ImportCatalog` y `ImportEstablishments` insertan y, con el mismo id, actualizan sin duplicar.
10. Correr la semilla dos veces con los mismos CSV de prueba deja el mismo número de filas; cambiar una dirección la actualiza.
11. El lector de CSV entiende el BOM de Excel, el separador `;` y las columnas por nombre.

## Después

- README: sección «Cargar los datos iniciales» (`pnpm db:seed` y cómo verificar filas en `seed/`).
- `DECISIONS.md`: las 6 decisiones.
- Correr `pnpm db:seed` en `valora_dev` y anotar el resumen en el PR (con los datos de hoy: 158 tiendas y 0 productos).
- **Notion:**
  - [EPIC-B02] y [EPIC-B03]: fila 4c (#51).
  - RF-014: anotar que las tiendas salen de OpenStreetMap y los productos de la lista verificada del equipo.

## Criterio de terminado

- `typecheck`, `lint`, `test:cov`, `depcheck`, `format:check` y `build` en verde, en local y en la CI.
- `src/domain/gtin.ts` con 100 % de cobertura.
- Los criterios de #51 cubiertos: idempotencia (ciclo 10), trazabilidad (ciclo 7) y dígito de control (ciclos 1 a 4).
