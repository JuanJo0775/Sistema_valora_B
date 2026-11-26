import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NoticeLog } from '../application/notice-log';
import { sentNotices } from './schema';

export class DrizzleNoticeLog implements NoticeLog {
  constructor(private readonly db: NodePgDatabase) {}

  async lastSent(accountId: string, queue: string): Promise<Date | null> {
    const [found] = await this.db
      .select({ sentAt: sentNotices.sentAt })
      .from(sentNotices)
      .where(and(eq(sentNotices.accountId, accountId), eq(sentNotices.queue, queue)));
    return found?.sentAt ?? null;
  }

  async record(accountId: string, queue: string, at: Date): Promise<void> {
    await this.db
      .insert(sentNotices)
      .values({ accountId, queue, sentAt: at })
      .onConflictDoUpdate({
        target: [sentNotices.accountId, sentNotices.queue],
        set: { sentAt: at },
      });
  }

  // ADR-032: al eliminar la cuenta no queda constancia de sus avisos.
  async removeAll(accountId: string): Promise<void> {
    await this.db.delete(sentNotices).where(eq(sentNotices.accountId, accountId));
  }
}
