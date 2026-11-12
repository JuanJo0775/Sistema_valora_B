import { sql } from 'drizzle-orm';
import { check, customType, index, pgSchema, text, uuid } from 'drizzle-orm/pg-core';

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Punto geográfico de PostGIS (ADR-003): las distancias se calculan en metros sobre la Tierra.
// Se escribe como EWKT; para leerlo se usan ST_Y y ST_X en la consulta.
const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType: () => 'geography(Point, 4326)',
  toDriver: ({ lat, lng }) => `SRID=4326;POINT(${String(lng)} ${String(lat)})`,
});

// Esquema propio del módulo (ADR-003, ADR-021). Ningún otro módulo lee estas tablas.
export const establishmentsSchema = pgSchema('establishments');

export const establishments = establishmentsSchema.table(
  'establishments',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    address: text('address'),
    location: geographyPoint('location').notNull(),
  },
  (table) => [
    // Tipos del grill de la #50, pregunta 1.
    check(
      'establishments_type_valid',
      sql`${table.type} in ('barrio', 'minimercado', 'supermercado', 'descuento')`,
    ),
    index('establishments_location_idx').using('gist', table.location),
  ],
);
