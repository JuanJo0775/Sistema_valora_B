# Evidencia de los avisos push (B#261)

> **Estado (26 de noviembre de 2026): probado en iPhone con la PWA instalada y en Android; la latencia p95 de EC-09 no está medida.** Quedan sin probar PC, iPhone sin instalar, desactivar, el límite de un aviso cada 5 minutos, el permiso denegado y el envío con Render dormido. #261 se cerró con este alcance por decisión del equipo; lo no medido sigue siendo una brecha de la evidencia de EC-09. Para EC-09 (ADR-044) y RF-020.

## 1. Antes de probar: configuración del despliegue

En el servicio de Render (nunca en el repositorio):

| Variable | Valor |
|---|---|
| `PUSH_PROVIDER` | `webpush` |
| `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` | Un par nuevo para producción (`npx web-push generate-vapid-keys`). No reutilizar el del spike |
| `VAPID_SUBJECT` | `https://` con la dirección del sitio, o `mailto:` con un correo institucional del equipo. Nunca un correo personal (Apple rechaza un contacto no válido: `403 BadJwtToken`) |

Comprobaciones:

- [ ] `GET /v1/notifications/vapid-public-key` responde 200 con la clave (con 404 la app no muestra «Activar avisos»).
- [ ] Hay al menos una cuenta moderador y una cuenta comercio de prueba.
- [ ] La PWA está desplegada en Vercel con el service worker nuevo (que incluye `push-handler.js`).

Cambiar la clave VAPID después invalida todas las suscripciones (ADR-045).

## 2. Pruebas manuales por dispositivo

Repetir en cada dispositivo, con una cuenta **moderador** y, aparte, con una cuenta **comercio**. Capturas o video por paso.

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Abrir Valora, entrar a «Yo» | Se ve «Avisos en este dispositivo» (iPhone en Safari sin instalar: ve los pasos de instalación, no un botón) |
| 2 | Tocar «Activar avisos» | El navegador pide permiso; al aceptar, la pantalla muestra «Desactivar avisos» |
| 3 | Cerrar la app por completo | — |
| 4 | Provocar un caso (ver sección 3) | Llega una notificación genérica, sin nombres de tiendas, productos ni datos de quien reportó |
| 5 | Tocar la notificación | Abre la app en la pantalla correcta (moderación: panel; comercio: Comercios) |
| 6 | Provocar dos casos en la misma cola en menos de 5 min | Solo llega un aviso (comercio: un aviso al día) |
| 7 | «Desactivar avisos» y provocar otro caso | Ese dispositivo no recibe nada; la campana sigue funcionando |
| 8 | Denegar el permiso (dispositivo limpio) | La pantalla explica cómo volver a permitirlo |

### Resultados

| Dispositivo | Sistema y navegador | PWA instalada | Pasos 1–8 | Lo que no funcionó | Evidencia |
|---|---|---|---|---|---|
| Android (26-nov-2026, producción) | Chrome | Sin detallar | El equipo reporta que funciona bien. No se registraron por paso ni la versión del dispositivo | Nada reportado | Sin capturas en el repositorio |
| iPhone (26-nov-2026, cuenta moderador de prueba, producción) | Safari, PWA instalada | Sí | 1 a 5 correctos: se activó (el botón pasó a «Desactivar avisos»), llegó con la app cerrada el aviso «Hay casos nuevos para revisar en Productos» y al tocarlo abrió Moderación en la pestaña Productos. Pasos 6 a 8 sin probar | Ninguno en los pasos probados. Antes de este día, la campana quedaba tapada por el buscador (corregido en F#220) | Dos capturas del equipo: la notificación y el panel abierto |
| (por llenar) iPhone | Safari sin instalar | No | Solo 1 y la guía | | |
| (por llenar) PC | Chrome o Edge | | | | |

## 3. Cómo provocar un caso

- **Moderación, Precios:** enviar un reporte con precio muy alejado de la mediana (queda «desviación») o marcar un precio como dudoso.
- **Moderación, Tiendas o Productos:** proponer una tienda o pedir un producto con una cuenta reportante.
- **Moderación, Comercios:** denunciar o disputar el precio de un comercio.
- **Comercio:** el aviso sale del resumen diario cuando hay un vencimiento o una discrepancia nueva; llega con hasta una hora de retraso. Para no esperar, correr el resumen en el entorno de pruebas.

## 4. Envío con Render dormido

El plan gratuito duerme el servicio. Es una duda abierta de ADR-044.

1. Dejar el servicio sin tráfico hasta que se duerma (unos 15 minutos).
2. Provocar un caso con la petición que lo origina (por ejemplo, un reporte).
3. Anotar: el servicio despierta y procesa el outbox, ¿cuánto tarda en llegar el aviso? Si el aviso no llega hasta que alguien más entra, registrarlo como límite conocido.

| Prueba | Tiempo hasta el aviso | Observación |
|---|---|---|
| (por llenar) | | |

## 5. Latencia hasta el servicio de push (EC-09)

La medida es hasta que el servicio de push **acepta** el mensaje, no hasta que llega al dispositivo (el reloj de un dispositivo puede estar atrasado). El módulo escribe una línea por aviso, solo con números:

```text
Aviso a moderación: cola=precios enviados=1 ms=412
```

Para sacar el p95, copiar los registros de Render a un archivo `registros.txt` y correr:

```bash
grep -o 'ms=[0-9]*' registros.txt | cut -d= -f2 | sort -n | awk '
  { v[NR] = $1 }
  END {
    if (NR == 0) { print "sin datos"; exit }
    i = int(NR * 0.95); if (i < NR * 0.95) i++
    printf "avisos=%d  p50=%d ms  p95=%d ms  max=%d ms  meta p95<=60000 ms: %s\n",
      NR, v[int((NR + 1) / 2)], v[i], v[NR], (v[i] <= 60000 ? "CUMPLE" : "NO CUMPLE")
  }'
```

Los avisos del comercio no escriben esta línea (llegan con hasta una hora de retraso por diseño); se miden solo los de moderación.

| Fecha | Avisos medidos | p50 | p95 | Máximo | ¿Cumple 95 % en 60 s? |
|---|---|---|---|---|---|
| 26-nov-2026 | 1 | (sin registro) | (sin registro) | (sin registro) | **No medido.** Con un solo aviso no hay p95 |

Con muy pocos avisos el p95 no es significativo; provocar al menos 20 y decirlo en la tabla.

## 6. Cierre

- [ ] Tablas de las secciones 2, 4 y 5 llenas, incluido lo que no funcionó.
- [ ] Este documento enlazado desde ADR-044 (Verificación) y desde el escenario EC-09 en Notion.
- [ ] Resultado registrado en Notion: EPIC-B09, RF-020 (estado de construcción) y el entregable de pruebas.
