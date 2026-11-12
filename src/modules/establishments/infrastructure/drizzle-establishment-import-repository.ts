import { asc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  EstablishmentImport,
  EstablishmentImportRepository,
} from '../application/import-establishments';
import { establishments } from './schema';

export class DrizzleEstablishmentImportRepository implements EstablishmentImportRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(establishment: EstablishmentImport): Promise<void> {
    const row = {
      id: establishment.id,
      name: establishment.name,
      type: establishment.type,
      address: establishment.address ?? null,
      location: { lat: establishment.lat, lng: establishment.lng },
    };
    await this.db
      .insert(establishments)
      .values(row)
      .onConflictDoUpdate({
        target: establishments.id,
        set: { name: row.name, type: row.type, address: row.address, location: row.location },
      });
  }

  async listIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: establishments.id })
      .from(establishments)
      .orderBy(asc(establishments.id));
    return rows.map((row) => row.id);
  }
}
