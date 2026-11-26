# EC-09 y RF-020: avisos a moderación y comercio

> **Estado: aceptados el 25 de noviembre de 2026 y registrados en Notion: el escenario EC-09 y el requisito RF-020.**

## RF-020: Avisos a moderación y comercio

| Campo | Valor |
|---|---|
| ID | RF-020 |
| Estado | Definido |
| Descripción | Un moderador o un comercio se entera de lo que espera su atención sin revisar a mano: una campana con un contador dentro de la app y, cuando la app está cerrada, una notificación en el celular o el computador. |
| Actor | Moderador, Comercio, Sistema |
| Incremento | Módulo comercial |
| Corte de construcción | Corte 3 |
| Prioridad | Media |
| Escenarios de calidad | EC-09, EC-04, EC-05, EC-08 |
| Módulo (Notion) | Confiabilidad y Moderación |
| ADRs relacionados | ADR-043, ADR-044, ADR-045 |

### Reglas de negocio

- **RN1.** El moderador ve cuántos casos esperan decisión en cada cola: precios, tiendas, productos y comercios. El comercio ve sus avisos de vencimiento y de discrepancia.
- **RN2.** La campana se actualiza cada 60 s mientras la app está visible. Es un contador de pendientes por atender: el número baja cuando se decide el caso o se reconfirma el precio. No hay historial de «leído».
- **RN3.** Las notificaciones push son opcionales: la persona las activa con un botón y puede desactivarlas. Solo las reciben las cuentas moderador y comercio.
- **RN4.** El aviso es un texto genérico con un conteo. Nunca trae nombres de tiendas ni de productos ni datos de quien reportó (EC-08).
- **RN5.** Varios hechos seguidos en una misma cola producen una sola notificación: como máximo un aviso por cola y por cuenta cada 5 minutos (valor provisional).
- **RN6.** Un fallo del aviso nunca afecta la operación que lo originó.

### Criterios de aceptación

**Escenario: contador del moderador**
Dado que hay 2 reportes sospechosos y 1 solicitud de comercio pendientes
Cuando el moderador abre la app
Entonces la campana muestra 3, la pestaña Precios muestra 2 y la pestaña Comercios muestra 1.

**Escenario: el número baja al decidir**
Dado que la pestaña Precios muestra 2
Cuando el moderador decide un reporte
Entonces, en el siguiente sondeo, la pestaña Precios muestra 1.

**Escenario: aviso con la app cerrada**
Dado un moderador que activó los avisos en su celular y tiene la app cerrada
Cuando un reporte entra a la cola
Entonces recibe una notificación genérica y, al tocarla, se abre el panel de moderación en la pestaña correspondiente.

**Escenario: sin datos personales**
Dado cualquier aviso enviado
Cuando se revisa su contenido
Entonces no contiene nombres de tiendas ni de productos ni claves o datos de quien reportó.

**Escenario: avisos desactivados**
Dado un moderador que desactivó los avisos en un dispositivo
Cuando entra un caso nuevo
Entonces ese dispositivo no recibe notificación y la campana sigue funcionando.

## EC-09: Aviso oportuno a moderación y comercio

| Elemento | Descripción |
|---|---|
| Fuente del estímulo | El sistema, ante un caso nuevo en una cola de moderación o un aviso del comercio |
| Estímulo | Un caso queda pendiente de decisión, o a un comercio se le vence una confirmación |
| Artefacto | Módulo `notifications` y service worker de la PWA |
| Entorno | Operación normal; la persona tiene la PWA instalada, el permiso concedido y la app cerrada |
| Respuesta | Se envía una notificación sin datos personales; al tocarla abre la pantalla correspondiente; ante un 404 o 410 del servicio de push se borra la suscripción; un fallo del envío no afecta la operación que lo originó |
| Medida de la respuesta | Al menos el 95 % de los avisos llega al servicio de push en 60 s o menos desde que el evento queda confirmado (p95); el contenido no trae ningún campo identificador (prueba automática); 0 dependencias de otros módulos hacia `notifications` (dependency-cruiser); registrar un reporte no cambia su tiempo de respuesta cuando el envío falla (EC-04) |

**Nota sobre la medida:** lo medible es la entrega al servicio de push, no la llegada al dispositivo, que depende de Google y de Apple. En el spike #256 el tiempo de llegada fue de 553 ms en Android y 700 ms en el PC, y el servicio aceptó el mensaje entre 186 y 4.035 ms.

## Valores provisionales (por calibrar)

Quedan parametrizables y se ajustan con datos reales; el equipo los aceptó el 25 de noviembre de 2026:

- Un aviso por cola y por cuenta cada 5 minutos.
- Mensaje válido durante una hora si el dispositivo está apagado o sin red.
- Máximo 5 suscripciones por cuenta.
- Sondeo de la campana cada 60 s.
- Meta de 95 % de los avisos aceptados por el servicio de push en 60 s o menos.

## Cómo se registra en Notion

1. **EC-09:** en la base Escenarios de calidad (Corte 3, prioridad Media, origen Equipo), enlazado a ADR-043, 044 y 045 y a RF-020.
2. **ADR-043, 044 y 045:** en la base ADRs, en estado Aceptado.
3. **RF-020:** en la base Requisitos Funcionales (estado Definido, Corte 3), enlazado a los tres ADR y a EC-09, con una tabla del estado de construcción de cada regla.
