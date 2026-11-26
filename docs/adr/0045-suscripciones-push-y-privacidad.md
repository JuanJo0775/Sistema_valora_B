# ADR-045: Suscripciones push y privacidad

- **Estado:** Propuesto
- **Fecha:** 2026-11-25
- **Responsables:** equipo de backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-08 (privacidad)
- **Requisitos relacionados:** requisito propuesto «Avisos a moderación y comercio» (`docs/decisiones/avisos/escenario-y-requisito.md`), Ley 1581 de 2012 (habeas data), ADR-013 (privacidad por diseño), ADR-032 (eliminación de la cuenta), ADR-044 (Web Push y módulo `notifications`)

## Contexto

Para enviar un aviso por Web Push hay que guardar la suscripción de cada dispositivo: una dirección del servicio de push del navegador (`endpoint`) y dos claves. Esa dirección identifica un dispositivo, así que se trata como dato personal. Por sí sola no permite enviar nada: hace falta además la clave privada VAPID del servidor.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas |
|---|---|---|
| A. Guardar solo `endpoint` y claves, atados a la cuenta | Mínimo necesario; permite avisar según el rol de la cuenta | Dato por dispositivo que hay que proteger y borrar |
| B. Guardar también el agente de usuario o la IP para depurar | Ayuda a entender un fallo | Datos de más (minimización, ADR-013) |
| C. Suscripciones anónimas, sin cuenta | Menos datos personales | No se puede elegir al destinatario por rol |
| D. Cifrar el `endpoint` en reposo con una clave de la aplicación | Defensa extra si se filtra la base | Complejidad sin ganancia clara: la dirección sola no sirve sin la clave VAPID privada |

## Decisión

1. **Quién recibe:** solo cuentas con rol moderador o comercio. El reportante no recibe avisos.
2. **Consentimiento explícito (opt-in):** el permiso del navegador se pide al tocar «Activar avisos», nunca al cargar la página. «Desactivar avisos» borra la suscripción de ese dispositivo.
3. **Qué se guarda,** en `notifications.push_subscriptions`: identificador, cuenta, `endpoint`, las dos claves y la fecha de creación. Nada más: sin agente de usuario, sin IP, sin ubicación. Único por `endpoint`, así que reintentar no duplica.
4. **Máximo cinco suscripciones por cuenta** (valor provisional); al pasar el máximo se reemplaza la más antigua.
5. **Cuándo se borra:**
   - cuando el servicio de push responde 404 o 410;
   - al eliminar la cuenta, en la purga (ADR-032);
   - cuando la cuenta ya no tiene un rol elegible (por ejemplo, un comercio que deja su tienda): se detecta al intentar el envío.
6. **Ninguna ruta devuelve el `endpoint` ni las claves.** `GET /v1/notifications/vapid-public-key` es público y solo entrega la clave pública. El `endpoint` no se escribe en los registros del servidor.
7. **Contenido del aviso:** el mínimo definido en el ADR-044; nunca datos del reportante.
8. **Claves:** `VAPID_PRIVATE_KEY` solo en las variables de entorno de Render; en el repositorio, solo marcadores en `.env.example`. Se validan al arrancar cuando `PUSH_PROVIDER=webpush`. `VAPID_SUBJECT` es un correo institucional del equipo o la dirección del sitio, nunca el correo de una persona: viaja a Google y a Apple dentro de la firma, y Apple rechaza dominios de ejemplo. Cambiar la clave pública invalida todas las suscripciones y las personas deben volver a activar los avisos.

## Consecuencias

- Positivas: datos mínimos; se borran solos cuando dejan de servir o con la cuenta; el aviso no revela nada si lo ve otra persona en la pantalla bloqueada, porque es genérico.
- Negativas / riesgos: la fuga de la base expondría las direcciones de push, que sin la clave VAPID privada no sirven para enviar; rotar las claves obliga a reactivar los avisos; el tope de cinco puede sorprender a quien usa muchos dispositivos.
- Trade-offs aceptados: no se cifra el `endpoint` en reposo ni se guarda el agente de usuario, a cambio de menos complejidad y menos datos.

## Verificación

- Prueba de integración: ninguna respuesta de la API contiene el `endpoint` ni las claves de nadie.
- Prueba de que al eliminar la cuenta se borran sus suscripciones y de que el 404 o 410 las borra.
- Prueba de que el contenido enviado no trae campos identificadores.
- Entrada en `docs/calidad/privacidad-ec08.md` con el nuevo dato y su finalidad (#259).

## Referencias

- Notion: [EPIC-B09](https://app.notion.com/p/424056e503118169a2a5ed1fcc5e5cab)
- Issues / PRs: #255, #258, #259, #260; PR #263 (resultados del spike)
