import { sql } from 'drizzle-orm';
import { MUNICIPALITY_CODES } from '../../../domain/municipality';
import { check, customType, index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
    // Grill de la #106: municipio del Quindío; las tiendas de la semilla son de Armenia (#51).
    municipality: text('municipality').notNull().default('armenia'),
  },
  (table) => [
    check(
      'establishments_municipality_valid',
      sql.raw(`municipality in (${MUNICIPALITY_CODES.map((code) => `'${code}'`).join(', ')})`),
    ),
    // Tipos del grill de la #50, pregunta 1.
    check(
      'establishments_type_valid',
      sql`${table.type} in ('barrio', 'minimercado', 'supermercado', 'descuento')`,
    ),
    index('establishments_location_idx').using('gist', table.location),
  ],
);

// Grill de la #27: tiendas propuestas por la comunidad, pendientes hasta que un moderador decide
// (RF-005 RN3 y RN7). Guarda la clave seudónima de quien propone y de quien decide, nunca su cuenta.
export const storeProposals = establishmentsSchema.table(
  'store_proposals',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    address: text('address'),
    // La ubicación de la tienda propuesta, no la de quien la propone (RF-005 RN4).
    location: geographyPoint('location').notNull(),
    // Grill de la #106: municipio que dice quien propone; pasa a la tienda si se aprueba.
    municipality: text('municipality').notNull().default('armenia'),
    proposerKey: text('proposer_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pendiente'),
    mergeInto: uuid('merge_into'),
    note: text('note'),
    moderatorKey: text('moderator_key'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'store_proposals_type_valid',
      sql`${table.type} in ('barrio', 'minimercado', 'supermercado', 'descuento')`,
    ),
    check(
      'store_proposals_status_valid',
      sql`${table.status} in ('pendiente', 'aprobada', 'fusionada', 'rechazada')`,
    ),
  ],
);
