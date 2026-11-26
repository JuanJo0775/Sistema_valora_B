import { and, asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Unit } from '../../../domain/unit-price';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type {
  NewProductRequest,
  ProductRequestDecisionRecord,
  ProductRequestRepository,
} from '../application/product-requests';
import { presentations, productAliases, productRequests, products } from './schema';

const STATUS_AFTER = { aprobar: 'aprobada', fusionar: 'fusionada', rechazar: 'rechazada' } as const;

export class DrizzleProductRequestRepository implements ProductRequestRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async save(request: NewProductRequest, events: DomainEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(productRequests).values({
        ...request,
        brand: request.brand ?? null,
        barcode: request.barcode ?? null,
        quantity: String(request.quantity),
      });
      for (const event of events) await this.outbox.publish(tx, event);
    });
  }

  async pending(): Promise<NewProductRequest[]> {
    const rows = await this.db
      .select({
        id: productRequests.id,
        name: productRequests.name,
        brand: productRequests.brand,
        categoryCode: productRequests.categoryCode,
        quantity: productRequests.quantity,
        unit: productRequests.unit,
        packCount: productRequests.packCount,
        barcode: productRequests.barcode,
        requesterKey: productRequests.requesterKey,
        createdAt: productRequests.createdAt,
      })
      .from(productRequests)
      .where(eq(productRequests.status, 'pendiente'))
      .orderBy(asc(productRequests.createdAt));
    return rows.map(({ brand, barcode, quantity, unit, ...row }) => ({
      ...row,
      ...(brand === null ? {} : { brand }),
      quantity: Number(quantity),
      // La restricción CHECK de la tabla garantiza la unidad.
      unit: unit as Unit,
      ...(barcode === null ? {} : { barcode }),
    }));
  }

  async decide(record: ProductRequestDecisionRecord): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [decided] = await tx
        .update(productRequests)
        .set({
          status: STATUS_AFTER[record.decision],
          mergeInto: record.mergeInto ?? null,
          note: record.note,
          moderatorKey: record.moderatorKey,
          decidedAt: record.decidedAt,
        })
        .where(
          and(eq(productRequests.id, record.requestId), eq(productRequests.status, 'pendiente')),
        )
        .returning();
      if (!decided) return false;

      const presentation = {
        id: sql`gen_random_uuid()`,
        quantity: decided.quantity,
        unit: decided.unit,
        packCount: decided.packCount,
        barcode: decided.barcode,
      };
      // RF-003 RN3: solo un producto aprobado aparece en la búsqueda.
      if (record.decision === 'aprobar') {
        await tx.insert(products).values({
          id: decided.id,
          name: decided.name,
          brand: decided.brand,
          categoryCode: decided.categoryCode,
        });
        await tx.insert(presentations).values({ ...presentation, productId: decided.id });
      }
      // Grill de la #26, pregunta 2: el nombre propuesto queda como alias del producto existente.
      if (record.decision === 'fusionar' && record.mergeInto) {
        const productId = record.mergeInto;
        await tx
          .insert(productAliases)
          .values({ productId, alias: decided.name })
          .onConflictDoNothing();
        const [existing] = await tx
          .select({ id: presentations.id })
          .from(presentations)
          .where(
            and(
              eq(presentations.productId, productId),
              eq(presentations.quantity, decided.quantity),
              eq(presentations.unit, decided.unit),
              eq(presentations.packCount, decided.packCount),
            ),
          );
        if (!existing) await tx.insert(presentations).values({ ...presentation, productId });
      }
      return true;
    });
  }
}
