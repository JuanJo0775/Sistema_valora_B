# Prueba de carga de la comparación (EC-04)

Script: `test/load/comparison.k6.js` (k6). Workflow: `.github/workflows/load.yml` (Actions, Carga, Run workflow).

## Dónde se corre

**La prueba larga se corre contra un entorno local o un servicio efímero, no contra producción.**

El 17 de noviembre de 2026 Render suspendió la API de producción porque el mes llegó a 11 GB de ancho de banda de salida y el plan gratuito incluye 5 GB. Una de las causas fue la prueba de 500 usuarios y 10 minutos lanzada contra producción (ADR-031). Cada corrida de ese tamaño mueve del orden de 3 GB sin comprimir, y se suma al tráfico real de los usuarios.

- **Entorno local:** API y PostgreSQL con la semilla en el mismo equipo (`pnpm dev` o la imagen del `Dockerfile`); en k6 se pasa `API_URL=http://localhost:3000/v1`. No gasta la cuota de nadie, pero la latencia no incluye la red ni Vercel.
- **Servicio efímero:** un servicio de Render (o equivalente) creado para la prueba, con su propia base, y borrado al terminar. Si es de plan gratuito, la cuota de salida de esa cuenta se sigue contando.
- **Producción:** solo en casos excepcionales y con valores pequeños. El workflow lo exige: si la URL contiene `onrender.com` o `vercel.app`, hay que escribir exactamente `CARGA-EN-PRODUCCION` en `confirmar_produccion`, o el primer paso falla.

## Valores por defecto y costo

Por defecto: **50 usuarios virtuales y 2 minutos** (antes 500 y 10). Cada usuario hace una consulta cada 2 s en promedio.

| Usuarios | Sostenida | Peticiones aprox. | Salida sin comprimir (10 a 20 kB c/u) | Con gzip (2 a 4 kB c/u) |
|---|---|---|---|---|
| 50 | 2 min | 5.000 | 0,05 a 0,1 GB | menos de 0,02 GB |
| 500 | 10 min | 165.000 | 1,6 a 3,3 GB | 0,3 a 0,7 GB |

Son cifras de orden de magnitud: el tamaño real depende de cuántas tiendas tenga cada producto. La medición de la compresión está en el ADR-031.

## Resultados ya documentados

Los resultados de EC-04 ya registrados (la corrida de 500 usuarios y 10 minutos y sus umbrales: p95 menor que 2 s y menos de 1 % de errores) **siguen vigentes**. Fueron mediciones válidas del sistema de ese momento; este cambio no las invalida ni obliga a repetirlas. Lo que cambia es dónde se repiten: si se necesita una corrida nueva con 500 usuarios, va a un entorno local o efímero.

Desde el ADR-031 la API comprime las respuestas y la comparación sin ubicación se guarda hasta 60 s en la caché de Vercel. Una carga contra Vercel mediría sobre todo esa caché y no a la API: para medir la API, apunta directo al servicio (local o efímero).
