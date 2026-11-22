import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type { EstablishmentType } from '../application/establishment-repository';
import type {
  NewStoreProposal,
  StoreProposalDecisionRecord,
  StoreProposalRepository,
} from '../application/store-proposals';
import type { Municipality } from '../../../domain/municipality';
import { establishments, storeProposals } from './schema';

const STATUS_AFTER = { aprobar: 'aprobada', fusionar: 'fusionada', rechazar: 'rechazada' } as const;

export class DrizzleStoreProposalRepository implements StoreProposalRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async save(proposal: NewStoreProposal): Promise<void> {
    const { lat, lng, ...rest } = proposal;
    await this.db.insert(storeProposals).values({ ...rest, location: { lat, lng } });
  }

  async pending(): Promise<NewStoreProposal[]> {
    const rows = await this.db
      .select({
        id: storeProposals.id,
        name: storeProposals.name,
        type: storeProposals.type,
        address: storeProposals.address,
        lat: sql<number>`ST_Y(${storeProposals.location}::geometry)`.mapWith(Number),
        lng: sql<number>`ST_X(${storeProposals.location}::geometry)`.mapWith(Number),
        municipality: storeProposals.municipality,
        proposerKey: storeProposals.proposerKey,
        createdAt: storeProposals.createdAt,
      })
      .from(storeProposals)
      .where(eq(storeProposals.status, 'pendiente'))
      .orderBy(asc(storeProposals.createdAt));
    // La restricción CHECK de la tabla garantiza el tipo.
    return rows.map(({ address, type, municipality, ...row }) => ({
      ...row,
      type: type as EstablishmentType,
      // La restricción CHECK de la tienda garantiza el municipio al aprobarla; aquí viene del DTO.
      municipality: municipality as Municipality,
      ...(address === null ? {} : { address }),
    }));
  }

  async decide(record: StoreProposalDecisionRecord, events: DomainEvent[]): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [decided] = await tx
        .update(storeProposals)
        .set({
          status: STATUS_AFTER[record.decision],
          mergeInto: record.mergeInto ?? null,
          note: record.note,
          moderatorKey: record.moderatorKey,
          decidedAt: record.decidedAt,
        })
        .where(
          and(eq(storeProposals.id, record.proposalId), eq(storeProposals.status, 'pendiente')),
        )
        .returning({ id: storeProposals.id });
      if (!decided) return false;
      // RF-005 RN7: solo una propuesta aprobada aparece en el mapa.
      if (record.decision === 'aprobar') {
        await tx.execute(
          sql`insert into ${establishments} (id, name, type, address, location, municipality)
              select id, name, type, address, location, municipality from ${storeProposals}
              where id = ${decided.id}`,
        );
      }
      for (const event of events) await this.outbox.publish(tx, event);
      return true;
    });
  }
}
