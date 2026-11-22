import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  StoreCorrection,
  StoreCorrectionDecisionRecord,
  StoreCorrectionDecisions,
  StoreCorrections,
} from '../application/store-details';
import { establishments, storeCorrections } from './schema';

const STATUS_AFTER = { aprobar: 'aprobada', rechazar: 'rechazada' } as const;

export class DrizzleStoreCorrectionRepository
  implements StoreCorrections, StoreCorrectionDecisions
{
  constructor(private readonly db: NodePgDatabase) {}

  async propose(correction: StoreCorrection): Promise<void> {
    const { location, name, ...rest } = correction;
    await this.db.insert(storeCorrections).values({
      ...rest,
      ...(name === undefined ? {} : { name }),
      ...(location === undefined ? {} : { location }),
    });
  }

  // Las pendientes, la más antigua primero.
  async pending(): Promise<StoreCorrection[]> {
    const rows = await this.db
      .select(correctionColumns)
      .from(storeCorrections)
      .where(eq(storeCorrections.status, 'pendiente'))
      .orderBy(asc(storeCorrections.createdAt));
    return rows.map(toCorrection);
  }

  // Aprobar aplica el nombre y la ubicación a la tienda en la misma transacción.
  async decide(record: StoreCorrectionDecisionRecord): Promise<StoreCorrection | null> {
    return this.db.transaction(async (tx) => {
      const [decided] = await tx
        .update(storeCorrections)
        .set({
          status: STATUS_AFTER[record.decision],
          note: record.note,
          moderatorKey: record.moderatorKey,
          decidedAt: record.decidedAt,
        })
        .where(
          and(
            eq(storeCorrections.id, record.correctionId),
            eq(storeCorrections.status, 'pendiente'),
          ),
        )
        .returning({ id: storeCorrections.id });
      if (!decided) return null;
      const [row] = await tx
        .select(correctionColumns)
        .from(storeCorrections)
        .where(eq(storeCorrections.id, decided.id));
      if (!row) return null;
      const correction = toCorrection(row);
      if (record.decision === 'aprobar') {
        await tx
          .update(establishments)
          .set({
            ...(correction.name === undefined ? {} : { name: correction.name }),
            ...(correction.location === undefined ? {} : { location: correction.location }),
          })
          .where(eq(establishments.id, correction.establishmentId));
      }
      return correction;
    });
  }
}

const correctionColumns = {
  id: storeCorrections.id,
  establishmentId: storeCorrections.establishmentId,
  name: storeCorrections.name,
  hasLocation: sql<boolean>`${storeCorrections.location} is not null`,
  lat: sql<number | null>`ST_Y(${storeCorrections.location}::geometry)`,
  lng: sql<number | null>`ST_X(${storeCorrections.location}::geometry)`,
  proposerKey: storeCorrections.proposerKey,
  createdAt: storeCorrections.createdAt,
};

interface CorrectionRow {
  id: string;
  establishmentId: string;
  name: string | null;
  hasLocation: boolean;
  lat: number | null;
  lng: number | null;
  proposerKey: string;
  createdAt: Date;
}

const toCorrection = ({ name, hasLocation, lat, lng, ...row }: CorrectionRow): StoreCorrection => ({
  ...row,
  ...(name === null ? {} : { name }),
  ...(hasLocation && lat !== null && lng !== null
    ? { location: { lat, lng } }
    : {}),
});
