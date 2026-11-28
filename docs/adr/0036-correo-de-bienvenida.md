# ADR-036: Correo de bienvenida

- **Estado:** Aceptado (cierre final del proyecto, 2026-11-27)
- **Fecha:** 2026-11-23
- **Responsables:** integrante que dirige el backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-08 (privacidad)
- **Requisitos relacionados:** Ley 1581 de 2012, ADR-013 (privacidad por diseño), ADR-029 (verificación de correo y `EmailSender`), ADR-033 (restablecer contraseña)

## Contexto

La persona que crea su cuenta no recibe ningún mensaje que le explique qué es Valora ni cómo empezar. Ya existe el puerto `EmailSender` (ADR-029) con los adaptadores `console` y `resend`.

## Decisión

1. **Cuándo.** Un correo informativo por cuenta, en el momento en que su correo queda verificado por primera vez: al abrir el enlace de verificación, al crearse una cuenta con Google (llega verificada), al vincular Google a una cuenta sin verificar y al restablecer la contraseña de una cuenta sin verificar (ADR-033).
2. **Una sola vez.** Columna `identity.accounts.welcome_email_sent_at` (migración 0044). `SendWelcomeEmail` la marca con un solo `UPDATE ... WHERE welcome_email_sent_at IS NULL AND email_verified_at IS NOT NULL RETURNING email, display_name` ANTES de enviar: dos verificaciones simultáneas envían una sola vez, y un segundo enlace o un restablecimiento posterior no reenvían.
3. **No bloquea.** Los casos de uso no esperan el envío (`sendWelcomeInBackground`); verificar, registrar con Google y restablecer tardan lo mismo con o sin éxito y nunca fallan por el correo.
4. **Cuentas anteriores.** La migración pone la fecha de ese momento en todas las cuentas que ya existen: solo las cuentas nuevas lo reciben.
5. **Si el envío falla, la marca se queda puesta y no se reintenta.** Es un mensaje informativo, no transaccional: preferimos perder una bienvenida a enviarla dos veces o a reintentar sin fin. El aviso del servidor no lleva correo ni nombre. Alternativa descartada: desmarcar ante un error definitivo del proveedor; añade un estado y un posible reenvío tardío, sin beneficio para un correo opcional.
6. **Contenido.** Asunto «Te damos la bienvenida a Valora»; saludo con el primer nombre (sin nombre, «Hola»); qué es Valora; tres pasos; botón «Abrir Valora» (`APP_URL`); párrafo de privacidad con enlace a `/privacidad`; despedida con el nombre del remitente de `EMAIL_FROM`. HTML con tablas y estilos en línea, ancho máximo de 560 px, y texto plano equivalente. El nombre se escapa. Sin imágenes, sin enlaces de baja ni de seguimiento: no es marketing. Como la política de datos aún no publica un correo de contacto (`docs/privacidad.md`, pendiente 1), el aviso final remite a `APP_URL/privacidad`.
7. **Base legal.** Ejecución del servicio que la persona solicitó al crear la cuenta; no se usa para promoción. El proveedor de correo ya es un encargado declarado (ADR-029).

## Consecuencias y riesgos

- Una columna nueva con una fecha; nunca sale en una respuesta pública (lo verifican `privacy-schema.spec.ts` y `welcome-email-http.spec.ts`). La purga de cuenta (ADR-032) borra la fila completa, columna incluida.
- Las cuentas que existen hoy no reciben la bienvenida, tampoco las que sigan sin verificar al migrar.
- Con el proveedor caído la persona no la recibe y no hay segundo intento.
- Una bienvenida puede salir a una cuenta con la eliminación pendiente si verificó justo antes de pedirla; es inocuo.
