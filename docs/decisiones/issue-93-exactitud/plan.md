# Plan — issue #93: muestra de exactitud (PR-22)

- **Rama:** `feat/quality-exactitud` (desde `dev`). Pull request hacia `dev` con `Closes #93`.
- **Relación:** RF-014, RNF-014, PR-22, ISO/IEC 25012 (exactitud). Decidido en el grill de la #34 (pregunta 4) y aprobado el 15-nov-2026.
- **Dependencias nuevas:** ninguna. **Migración:** ninguna. **API:** ninguna ruta nueva.

## Qué se construye

- `seed/muestra-exactitud.csv` (solo el encabezado): el equipo anota lo que ve en la tienda. Columnas: `osm_id`, `producto`, `marca`, `cantidad`, `unidad`, `unidades_empaque`, `precio`, `fecha`, `responsable`.
- `pnpm quality:accuracy`: une la muestra con el precio vigente de Valora en esa tienda y escribe `docs/calidad/exactitud-pr22.md`.

## Límites del monolito

- `imports` lee y valida la muestra y calcula los ids fijos de la tienda y la presentación (los mismos de la semilla).
- `comparison` ofrece una consulta pública nueva: el precio vigente de una presentación en una tienda.
- El comando (`src/accuracy.ts`) solo une las dos y escribe el informe; la cuenta la hace el dominio.

## Ciclos TDD

1. **Dominio `accuracyOf` y `accuracySummary`:** diferencia en pesos y en %, si coincide, días entre las observaciones; «sin precio en Valora»; resumen con coincidencias, mediana de la diferencia absoluta en % y filas sin precio.
2. **`AccuracySample` (imports):** lee la muestra, calcula los ids y nombra la fila si el precio, la fecha o el responsable no son válidos.
3. **`CurrentPriceOf` (comparison, integración):** el precio vigente de una presentación en una tienda, o nada.
4. **Comando:** con una tienda, un producto y un precio de prueba, el informe tiene la fila y el resumen.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
