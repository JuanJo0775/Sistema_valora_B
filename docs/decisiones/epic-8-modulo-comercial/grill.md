# Grill del módulo comercial (EPIC-B08, Corte 3)

Decisiones abiertas de AS-E4 (`docs/academico/as-e4-impacto-arquitectura-v2.md`, sección 3). Grill del 21-nov-2026 con Sara Sanchez. **Estado: propuestas del equipo, por validar el 23-nov-2026** (presentación del docente). Todavía no hay código del módulo: la estimación de esfuerzo de EC-05 se registra antes del primer commit.

## D1. Qué precio entra al orden cuando hay discrepancia corroborada (ADR-024)

Base: ADR-008 (el oficial es la referencia; discrepancia corroborada = diferencia mayor al umbral de 5 % sostenida por al menos 2 reportes independientes, recientes y de confiabilidad media o alta).

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Qué precio entra al orden neutral? | **El que corrobora la comunidad** (opción B). El oficial se muestra al lado con aviso, fuente y fecha | Es lo que la persona va a pagar; la defensa contra ataques ya es el umbral de corroboración; vale igual si el reporte es más caro o más barato |
| ¿Qué valor del lado reportado? | **La mediana** de los reportes que corroboran; con un número par, el menor de los dos centrales | Un reporte extremo o malintencionado no la mueve y siempre es un precio que alguien vio. Función pura en `domain` |
| ¿Qué reportes son «recientes»? | Dentro de la **vigencia de la categoría** (ADR-005) **y posteriores a la última actualización del oficial** | Si el comercio corrige, los reportes de antes no lo castigan; si el precio real no cambió, reportes nuevos lo vuelven a marcar |

Caso de referencia: oficial $4.000; reportes confiables $4.700, $4.800 y $5.900 → entra $4.800 al orden y se muestra «Oficial $4.000 · Reportado $4.800».

## D2. Cómo se prueba que alguien es dueño de un comercio (ADR-025)

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Cómo se registra? | **Formulario** en `/comercios/registro` con validaciones automáticas: tienda existente y sin dueño, responsable, NIT con dígito de verificación (opcional para tiendas informales), teléfono, dirección, aceptación de condiciones (Ley 1581), correo verificado, una tienda por cuenta | Idea del equipo; no guarda documentos |
| ¿Qué prueba la propiedad? | **Verificación por presencia:** al registrarse, el celular comparte su ubicación una vez y debe estar a **50 m o menos** de la tienda. La ubicación se usa para comprobar y **no se guarda** | Para suplantar a una tienda hay que estar dentro de ella; gratis; incluye tiendas informales. No es infalible (la ubicación se puede falsear): lo cubren las denuncias |
| ¿Cuándo actúa el moderador? | **Solo por excepción:** dos cuentas reclaman la misma tienda (disputa) o una denuncia «este comercio no es de quien dice». Puede revocar el perfil | El equipo no puede revisar cada solicitud ni hacer videollamadas |
| ¿Y si la tienda no está en el mapa? | En el mismo formulario se propone la tienda; la ubicación del celular marca el punto. Se respeta **RF-005 RN7**: la tienda pasa por la revisión de propuestas que ya existe. El comercio queda **«pre-aprobado»** y se le dice qué se desbloquea (publicar precios oficiales, carga por archivo, promociones, responder avisos de precio, editar datos de la tienda). Al aprobarse la tienda, el comercio queda verificado solo | Reutiliza la cola de propuestas (#27); no cambia un requisito |
| ¿Dónde está en la PWA? | Botón «¿Eres el dueño? Registra tu tienda» en la ficha de la tienda y «Registrar mi tienda» en Yo → `/comercios/registro`; el resto en el área `/comercios` | Área ya reservada para el Corte 3 (ADR-017) |

**Por validar con el docente el 23-nov:** si la verificación por presencia cumple lo que espera RF-015 de «verificación de comercios».

## D3. Cuentas, roles y revocación (ADR-025)

| Pregunta | Decisión | Razón |
|---|---|---|
| Al verificarse, ¿qué pasa con su rol de reportante? | **Un rol por cuenta:** la cuenta pasa de `reportante` a `comercio` (evento `MerchantVerified`, receptor en `identity`). Ya no reporta precios de otras tiendas; sus reportes anteriores se conservan | Evita el conflicto de interés de reportar precios de la competencia (EC-03); no cambia el modelo de roles ni el núcleo |
| ¿Cuántas tiendas por cuenta? | **Una** en el Corte 3. El perfil de comercio se guarda como algo propio de la cuenta, para que varias tiendas sean después un cambio aditivo | La mayoría de comercios objetivo tiene un solo local; el módulo queda pequeño (EC-05) |
| Si se revoca el perfil (suplantación confirmada) o se elimina la cuenta (ADR-032), ¿qué pasa con lo publicado? | **Se retira todo al instante:** precios oficiales y promociones dejan de mostrarse (`OfficialPriceWithdrawn`, `PromotionWithdrawn`); la comparación vuelve a los reportes y datos iniciales. La tienda sigue en el mapa. Se anota quién revocó, cuándo y por qué. La cuenta vuelve a `reportante` y el moderador puede suspenderla con las reglas existentes | Un perfil revocado ya no es confiable; un precio falso no puede seguir engañando |

## D4. Periodo de reconfirmación del precio oficial (ADR-005, ADR-016)

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Cuánto vale un precio oficial sin reconfirmar? | **La misma vigencia de los reportes** (ADR-005: 7 días frescos, 14 el resto; «por confirmar» y «desactualizado» como hoy). Valores provisionales y configurables en un solo lugar | Una sola regla para oficiales y reportados (neutralidad); un fresco de hace un mes no puede verse vigente |
| ¿Cómo reconfirma un comercio con muchos productos? | Botón **«Todos mis precios siguen igual»** (un toque reconfirma todos); editar un precio lo reconfirma; **subir el archivo** reconfirma lo que trae; **recordatorio** un día antes (aviso en `/comercios` y correo con Resend) | Con 1.000 productos es un toque por semana. Se descartó que el comercio elija el periodo: podría dejar precios viejos como vigentes durante meses |

## D5. Evidencias y correcciones de la tienda (ADR-022, `establishments`)

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Bucket privado para evidencias? | **No hace falta**: con la verificación por presencia (D2) no se guardan documentos | Menos datos personales (Ley 1581) y nada nuevo que operar |
| ¿Qué cambia un comercio verificado por sí solo? | **Horario, teléfono y nombre** se aplican al instante. Excepción automática: si el nombre nuevo es equivalente al de otra tienda a menos de 50 m (regla de duplicados de la #27), va al moderador | El dueño conoce esos datos; la excepción evita copiar el nombre de la tienda vecina |
| ¿Qué pasa por el moderador? | **La ubicación**, siempre: va a la lista de propuestas de tiendas que ya existe | Mover el punto cambia la distancia, que entra al orden neutral y a «tiendas cercanas» |
| ¿Cómo se aplica sin romper el monolito? | `commerce` pide los cambios a `establishments` por su interfaz pública (`index.ts`); no escribe en sus tablas | Regla de dependencias (ADR-001) |

## D6. Promociones (ADR-009, ADR-026)

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Promoción sin precio oficial vigente? | **No.** Los tres tipos (descuento porcentual, precio especial, pague X lleve Y) exigen un oficial **vigente** del producto. Si el oficial pasa a «por confirmar», la promoción **se pausa** sola; reconfirmar (D4) la reactiva | El «antes» siempre es un precio real y reciente: evita descuentos inflados (EC-06) |
| ¿Qué condiciones puede tener? | **Fijas, sin texto libre:** máximo por cliente (número), hasta agotar existencias (sí/no), medio de pago (cualquiera, efectivo o tarjeta) | Sin publicidad, teléfonos ni datos personales; no hay que moderar; se muestran y prueban igual |
| ¿Cambian el orden? | **Nunca** (ADR-009): van en `promotions`, aparte de `results` | Neutralidad |

## D7. Carga de precios por archivo (ADR-027)

| Pregunta | Decisión | Razón |
|---|---|---|
| ¿Al momento o en segundo plano? | **Al momento: `POST /v1/commerce/prices/bulk` responde 200** (antes 202) con el resultado. Máximo **1.000 filas** por archivo | Resultado inmediato; sin cola, sin estados ni archivos guardados; con una sola instancia en Render (ADR-012) un trabajo largo competiría con la API. Aún no hay código que use el 202 |
| ¿Y las filas con error? | **Se publican las buenas y se informan las malas** (fila, producto, motivo), con opción de descargar solo las que fallaron | El comerciante no pierde trabajo |
| ¿Cómo se identifica el producto? | Por **código de barras**. Si no está en Valora, la fila falla con la sugerencia de proponer el producto (#26); nunca se crea un producto desde el archivo | Datos del catálogo verificados (RF-014) |
| ¿Subir el mismo archivo otra vez? | **Actualiza sin duplicar** (misma tienda y presentación) y **reconfirma** lo que trae (D4) | Idempotente |
