# Contrato API — issue #42: conexión con Drizzle y migraciones

**No cambia `docs/openapi.yaml`.** Esta issue no agrega ni modifica rutas, ni cambia la forma de ninguna respuesta.

- Si la base no responde al arrancar, la API no inicia, así que no hay ninguna respuesta HTTP nueva que documentar.
- Un fallo de la base durante una petición sigue respondiendo el 500 `INTERNAL_ERROR` ya documentado en la issue #41.
- `GET /v1/health` no cambia: no se agrega la comprobación de la base, porque la issue no la pide (YAGNI).
