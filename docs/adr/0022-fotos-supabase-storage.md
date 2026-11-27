# ADR-022: Fotos subidas en Supabase Storage

- **Estado:** Aceptado (17-nov-2026; propuesto el 16-nov-2026)
- **Sin cambios por ADR-025 (26-nov-2026):** la verificación de comercios por presencia no guarda documentos, así que no hace falta un bucket privado para evidencias.
- **Fecha:** 2026-11-17
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo. Redactado con apoyo de IA (Claude Code).
- **Escenarios relacionados:** EC-01 (reconocer el producto), EC-08 (privacidad)
- **Requisitos relacionados:** RF-003; ADR-012 (despliegue), ADR-020 (imágenes)
- **Registro oficial:** `PENDIENTE (equipo)`: registrarlo en la base ADRs de Notion; el estado lo decide el equipo.

## Contexto

ADR-020 guarda las fotos que sube el moderador detrás del puerto `ImageStorage`, con una carpeta del servidor como adaptador provisional. Con ADR-012 el backend corre en Render, plan gratuito, cuyo disco es efímero: se borra en cada despliegue, en cada reinicio y cuando el servicio se duerme. La base conserva la dirección de la foto, así que tras cualquier reinicio la imagen queda rota. Además la carpeta solo sirve con una copia del servidor. Las fotos de Open Food Facts no sufren esto: la base guarda solo su enlace.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Supabase Storage (bucket público) | 1 GB y 50 MB por archivo gratis; URL pública estable; la foto sale de Render; sin dependencia nueva en el código | El plan gratuito pausa el proyecto tras 7 días sin actividad y las URL dejan de responder hasta restaurarlo; el proveedor de Terraform está en alfa y no se confirmó que cree buckets |
| B. Foto dentro de la base de Neon (`bytea`) | Sin cuenta nueva ni pausa; entra en las copias de la base | Mezcla archivos con datos; carga a la base; migración y servicio propio de las fotos |
| C. Cloudflare R2 | 10 GB gratis, sin cobro de salida, sin pausa, Terraform oficial | Cuenta nueva y tarjeta |
| D. Disco persistente de Render | Sin cambiar de proveedor | De pago; rompe el plan gratuito |

## Decisión

Se elige **A**, a petición del equipo.

1. Un adaptador `SupabaseImageStorage` implementa `ImageStorage` con la API REST de Storage (`fetch` de Node, sin dependencias nuevas). Se usa cuando `SUPABASE_URL` está definida; sin ella, sigue `LocalImageStorage` para el desarrollo.
2. Bucket público `productos`, solo `image/webp` y hasta 2 MB (`infra/supabase/crear-bucket.sh`). La clave secreta del servidor (`SUPABASE_SECRET_KEY`) vive solo en el entorno de la API (RN2).
3. Los nombres ya llevan el hash del contenido (#88): una foto distinta nunca reutiliza la dirección, así que la caché de un año es segura.
4. Contra la pausa, un workflow periódico (`keepalive.yml`) consulta la API de Supabase cada 3 días.

## Consecuencias

- Positivas: las fotos sobreviven a los despliegues; salen del disco de Render; cambiar de proveedor sigue siendo cambiar un adaptador.
- Negativas / riesgos: si el proyecto se pausa, las fotos subidas dejan de verse hasta restaurarlo desde el panel de Supabase (existe una ventana para restaurar; su duración no está confirmada, las fuentes dan entre 90 días y 1 año). `SUPUESTO:` el ping periódico cuenta como actividad. Un proveedor más y una clave secreta más que custodiar. Una foto reemplazada deja el archivo anterior en el bucket (ya ocurría con la carpeta local).
- Trade-offs aceptados: el bucket se crea con un script y no con Terraform, así que esa parte es menos «como código» que Neon.

## Actualización (17-nov-2026)

Las fotos de Open Food Facts que enlaza la semilla también se copian al bucket `productos`, para no depender de un sitio externo. El comando `pnpm seed:espejo-fotos` (opción `copiar_fotos` del workflow de despliegue) descarga cada foto, la pasa por `ImageProcessor`, la sube con el hash del contenido y guarda la dirección de Supabase conservando `source` y `attribution` (CC BY-SA). Es idempotente y, si una foto falla, deja la URL original. La semilla ya no reemplaza una imagen que apunta al Storage de Supabase. La decisión no cambia.

## Verificación

- Pruebas del adaptador (`supabase-image-storage.spec.ts`): sube al bucket, devuelve la dirección pública, envía la clave solo en cabeceras, rechaza nombres que salen del bucket y falla sin revelar la clave.
- Pruebas de la configuración: con `SUPABASE_URL` se exige la clave y la dirección debe ser `https`.
- `PENDIENTE (equipo)`: subir una foto real en el despliegue y comprobar que sigue visible tras un redespliegue.

## Referencias

- ADR-012, ADR-020; `docs/despliegue.md`.
- Investigación de fuentes (16-nov-2026): precios y límites de Supabase Storage (supabase.com/pricing).
