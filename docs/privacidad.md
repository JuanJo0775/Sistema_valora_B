# Política de tratamiento de datos y cookies: cumplimiento legal (Colombia)

**Versión de la política:** 2026-11 (vigente desde el 17 de noviembre de 2026).
**Texto público:** la ruta `/privacidad` de la PWA (`Sistema_valora_F`, `src/features/legal/PrivacyPolicy.tsx`).
**Versión aceptada:** el registro exige `acceptedPolicyVersion = 2026-11` (`src/modules/identity/application/policy.ts`); si el texto cambia de fondo, se sube la versión en los dos repositorios.

Redactado con apoyo de IA (Claude Code). **No es asesoría jurídica:** el equipo debe revisarlo y, si el sistema se abre al público, validarlo con un abogado y con la universidad.

## Normas aplicadas

- Ley 1581 de 2012 (régimen general de protección de datos personales) y Decreto 1074 de 2015, que compiló el Decreto 1377 de 2013 (autorización, política de tratamiento, aviso de privacidad).
- Ley 1266 de 2008 (habeas data financiero): no aplica; Valora no trata información crediticia.
- Ley 1480 de 2011 (consumidor): informa las condiciones de las promociones (módulo comercial, corte 3); no cambia esta política.
- Circular Única de la SIC (Título V), para transferencias y transmisiones internacionales y el Registro Nacional de Bases de Datos.

## Qué exige la ley y dónde está cubierto

| Exigencia | Dónde se cumple |
|---|---|
| Política de tratamiento con responsable, finalidades, derechos, área de peticiones, procedimiento y vigencia (art. 13, Decreto 1377/2013) | `/privacidad`, secciones 1 a 10 |
| Autorización previa, expresa e informada y prueba de ella (arts. 9 y 17 de la Ley 1581) | Casilla sin marcar en «Crear cuenta»; el servidor guarda la versión y la fecha aceptadas (`identity.accounts`) |
| Aviso de privacidad en el momento de la captura (art. 14, Decreto 1377/2013) | Párrafo sobre el formulario de registro |
| Derechos del titular (art. 8): conocer, actualizar, rectificar, prueba de autorización, informe de uso, queja ante la SIC, revocar y suprimir, acceso gratuito | `/privacidad`, sección 6 |
| Plazos: consulta 10 días hábiles (+5); reclamo 15 días hábiles (+8) (arts. 14 y 15) | `/privacidad`, sección 7 |
| Datos sensibles y de menores (arts. 5, 6 y 7) | No se tratan datos sensibles; sección 9 sobre menores |
| Principio de finalidad, necesidad y circulación restringida (art. 4) | ADR-013 y `docs/calidad/privacidad-ec08.md`: datos mínimos, identidad separada, respuestas públicas sin datos personales |
| Seguridad (art. 4, literal g) | Contraseñas con argon2id, cookies HttpOnly + CSRF, HTTPS, esquema separado, pruebas guardianas `privacy-schema.spec.ts` y `privacy-public-responses.spec.ts` |
| Transmisión y transferencia internacional (art. 26 y Decreto 1377/2013, art. 25) | Sección 5: proveedores en EE. UU. como encargados; Estados Unidos figura entre los países con nivel adecuado según la SIC |
| Aviso de cookies | Aviso inferior de la PWA (`CookieNotice`) y sección 4. Solo se usan cookies y almacenamiento necesarios; no requieren aceptación, pero se informan |

## Pendientes del equipo (`PENDIENTE (equipo)`)

1. **Canal de contacto del responsable.** El Decreto exige indicar domicilio, dirección, correo y teléfono. La política remite hoy al repositorio de GitHub; hay que definir un correo del proyecto y publicarlo en `/privacidad` (sección 1).
2. **Identidad del responsable.** Confirmar si el responsable es el equipo, cada integrante o la universidad, según su política de propiedad intelectual y de datos.
3. **Procedimiento de supresión.** Hoy es manual. Definir quién lo ejecuta y cómo: eliminar la fila de `identity.accounts` y sus sesiones; los reportes quedan con un identificador interno sin cuenta (hallazgo 1 de `privacidad-ec08.md`). Probarlo.
4. **Registro Nacional de Bases de Datos (RNBD).** Obligatorio para responsables con activos totales superiores a 100.000 UVT y para entidades públicas; un proyecto académico probablemente no lo es. Confirmarlo antes de abrir al público.
5. **Retención.** La política dice «mientras la cuenta esté activa y por el tiempo que dure el proyecto». Fijar un plazo concreto y una limpieza al cerrar el proyecto.
6. **Menores de edad.** La política pide autorización del representante legal. Si el equipo prefiere vetarlos, hay que pedir la fecha de nacimiento o una declaración de mayoría de edad en el registro.
7. **Incidentes de seguridad.** Definir quién avisa a la SIC (Registro Nacional de Bases de Datos, módulo de incidentes) y en cuántas horas.
8. **Revisión jurídica** del texto antes de producción.

## Qué datos y cookies usa realmente el sistema

Ver `docs/calidad/privacidad-ec08.md` (datos y rutas) y `docs/despliegue.md` (proveedores). Cookies: sesión (HttpOnly) y CSRF; almacenamiento local para preferencias (`valora:*`) y IndexedDB para la cola sin conexión. No hay analítica, publicidad ni terceros que pongan cookies.
