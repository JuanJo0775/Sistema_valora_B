import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../../../shared/database/database.module';
import { onlineObservations as table } from './schema';

interface ObservationBase {
  source: 'olimpica_vtex';
  zoneId: string;
  runId: string;
  presentationId: string;
  ean: string;
  skuId: string;
  sellerId: string;
  observedAt: Date;
}

export type OnlineObservation = ObservationBase &
  (
    | { status: 'available'; priceCop: number; expiresAt: Date }
    | { status: 'unavailable' }
  );

function toObservation(row: typeof table.$inferSelect): OnlineObservation {
  const { priceCop, expiresAt, status, ...base } = row;
  if (status === 'unavailable') return { ...base, status };
  if (priceCop === null || expiresAt === null)
    throw new Error('Observación disponible incompleta.');
  return { ...base, status, priceCop, expiresAt };
}

export class OlimpicaObservations {
  constructor(private readonly db: Database) {}

  async save(observation: OnlineObservation): Promise<OnlineObservation> {
    const [inserted] = await this.db
      .insert(table)
      .values(observation)
      .onConflictDoNothing()
      .returning();
    if (inserted) return toObservation(inserted);
    const [saved] = await this.db
      .select()
      .from(table)
      .where(
        and(
          this.productAndZone(observation.presentationId, observation.zoneId),
          eq(table.runId, observation.runId),
        ),
      )
      .limit(1);
    if (!saved) throw new Error('No se encontró la observación guardada.');
    return toObservation(saved);
  }

  async latest(presentationId: string, zoneId: string): Promise<OnlineObservation | null> {
    const [row] = await this.db
      .select()
      .from(table)
      .where(this.productAndZone(presentationId, zoneId))
      .orderBy(desc(table.observedAt), desc(table.runId))
      .limit(1);
    return row ? toObservation(row) : null;
  }

  async current(
    presentationId: string,
    zoneId: string,
    now: Date,
  ): Promise<OnlineObservation | null> {
    const latest = await this.latest(presentationId, zoneId);
    return latest?.status === 'available' && latest.expiresAt > now ? latest : null;
  }

  private productAndZone(presentationId: string, zoneId: string) {
    return and(
      eq(table.source, 'olimpica_vtex'),
      eq(table.zoneId, zoneId),
      eq(table.presentationId, presentationId),
    );
  }
}
