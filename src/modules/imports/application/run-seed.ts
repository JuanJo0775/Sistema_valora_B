import type { ImportCatalog } from '../../catalog';
import type {
  EstablishmentImport,
  EstablishmentType,
  ImportEstablishments,
} from '../../establishments';
import type { SeedSource } from './seed-source';
import { stableId } from './stable-id';

// Lo que la semilla usa de catalog y establishments, a través de su interfaz pública.
export type SeedCatalog = Pick<ImportCatalog, 'save' | 'listProductIds'> & {
  listCategoryCodes(): Promise<string[]>;
};
export type SeedStores = Pick<ImportEstablishments, 'save' | 'listIds'>;

export interface SeedSummary {
  ok: true;
  stores: { saved: number; skipped: number };
}

export class RunSeed {
  constructor(
    private readonly source: SeedSource,
    private readonly catalog: SeedCatalog,
    private readonly stores: SeedStores,
  ) {}

  async execute(): Promise<SeedSummary> {
    const rows = await this.source.readStores();
    // Grill de la #51, pregunta 3: solo se cargan las filas que el equipo ya revisó.
    const verified = rows.filter((row) => row.values['revisar'] === 'no');
    for (const row of verified) {
      const store: EstablishmentImport = {
        id: stableId('establishment', row.values['osm_id'] ?? ''),
        name: row.values['nombre'] ?? '',
        type: row.values['tipo'] as EstablishmentType,
        lat: Number(row.values['lat']),
        lng: Number(row.values['lng']),
      };
      await this.stores.save(store);
    }
    return { ok: true, stores: { saved: verified.length, skipped: rows.length - verified.length } };
  }
}
