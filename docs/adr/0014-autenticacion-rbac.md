# ADR-014: Autenticación y autorización con control de acceso por rol

- **Estado:** Aceptado
- **Fecha:** 2026-11-03
- **Responsables:** PENDIENTE (equipo): la fuente no indica quién elaboró o revisó este ADR
- **Escenarios relacionados:** EC-03, EC-08
- **Requisitos relacionados:** en Notion hay 2 relaciones con RF y 2 con RNF; la extracción trae solo las URL de las páginas, no sus identificadores RF/RNF. PENDIENTE (equipo): listar los RF/RNF
- **Corte / Área / Preguntas de diseño (Notion):** Corte 1 / Seguridad y privacidad / sin dato en la fuente
- **Registro oficial:** [Notion, base ADRs](https://app.notion.com/p/40239c4a833b81b1b88ad6b6ff46366d)

Fuente: Notion, base ADRs, página 40239c4a833b81b1b88ad6b6ff46366d; estado copiado de Notion.

> La página de Notion no tiene cuerpo (solo propiedades). El texto de las secciones siguientes está copiado de las propiedades de texto de la misma fila (Contexto, Alternativas consideradas, Decisión adoptada, Consecuencias / verificación). Los saltos `<br />` de Notion se muestran como párrafos.

## Contexto

Hay cuatro roles con permisos distintos y el consumidor puede usar la plataforma sin cuenta. Los comercios requieren verificación antes de publicar precios oficiales. Hay dos superficies de API (ADR-002) y una PWA como cliente (ADR-010).

## Alternativas consideradas

A) Sesión de servidor con cookie segura (HttpOnly) y protección CSRF.

B) Tokens de acceso de corta duración con token de refresco.

C) Delegar la autenticación en un proveedor externo de identidad (OIDC, inicio de sesión social).

## Decisión

APROBADA: autenticación propia con correo y contraseña, sesiones administradas por el servidor y control de acceso por rol (RBAC) verificado en el servidor en cada operación. La sesión se mantiene mediante cookie con atributos HttpOnly, Secure y SameSite, con protección CSRF. Las contraseñas se almacenan con hash Argon2id. La consulta pública de precios no requiere iniciar sesión. Quedan pendientes de especificación la expiración por inactividad y absoluta, la rotación del identificador de sesión y las reglas concretas de revocación al cerrar sesión o bloquear una cuenta.

## Consecuencias

(+) Menos dependencias externas y control sobre los datos personales (ADR-013).

(−) Hay que implementar bien recuperación de contraseña, límites de intentos y bloqueos (RNF-010).

(−) Con tokens hay que decidir cómo revocarlos; con sesión de servidor, cómo escalar el almacén de sesiones.

## Verificación

Sin sección propia en la fuente; lo que la fuente dice sobre verificación está dentro del campo «Consecuencias / verificación» (sección anterior).

## Referencias

- Notion: [ADR-014](https://app.notion.com/p/40239c4a833b81b1b88ad6b6ff46366d)
- Issues / PRs: las que cite el texto de arriba; sin otro dato en la fuente
