# Grill — issue #27: propuestas de tiendas y duplicados

- **Fuentes:**
  - Issue #27 (Corte 2, épica #3): consulta por radio ordenada por distancia (PR-24); la ubicación del usuario no se guarda (PR-15); propuestas de alta pendientes de revisión y duplicados sugeridos, no fusionados; latitud y longitud de la tienda para el mapa (ADR-019).
  - RF-005 (Notion): RN1 una tienda fuera de Armenia y el Quindío se marca para revisión; RN3 un nombre equivalente a menos de 50 m genera propuesta de fusión, nunca fusión automática; RN4 y RN5 la ubicación que se muestra es la de la tienda y la del usuario no se guarda; RN7 toda tienda sugerida pasa por moderación antes de aparecer en el mapa. Escenario: «Tienda Esperanza» a menos de 50 m de «Tienda La Esperanza» propone fusionar.
  - Código existente: `GET /v1/establishments/nearby` ordenado por distancia, con lat/lng de la tienda y sin guardar la ubicación del usuario (#50, probado en `establishments-http.spec.ts`); roles y `SessionGuard` (#16, #33); clave seudónima (`ReporterIdentity`).
- **Ya cumplido:** consulta por radio, ubicación del usuario no guardada y lat/lng de la tienda (#50).
- **Fecha:** 2026-11-15.
- **Método:** una pregunta a la vez, con la opción recomendada y su razón.

## Preguntas

### Común con la #26: ¿dónde revisa el moderador las propuestas?

- **Decisión:** cada módulo de soporte guarda sus propuestas y expone sus rutas de moderador: `establishments` las de tiendas (esta issue) y `catalog` las de productos (#26). El moderador tiene tres listas: precios, tiendas y productos.
- **Razón:** cada módulo es dueño de su ciclo y no se acopla la cola de precios (`reliability`, núcleo) con el catálogo y las tiendas.

### 1. ¿Cómo es el ciclo de una tienda propuesta?

- **Decisión:**
  - `POST /v1/establishment-proposals` (reportante): nombre, tipo, lat/lng y dirección opcional → 202, pendiente. No aparece en el mapa (RN7).
  - `GET /v1/moderation/store-proposals` (moderador): las pendientes, cada una con sus posibles duplicados y si está fuera de la zona.
  - `POST /v1/moderation/store-proposals/{proposalId}/decision` (moderador): `aprobar` (crea la tienda), `fusionar` con una tienda existente (no crea nada) o `rechazar`, siempre con motivo de 10 a 500 caracteres.
- **Razón:** cumple RN3 y RN7 con la misma forma de las decisiones de la #32.

### 2. ¿Qué es un nombre equivalente?

- **Decisión:** se comparan los nombres sin tildes ni mayúsculas y sin palabras comunes (tienda, minimercado, supermercado, mini, market, la, el, los, las, de, del, y). Son equivalentes si las palabras de uno están todas en el otro («Esperanza» ⊆ «La Esperanza»). Posible duplicado: equivalente y a menos de 50 m (provisional). Regla pura en el dominio.
- **Razón:** en un centro comercial hay muchas tiendas a 50 m; mirar el nombre evita falsos avisos.

### 3. ¿Cómo se sabe si una tienda está en el Quindío?

- **Decisión:** un rectángulo que cubre el Quindío (latitud 4,05 a 4,75; longitud -75,95 a -75,35), provisional. Fuera de él, la propuesta llega al moderador marcada «fuera de la zona»; no se rechaza sola. Regla pura en el dominio.
- **Razón:** para un aviso al moderador el rectángulo basta; un polígono real pide conseguir y cargar sus datos con licencia.

## Decisiones menores (sin pregunta)

- La propuesta guarda la clave seudónima de quien la hizo (nunca su cuenta) y, al decidir, la del moderador, el motivo y la fecha. Ninguna respuesta las muestra (EC-08).
- La tienda aprobada usa el id de la propuesta.
- Una propuesta ya decidida o que no existe responde 404; fusionar con una tienda que no existe responde 422.
