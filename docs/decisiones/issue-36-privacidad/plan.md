# Plan — issue #36: inspección de privacidad (EC-08)

- **Rama:** `test/privacidad-ec08` (ya creada desde `dev`). Pull request hacia `dev` con `Closes #36`.
- **Relación:** Corte 2, épica #1. RNF-007, EC-08, PR-15, Ley 1581.
- **Decisiones:** `grill.md` (2 preguntas).
- **Sin cambios de código de la aplicación**, salvo que una prueba encuentre un hallazgo; en ese caso se corrige con su ciclo rojo → verde.

## Pruebas

1. **Esquema (`test/integration/privacy-schema.spec.ts`):** correo y contraseña solo en `identity`; la única columna geográfica es la ubicación de la tienda; ninguna columna de IP; fuera de `identity` y `pricing.reports`, el reportante solo aparece como clave seudónima.
2. **Respuestas públicas (`test/integration/privacy-public-responses.spec.ts`):** con una cuenta que reportó y otra que marcó, recorre todas las rutas públicas (productos, búsqueda, comparación, tiendas cercanas, precios por tienda) y verifica que ninguna respuesta trae el correo, el id de la cuenta, la clave seudónima ni la ubicación consultada.

Si las pruebas pasan sin cambios, se suben como caracterización: son la evidencia.

## Informe

`docs/calidad/privacidad-ec08.md`: qué datos personales guarda Valora y dónde, qué expone cada ruta pública, qué guardan los registros, qué pruebas lo verifican y los hallazgos (incluido `reporter_id`).

## Otras tareas

- `DECISIONS.md` y README (enlace al informe).
- Notion: EPIC-B01.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
