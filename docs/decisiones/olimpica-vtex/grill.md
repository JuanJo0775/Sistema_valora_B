# Grill de integración de Olímpica con VTEX

> **Cerrado el 25 de noviembre de 2026.** La verificación del punto 8 mostró que los términos de olimpica.com (2.4.1) prohíben consultar su contenido con programas. La integración se cerró y el código se retiró; este documento queda como registro. Ver [ADR-041](../../adr/0041-cierre-integracion-olimpica-vtex.md) y [ADR-042](../../adr/0042-precio-en-linea-separado-del-precio-por-sede.md).

## Alcance aprobado

Piloto interno de backend en Armenia, con 5 a 10 presentaciones del catálogo de Valora. El dato se clasifica como precio en línea observado para una zona de entrega confirmada. El piloto queda fuera del precio vigente por tienda física, de la resolución de discrepancias del ADR-008 y de Dónde comprar.

## Decisiones

1. Atribuir cada observación a la zona de entrega confirmada. Si VTEX devuelve un precio general o la zona es incierta, omitir la fila e informar el motivo. Usar un código postal de prueba, sin enviar direcciones ni ubicaciones de usuarios.
2. Vincular únicamente presentaciones existentes con coincidencia exacta y única por EAN. Los casos sin coincidencia, ambiguos o con códigos internos quedan para revisión. El alta de catálogo queda para una fase posterior.
3. Guardar los resultados válidos, aunque fallen otras consultas. Conservar la observación anterior de los productos que fallaron, con su fecha original, e identificarlos para reintento.
4. Si VTEX confirma indisponibilidad en la zona, retirar la oferta de inmediato y conservar el historial. Recuperarla cuando se confirme de nuevo precio y disponibilidad.
5. Ejecutar manualmente con vista previa por defecto. Indicar precios por guardar, ofertas por retirar, filas omitidas y errores. Aplicar cambios mediante una opción explícita.
6. La vigencia es de 48 horas desde la última confirmación válida. Al vencer, la observación queda en el historial.
7. Antes de activar la actualización diaria en horario de Colombia, comparar 5 a 10 productos con la web de Olímpica para la misma zona de Armenia durante tres días distintos. La ejecución diaria reutilizará el importador manual.
8. Antes de publicar precios o activar la ejecución diaria, verificar las condiciones de reutilización y frecuencia de consulta. Pedir confirmación a Olímpica si las condiciones no aclaran ambos puntos.

## Revisión de escenarios

| Escenario | Comportamiento del piloto |
| --- | --- |
| EC-01 | Las consultas externas se ejecutan en el importador. La consulta de precios de la aplicación conserva su flujo actual. |
| EC-02 | Las 48 horas aplican a observaciones en línea. Una indisponibilidad confirmada retira inmediatamente la oferta. |
| EC-03 | Las observaciones no participan en reputación, reportes comunitarios ni detección de discrepancias de una sede. |
| EC-04 | La ejecución del piloto queda fuera de las peticiones de usuarios. |
| EC-05 | El precio en línea se mantiene separado de la comparación por tienda física. |
| EC-06 | La futura exposición identificará la fuente, la zona y la fecha. Su incorporación al orden y a Dónde comprar requiere una decisión posterior. |
| EC-07 | El piloto no usa la cola de reportes sin conexión. |
| EC-08 | El piloto usa una zona de prueba y no transmite ubicación ni datos de personas. |

## Siguiente etapa

Definir el contrato de API y el modelo de observaciones antes de implementar. Proponer un ADR sobre la separación del precio en línea respecto al precio por sede, y contrastarlo con los ADR-008, ADR-009 y ADR-013. Registrar evidencia del piloto en esta carpeta.
