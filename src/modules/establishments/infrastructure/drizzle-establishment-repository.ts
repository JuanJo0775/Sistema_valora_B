import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EstablishmentRepository,
  EstablishmentType,
  NearbyEstablishment,
  AroundQuery,
  NearbyQuery,
  WithinRadiusQuery,
} from '../application/establishment-repository';
import { establishments } from './schema';

interface RadiusSearch {
  lat: number;
  lng: number;
  radiusMeters: number;
  // Condición adicional (por ejemplo, solo algunas tiendas) y tope de resultados.
  where?: SQL;
  limit?: number;
}

export class DrizzleEstablishmentRepository implements EstablishmentRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async exists(establishmentId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: establishments.id })
      .from(establishments)
      .where(eq(establishments.id, establishmentId));
    return found !== undefined;
  }

  findNearby(query: NearbyQuery): Promise<NearbyEstablishment[]> {
    return this.searchWithinRadius(query);
  }

  // Grill de la #15, pregunta 2: sin tope, para no perder tiendas que tienen precio.
  findWithinRadius(query: WithinRadiusQuery): Promise<NearbyEstablishment[]> {
    return this.searchWithinRadius({ ...query, where: inArray(establishments.id, query.ids) });
  }

  // Grill de la #31, pregunta 7: las tiendas a radiusMeters o menos de otra tienda, ella incluida.
  async findAround(query: AroundQuery): Promise<string[]> {
    const center = sql`(select location from establishments.establishments where id = ${query.establishmentId})`;
    const rows = await this.db
      .select({ id: establishments.id })
      .from(establishments)
      .where(sql`ST_DWithin(${establishments.location}, ${center}, ${query.radiusMeters})`);
    return rows.map((row) => row.id);
  }

  // La ubicación del usuario solo viaja como parámetro de esta consulta: no se guarda (RF-005 RN5).
  private async searchWithinRadius(search: RadiusSearch): Promise<NearbyEstablishment[]> {
    const point = sql`ST_SetSRID(ST_MakePoint(${search.lng}, ${search.lat}), 4326)::geography`;
    const distance = sql`ST_Distance(${establishments.location}, ${point})`;

    const query = this.db
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
      .where(
        and(
          sql`ST_DWithin(${establishments.location}, ${point}, ${search.radiusMeters})`,
          search.where,
        ),
      )
      .orderBy(distance)
      .$dynamic();
    const rows = await (search.limit === undefined ? query : query.limit(search.limit));

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
