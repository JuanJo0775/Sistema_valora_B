# ADR-041: Se cierra la integración de Olímpica con VTEX y se exige autorización para fuentes de terceros

- **Estado:** Aceptado (cierre final del proyecto, 2026-11-27)
- **Fecha:** 2026-11-25
- **Responsables:** equipo de backend; pendiente de revisión del equipo.
- **Escenarios relacionados:** EC-05 (evolución sin rediseñar el núcleo), EC-06 (fuente visible), EC-08 (privacidad)
- **Requisitos relacionados:** RF-014 (siembra y referencias), ADR-011 (datos iniciales), ADR-009 (neutralidad), ADR-042 (precio en línea separado), grill y contrato en `docs/decisiones/olimpica-vtex/`

## Contexto

Entre el 23 y el 24 de noviembre de 2026 se construyó un piloto interno que consultaba a Olímpica por VTEX (`/api/catalog_system/pub/products/search` y `/api/checkout/pub/orderForms/simulation`) para traer precios en línea de 5 a 10 productos en Armenia (PR #241, #243, #248 y #249). El punto 8 del grill exigía verificar, antes de publicar o programar la ejecución diaria, las condiciones de reutilización y de frecuencia de consulta.

Esa verificación se hizo el 25 de noviembre de 2026 sobre los [Términos y condiciones de olimpica.com](https://www.olimpica.com/terminos-y-condiciones):

- **2.4.1** prohíbe «utilizar *spiders*, *site copiers* o cualquier otro dispositivo, programa, algoritmo o método para acceder, adquirir, copiar o monitorear cualquier parte o contenido de Olimpica.com».
- **2.4.3 y 2.4.4** prohíben el uso desproporcionado del sitio y el software que interfiera con su funcionamiento.
- **2.2** dice que los términos solo cambian con «un contrato especial firmado» con Supertiendas y Droguerías Olímpica S.A.
- **5.3** advierte que sus precios en línea pueden ser exclusivos del canal digital y no siempre coinciden con los de las tiendas físicas.

El `robots.txt` de Olímpica no bloquea esos endpoints para el agente general, pero eso es una señal técnica y no una autorización: el contrato es el de los términos. El piloto además contradecía el ADR-011, que descarta la «extracción automatizada de sitios de terceros» en el MVP.

## Decisión

1. **Se cierra la integración con Olímpica.** Se elimina el código que consulta su sitio: el cliente VTEX, la vista previa, la aplicación manual, el comando `pnpm olympica:vtex` y sus pruebas. El historial de Git conserva el ciclo rojo, verde y refactorización para MC-E3.
2. **Se conserva, apagado, el lado de lectura:** la tabla `imports.online_observations`, `GET /v1/products/{productId}/online-offers` (responde `[]` mientras `ONLINE_OFFERS_ENABLED` sea falso) y la tarjeta del frontend. Son la base para una fuente que sí tenga autorización (ADR-042). Si pasan varios cortes sin una fuente nueva, se retiran con una migración nueva; nunca se edita la 0046.
3. **Regla para toda fuente automatizada de precios de un tercero** (supermercado, cadena, agregador): antes de escribir código se necesita **una autorización escrita** (acuerdo, API con licencia o datos abiertos con licencia) que cubra reutilización, frecuencia y atribución. Sin ella, la fuente se tramita como siembra manual con evidencia (ADR-011) o como reportes de la comunidad. La autorización se guarda en `docs/decisiones/<fuente>/`.
4. **Los precios de Olímpica llegan por la comunidad** (reportes en tienda) y, si se firma un acuerdo, por la vía del punto 3. Las tiendas de cadena siguen sin dueño reclamable (ADR-038).

## Alternativas descartadas

- **Seguir con el piloto interno sin publicar.** Ejecutar el comando contra su sitio ya es «acceder, adquirir o monitorear» con un programa, aunque no se publique el dato.
- **Pedir permiso y mantener el código mientras tanto.** Deja una herramienta que viola los términos en `dev` y un comando listo para ejecutarse por error.
- **Borrar también la tabla, el endpoint y la tarjeta.** Obliga a una migración de borrado, a cambiar el contrato y a regenerar los tipos del frontend, para volver a construirlos si aparece una fuente autorizada. Se prefiere dejarlos apagados y documentados.
- **Un acuerdo con Olímpica como condición para avanzar.** Es una puerta abierta, no un requisito de este corte.

## Consecuencias

- (+) El proyecto no depende de una fuente que sus propios términos prohíben, y la decisión queda trazada con evidencia (EC-05, EC-06).
- (+) Una fuente futura entra por un puerto de lectura ya probado.
- (−) No hay precios en línea de supermercado en el MVP; la cobertura depende de reportes y de la siembra manual.
- (−) La tabla y el endpoint no tienen escritor hasta que haya una fuente autorizada. Mientras tanto, `online_observations.source` y el enumerado `olimpica` del contrato siguen siendo específicos de Olímpica; se generalizan con la primera fuente nueva.
- **Riesgo abierto:** el 21 de noviembre de 2026 se consultaron 160 fichas de olimpica.com con un script para armar los borradores de `seed/` (`docs/decisiones/issue-193-semilla/notas-olimpica.md`). La cláusula 2.4.1 también cubre esa consulta. El equipo debe decidir si esos precios se conservan como datos iniciales, se verifican a mano en tienda o se retiran antes de la entrega.

## Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm depcheck` y `pnpm test:cov` en verde tras el retiro del código.
- Ninguna ruta, DTO ni documento de `docs/openapi.yaml` cambia.
