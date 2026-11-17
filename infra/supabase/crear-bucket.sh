#!/bin/sh
# Crea el bucket público de fotos de Valora en Supabase Storage (ADR-022). Se puede repetir:
# si el bucket ya existe, Supabase responde 400/409 y el script lo da por bueno.
#
# Uso (la clave secreta viene del entorno, nunca de un archivo del repositorio):
#   SUPABASE_URL=https://<proyecto>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
#     sh infra/supabase/crear-bucket.sh
set -eu

: "${SUPABASE_URL:?Falta SUPABASE_URL}"
: "${SUPABASE_SECRET_KEY:?Falta SUPABASE_SECRET_KEY}"
BUCKET="${SUPABASE_BUCKET:-productos}"
URL="${SUPABASE_URL%/}"

# Público (las fotos las ve cualquiera), solo WebP y hasta 2 MB: lo que la API ya produce.
CUERPO=$(printf '{"id":"%s","name":"%s","public":true,"file_size_limit":2097152,"allowed_mime_types":["image/webp"]}' "$BUCKET" "$BUCKET")

ESTADO=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "$URL/storage/v1/bucket" \
  --header "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  --header "apikey: $SUPABASE_SECRET_KEY" \
  --header 'Content-Type: application/json' \
  --data "$CUERPO")

case "$ESTADO" in
  200 | 201) echo "Bucket '$BUCKET' creado." ;;
  400 | 409) echo "El bucket '$BUCKET' ya existe: no se cambia nada." ;;
  *)
    echo "Supabase respondió HTTP $ESTADO al crear el bucket." >&2
    exit 1
    ;;
esac
