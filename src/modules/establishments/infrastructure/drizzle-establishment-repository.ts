import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EstablishmentRepository,
  EstablishmentType,
  NearbyEstablishment,
  NearbyQuery,
} from '../application/establishment-repository';
import { establishments } from './schema';

export class DrizzleEstablishmentRepository implements EstablishmentRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async exists(establishmentId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: establishments.id })
      .from(establishments)
      .where(eq(establishments.id, establishmentId));
    return found !== undefined;
  }

  // La ubicación del usuario solo viaja como parámetro de esta consulta: no se guarda (RF-005 RN5).
  async findNearby(query: NearbyQuery): Promise<NearbyEstablishment[]> {
    const point = sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`;
    const distance = sql`ST_Distance(${establishments.location}, ${point})`;

    const rows = await this.db
      .select({
        id: establishments.id,
        name: establishments.name,
        type: establishments.type,
        address: establishments.address,
        lat: sql<number>`ST_Y(${establishments.location}::geometry)`.mapWith(Number),
        lng: sql<number>`ST_X(${establishments.location}::geometry)`.mapWith(Number),
        distanceM: sql<number>`round(${distance})::int`.mapWith(Number),
      })
      .from(establishments)
      // ST_DWithin usa el índice GiST de la ubicación.
      .where(sql`ST_DWithin(${establishments.location}, ${point}, ${query.radiusMeters})`)
      .orderBy(distance)
      .limit(query.limit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      // La restricción CHECK de la tabla garantiza que es uno de los 4 tipos.
      type: row.type as EstablishmentType,
      ...(row.address === null ? {} : { address: row.address }),
      lat: row.lat,
      lng: row.lng,
      distanceM: row.distanceM,
    }));
  }
}
