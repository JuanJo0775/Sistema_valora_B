# Plan — issue #34: referencia SIPSA

- **Rama:** `feat/catalog-sipsa` (desde `dev`). Pull request hacia `dev` con `Closes #34`.
- **Decisiones:** `grill.md`. **Dependencias nuevas:** ninguna. **Migración:** `catalog.wholesale_references`.

## Contrato

`GET /v1/products/{productId}/comparison` gana `wholesaleReference` (opcional), fuera de `results`:

```json
{
  "source": "SIPSA (DANE)",
  "productName": "Arroz blanco",
  "market": "Armenia, Mercar",
  "pricePerKgCop": 3200,
  "periodStart": "2026-11-09",
  "periodEnd": "2026-11-15",
  "url": "https://www.dane.gov.co/…"
}
```

No sale si no hay referencia o si su periodo terminó hace más de 30 días. Nunca cambia el orden ni `isCheapest`.

## Ciclos TDD

1. **Dominio:** solo un producto de peso acepta la referencia; la referencia es reciente si su periodo terminó hace 30 días o menos.
2. **Persistencia (integración):** guardar sin duplicar y leer la más reciente de un producto.
3. **Semilla:** las filas verificadas de `sipsa.csv` se guardan; producto desconocido, unidad que no es de peso, precio, fechas o URL inválidos nombran la fila.
4. **Lectura del CSV:** `seed/sipsa.csv` se lee como los otros archivos.
5. **Comparación (caso de uso):** trae la referencia reciente aparte de los resultados.
6. **HTTP:** la respuesta de la comparación la muestra; contrato actualizado.

## Otras tareas

- `seed/README.md`, `seed/sipsa.csv` (solo encabezado), README y `DECISIONS.md`.
- Notion: RF-014 y EPIC-B07.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
