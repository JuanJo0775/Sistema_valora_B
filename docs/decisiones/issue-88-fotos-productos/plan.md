# Plan — issue #88: subir fotos de productos

- **Rama:** `feat/catalog-fotos` (desde `dev`). Pull request hacia `dev` con `Closes #88`.
- **Relación:** RF-003, ADR-020 (aceptado el 15-nov-2026), ADR-012 (en discusión), EC-01, EC-08.
- **Decisiones:** ADR-020 (`docs/adr/0020-imagenes-productos.md`).
- **Dependencia nueva:** `sharp` (reducir, convertir a WebP y descartar metadatos).
- **Variables nuevas:** `MEDIA_DIR` (carpeta donde se guardan las fotos, por defecto `media/`, fuera de Git) y `MEDIA_PUBLIC_URL` (la dirección pública de esa carpeta, por ejemplo `http://localhost:3000/media`).
- **Sin migración:** el producto ya tiene las columnas de imagen (#26).

## Contrato

`PUT /v1/moderation/products/{productId}/image` (moderador y CSRF), `multipart/form-data` con el campo `file`.

| Respuesta | Cuándo |
|---|---|
| 200 | `{ "url", "source": "equipo", "attribution": "Equipo Valora" }` |
| 400 | Sin archivo, o el archivo no es una imagen JPEG, PNG o WebP |
| 401 / 403 | Sin sesión; otro rol o sin CSRF |
| 404 | El producto no existe |
| 413 | `PAYLOAD_TOO_LARGE`: más de 2 MB |

Las fotos se sirven en solo lectura desde `GET /media/products/<archivo>.webp` con caché larga: el nombre cambia si cambia la foto. La foto subida reemplaza la imagen del producto (también una de Open Food Facts).

## Ciclos TDD

1. **Procesar la imagen (infraestructura):** un JPEG de 2000 px con ubicación GPS sale en WebP de 800 px como máximo y sin metadatos; un archivo que no es imagen se rechaza.
2. **Guardar el archivo (infraestructura):** la carpeta local guarda la foto con un nombre por su contenido y devuelve su dirección pública.
3. **`SetProductImage` (caso de uso):** procesa, guarda y deja la imagen con fuente `equipo`; un producto que no existe no se toca.
4. **Persistencia:** el producto guarda la imagen nueva; volver a correr la semilla sin imagen en el CSV no borra la foto subida.
5. **HTTP:** 200, 400, 401, 403, 404 y 413; la foto se descarga desde `/media`; `GET /v1/products/{productId}` la muestra.
6. **Matriz de autorización y guardián de rutas** con la ruta nueva.

## Otras tareas

- `openapi.yaml`, `.env.example`, `.gitignore` (`media/`), README, `DECISIONS.md`.
- Notion: EPIC-B02 y ADR-020.

## Verificación

`corepack pnpm typecheck`, `lint`, `format:check`, `depcheck`, `build` y `test:cov --runInBand` en verde.
