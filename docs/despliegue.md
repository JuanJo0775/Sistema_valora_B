# Despliegue de Valora (ADR-012)

Neon guarda la base, Render corre la API y Vercel sirve la PWA y reenvía `/v1/*` a Render. Todo lo que se puede describir está en archivos del repositorio:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Base de datos | `infra/neon/` (Terraform) | Proyecto, base y rol en Neon |
| API | `Dockerfile` y `render.yaml` | Imagen y servicio `valora-api` en Render |
| PWA y reenvío | `vercel.json` (repo del frontend) | Reenvía `/v1/*` a Render; el resto cae en `index.html` |
| Migraciones y despliegue | `.github/workflows/deploy.yml` | Migra Neon y dispara Render |
| Validación de Terraform | `.github/workflows/infra.yml` | `fmt`, `init` y `validate` en cada cambio |

Lo manual es crear las cuentas, generar las claves y pegar los secretos. Ningún secreto va en Git (RN2).

## Antes de empezar

- Cuentas en Neon, Render y Vercel, y permiso de administración en los dos repositorios de GitHub.
- Terraform 1.6 o posterior en tu equipo (`terraform version`).
- Una clave de API de Neon (consola de Neon, «Account settings» y «API keys»).

## Pasos

### 1. Crear la base en Neon (Terraform)

```bash
cd infra/neon
export NEON_API_KEY=...        # no la escribas en ningún archivo
terraform init
terraform plan
terraform apply
terraform output -raw database_url    # la cadena de conexión: es un secreto
```

El estado queda en `terraform.tfstate` dentro de esa carpeta. Contiene la contraseña de la base: está en `.gitignore` y no se sube. Si lo pierdes, `terraform import` o recrea el proyecto. `SUPUESTO:` más adelante conviene un backend remoto cifrado; hoy el equipo es pequeño y aplica a mano.

### 2. Configurar GitHub (repositorio del backend)

En «Settings», «Environments», crea el entorno **`produccion`** con revisores obligatorios (aprobación manual de cada despliegue). En él:

| Tipo | Nombre | Valor |
|---|---|---|
| Secreto | `NEON_DATABASE_URL` | La cadena del paso 1 |
| Secreto | `RENDER_DEPLOY_HOOK_URL` | Se obtiene en el paso 4 |
| Variable | `API_URL` | La dirección pública de Render, sin barra final (paso 4) |

Sin los tres valores el workflow «Despliegue» falla en el primer paso (`url: ''`: la cadena de Neon llega vacía) y no llega a Render. Se pueden cargar desde la consola de GitHub o con `gh`, sin pegar secretos en el chat (la cadena sale del estado de Terraform y el hook se copia del panel de Render al portapapeles):

```bash
R=<dueño>/Sistema_valora_B
(cd infra/neon && terraform output -raw database_url) | gh secret set NEON_DATABASE_URL --env produccion --repo $R
gh variable set API_URL --env produccion --repo $R --body "https://<servicio>.onrender.com"
# Deploy Hook: Render, servicio, Settings, Deploy Hook, «Copy»; después:
gh secret set RENDER_DEPLOY_HOOK_URL --env produccion --repo $R < <(powershell -c "Get-Clipboard")
# Revisores obligatorios del entorno (una persona aprueba cada despliegue):
gh api -X PUT repos/$R/environments/produccion -F "reviewers[][type]=User" -F "reviewers[][id]=$(gh api users/<usuario> --jq .id)"
```

La aprobación de cada despliegue la da una persona: es el control de liberación y no se automatiza. Se aprueba en Actions, en la corrida en espera, con «Review deployments».

### 3. Migraciones y semilla (en este orden)

La semilla (`seed/*.csv`, issue #51) tiene un solo camino de entrada a producción, para que nadie apunte a Neon desde su equipo por accidente:

1. **Preparar los datos (en desarrollo, con revisión humana).** Si faltan fotos de productos, `pnpm seed:imagenes` consulta Open Food Facts y escribe solo los enlaces nuevos en `seed/productos.csv`; se revisa el informe y se sube el CSV por pull request. Solo se cargan las filas verificadas (`verificar = no` y `responsable` lleno, `revisar = no` en tiendas).
2. **Probarla en local:** `pnpm db:migrate` y `pnpm db:seed` contra `valora_dev`.
3. **Cargarla en Neon:** pestaña Actions, «Despliegue», «Run workflow» con **«Cargar la semilla»** marcado. El workflow migra, carga la semilla (idempotente: actualiza por id fijo, no duplica y nunca borra) y despliega. Los despliegues normales, por push a `main`, migran pero **no** cargan la semilla.
4. Cuando cambien los CSV, repetir el paso 3 con la casilla marcada.

Si el workflow falla con filas inválidas, no se cargó nada («todo o nada»): se corrige el CSV y se repite. Las fotos que sube el moderador no vienen de la semilla: ver «Fotos» en los riesgos.

### 3 bis. Fotos: Supabase Storage (ADR-022)

Las fotos que sube el moderador no pueden quedar en el disco de Render (se borra en cada despliegue). Van a un bucket público de Supabase:

1. Crea un proyecto en Supabase (plan gratuito) y copia su dirección `https://<proyecto>.supabase.co` y la **clave secreta** (`sb_secret_...`, «Project Settings», «API Keys»). La clave nunca va en Git ni en el navegador.
2. Crea el bucket público: `SUPABASE_URL=... SUPABASE_SECRET_KEY=... sh infra/supabase/crear-bucket.sh` (se puede repetir). Deja el bucket `productos`, solo WebP, hasta 2 MB.
3. En GitHub, repositorio del backend: variable `SUPABASE_URL` y secreto `SUPABASE_SECRET_KEY`. El workflow `keepalive.yml` los usa cada 3 días para que el plan gratuito no pause el proyecto.
4. En Render (paso 4) se pegan las mismas dos variables.

Si Supabase pausa el proyecto (7 días sin actividad), las URL de las fotos subidas dejan de responder: se restaura desde el panel («Restore project»). Hay una ventana de tiempo para hacerlo; su duración no está confirmada (las fuentes dan entre 90 días y 1 año), así que no conviene dejarlo pausado.

### 4. Crear el servicio en Render

1. «New», «Blueprint», elige el repositorio del backend: Render lee `render.yaml` y crea `valora-api`.
2. Llena las variables marcadas `sync: false`:
   - `DATABASE_URL`: la cadena de Neon.
   - `DATABASE_URL_TEST`: la misma cadena (la validación la exige, en producción no se usa).
   - `REPORTER_KEY_SECRET`: un valor aleatorio propio (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). **No lo cambies una vez en uso**: las reputaciones quedan asociadas a esa clave.
   - `MEDIA_PUBLIC_URL`: `https://<dirección de Render>/media` (con Supabase no se usa, pero la validación la exige).
   - `SUPABASE_URL` y `SUPABASE_SECRET_KEY`: los del paso 3 bis. `SUPABASE_BUCKET` ya viene en `render.yaml`.
3. Copia la dirección pública del servicio (por defecto `https://valora-api.onrender.com`) y el **Deploy Hook** («Settings», «Deploy Hook») a los secretos del paso 2.
4. `SESSION_SECRET` lo genera Render (`generateValue`). `TRUST_PROXY=2` ya viene en `render.yaml`.

### 5. Conectar Vercel (repositorio del frontend)

Importa el repositorio, preset **Vite**, rama de producción `main`. `vercel.json` ya reenvía `/v1/*`. Si la dirección de Render **no** es `https://valora-api.onrender.com`, cambia el `destination` en `vercel.json` y vuelve a desplegar (la URL queda escrita ahí).

### 6. Primer despliegue

Un merge a `main` del backend (o «Run workflow» en la pestaña Actions) lanza `Despliegue`: pide aprobación, migra Neon, dispara Render y espera a que `GET /v1/health` responda. Después verifica `https://<tu-dominio-vercel>/v1/health` (debe devolver `{"status":"ok"}`, visto a través de Vercel).

### 7. Antes de cada demostración

En el plan gratuito Render duerme el servicio. La primera petición tarda cerca de un minuto y Vercel puede cortar la espera con un error. Despiértalo antes:

```bash
curl https://<tu-dominio-vercel>/v1/health
```

### 8. Verificar `trust proxy` antes de abrir el sistema

Es el riesgo más serio del reenvío (ADR-012): con `TRUST_PROXY` mal puesto, todos los usuarios compartirían la IP del proxy y los límites de inicio de sesión y registro (#16, 20 intentos por IP en 15 minutos) bloquearían a todos a la vez.

1. Desde un equipo, haz 21 intentos de inicio de sesión fallidos con correos distintos a `/v1/auth/login`: el 21 debe responder 429.
2. Mientras tanto, desde otra red (por ejemplo, un celular con datos), inicia sesión con una cuenta de prueba: debe entrar (no 429).
3. Si el celular también recibe 429, la API ve la IP del proxy: cambia `TRUST_PROXY` (prueba 1 o 3) y repite. `SUPUESTO:` 2 es el valor correcto (Vercel y Render); la prueba `src/app.setup.spec.ts` demuestra el comportamiento con esa cadena, pero solo este paso lo confirma contra la infraestructura real.

## Versionado al pasar de dev a main

Cada vez que `dev` se lleva a `main` (pull request con merge commit) es una versión nueva, en los dos repositorios:

1. Antes del merge, decidir el número con SemVer: cambio de contrato o ruptura sube la mayor, funcionalidad nueva la menor, corrección la de parche (la última es `v0.2.0`).
2. Hacer el merge de `dev` a `main`. El push dispara `Despliegue`, que pide aprobación en el entorno `produccion`.
3. Cuando el despliegue termine bien y `GET /v1/health` responda, crear la etiqueta y la publicación sobre ese commit de `main`: `gh release create vX.Y.Z --target main --generate-notes --title "vX.Y.Z — resumen corto"`.
4. En el frontend se hace lo mismo con su propia numeración.

## Reversa

- **API:** Render, «Deploys», «Rollback» al despliegue anterior. Las migraciones deben ser compatibles hacia atrás: mientras Render construye, la versión vieja atiende contra el esquema ya migrado. Una migración que borra o renombra columnas necesita dos despliegues.
- **Frontend:** Vercel, «Deployments», «Instant Rollback».
- **Base:** Neon conserva 6 horas de historial en el plan gratuito (`history_retention_seconds`): se puede restaurar una rama a un instante anterior desde la consola.
- **Infraestructura:** `terraform apply` con el cambio revertido en Git. `terraform destroy` borra el proyecto y los datos: no lo corras sin copia.

## Riesgos conocidos (ADR-012)

- **Fotos:** Render borra el disco en cada despliegue; por eso las fotos subidas van a Supabase Storage (ADR-022, aceptado el 17-nov-2026). Riesgos: la pausa del plan gratuito tras 7 días sin actividad (mitigada con `keepalive.yml`, `SUPUESTO:` que el ping cuenta como actividad) y una clave secreta más que custodiar. `PENDIENTE (equipo)`: subir una foto real en el despliegue y comprobar que sigue visible tras un redespliegue.
- **Latencia:** cada petición pasa por Vercel antes de Render; suma tiempo al p95 de EC-04. Se mide en la prueba de carga.
- **Una sola instancia:** el outbox corre dentro del proceso (ADR-015). No subas `numInstances`.
- **Límites en memoria:** se reinician con cada despliegue o cuando Render duerme el servicio.
- **Render sigue siendo público:** se puede llamar directo. Sesión, CSRF y permisos se validan en la API, pero **los límites por IP (#16) sí se pueden evadir**: con `TRUST_PROXY=2`, quien llame directo a Render puede enviar un `X-Forwarded-For` falso y la API tomará esa dirección como su IP (Render solo añade la real al final). Por Vercel no es falsificable. El límite por correo (5 fallos) no depende de la IP y sigue valiendo, así que un ataque a una cuenta concreta sigue acotado; lo que se debilita es el límite contra relleno de credenciales y registros masivos. Bajar a `TRUST_PROXY=1` no lo arregla: todos los usuarios compartirían la IP de Vercel. `PENDIENTE (equipo)`, seguimiento: que la API acepte la IP reenviada solo si la petición trae un secreto compartido que ponga Vercel (por ejemplo con un middleware de Vercel; no se pudo probar aquí) o bloquear el acceso directo a Render.
- **Estado de Terraform local:** sin backend remoto no hay bloqueo ni respaldo del estado.
- **Orquestación para RDA3:** `PENDIENTE (equipo)`: confirmar con el docente que Render y Terraform para Neon cuentan; si exige otra herramienta, un ADR nuevo reemplaza esa parte.
