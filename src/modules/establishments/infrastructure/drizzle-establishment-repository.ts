import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EstablishmentDetail,
  EstablishmentRepository,
  EstablishmentType,
  InMunicipalityQuery,
  NearbyEstablishment,
  AroundQuery,
  NearbyQuery,
  SearchQuery,
  WithinRadiusQuery,
} from '../application/establishment-repository';
import type { Municipality } from '../../../domain/municipality';
import { establishments } from './schema';

// Lo que describe una tienda, sin distancia.
const detailColumns = {
  id: establishments.id,
  name: establishments.name,
  type: establishments.type,
  address: establishments.address,
  neighborhood: establishments.neighborhood,
  lat: sql<number>`ST_Y(${establishments.location}::geometry)`.mapWith(Number),
  lng: sql<number>`ST_X(${establishments.location}::geometry)`.mapWith(Number),
  municipality: establishments.municipality,
};

interface DetailRow {
  id: string;
  name: string;
  type: string;
  address: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  municipality: string;
}

// Las restricciones CHECK de la tabla garantizan el tipo y el municipio.
function toDetail({
  address,
  neighborhood,
  type,
  municipality,
  ...rest
}: DetailRow): EstablishmentDetail {
  return {
    ...rest,
    type: type as EstablishmentType,
    ...(address === null ? {} : { address }),
    ...(neighborhood === null ? {} : { neighborhood }),
    municipality: municipality as Municipality,
  };
}

// El nombre sin tildes y en minúsculas, como la búsqueda de productos (unaccent de PostgreSQL).
const plain = (text: SQL) => sql`lower(public.unaccent('public.unaccent'::regdictionary, ${text}))`;

// Cada palabra debe aparecer; los comodines de LIKE que escribe el usuario se buscan como texto.
function wordConditions(text: string): SQL[] {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.replace(/[\\%_]/g, (wildcard) => `\\${wildcard}`))
    .map(
      (word) =>
        sql`${plain(sql`${establishments.name}`)} like '%' || ${plain(sql`${word}`)} || '%'`,
    );
}

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

  // #116: sin la ubicación del usuario no hay distancia; se ordenan por nombre.
  async search(query: SearchQuery): Promise<EstablishmentDetail[]> {
    const rows = await this.db
      .select(detailColumns)
      .from(establishments)
      .where(
        and(
          ...wordConditions(query.q ?? ''),
          query.municipality === undefined
            ? undefined
            : eq(establishments.municipality, query.municipality),
        ),
      )
      .orderBy(establishments.name)
      .limit(query.limit);
    return rows.map(toDetail);
  }

  // Grill de la #15, pregunta 2: sin tope, para no perder tiendas que tienen precio.
  findWithinRadius(query: WithinRadiusQuery): Promise<NearbyEstablishment[]> {
    return this.searchWithinRadius({
      ...query,
      where: and(
        inArray(establishments.id, query.ids),
        query.municipality === undefined
          ? undefined
          : eq(establishments.municipality, query.municipality),
      ),
    });
  }

  // Grill de la #106: sin la ubicación del usuario no hay distancia; se ordenan por nombre.
  async findInMunicipality(query: InMunicipalityQuery): Promise<EstablishmentDetail[]> {
    if (query.ids.length === 0) return [];
    const rows = await this.db
      .select(detailColumns)
      .from(establishments)
      .where(
        and(
          inArray(establishments.id, query.ids),
          eq(establishments.municipality, query.municipality),
        ),
      )
      .orderBy(establishments.name);
    return rows.map(toDetail);
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

  async namesOf(establishmentIds: string[]): Promise<Map<string, string>> {
    if (establishmentIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: establishments.id, name: establishments.name })
      .from(establishments)
      .where(inArray(establishments.id, establishmentIds));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async findById(establishmentId: string): Promise<EstablishmentDetail | null> {
    const [row] = await this.db
      .select(detailColumns)
      .from(establishments)
      .where(eq(establishments.id, establishmentId));
    return row ? toDetail(row) : null;
  }

  async findWithinMeters(
    point: { lat: number; lng: number },
    meters: number,
  ): Promise<{ id: string; name: string; distanceM: number }[]> {
    const origin = sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`;
    const distance = sql`ST_Distance(${establishments.location}, ${origin})`;
    return this.db
      .select({
        id: establishments.id,
        name: establishments.name,
        distanceM: sql<number>`round(${distance})::int`.mapWith(Number),
      })
      .from(establishments)
      .where(sql`ST_DWithin(${establishments.location}, ${origin}, ${meters})`)
      .orderBy(distance);
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
        neighborhood: establishments.neighborhood,
        lat: sql<number>`ST_Y(${establishments.location}::geometry)`.mapWith(Number),
        lng: sql<number>`ST_X(${establishments.location}::geometry)`.mapWith(Number),
        municipality: establishments.municipality,
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
      ...(row.neighborhood === null ? {} : { neighborhood: row.neighborhood }),
      lat: row.lat,
      lng: row.lng,
      // La restricción CHECK de la tabla garantiza que es un municipio de la lista.
      municipality: row.municipality as Municipality,
      distanceM: row.distanceM,
    }));
  }
}
