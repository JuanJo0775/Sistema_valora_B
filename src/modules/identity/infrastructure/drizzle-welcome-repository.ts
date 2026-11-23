import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { WelcomeRecipient, WelcomeRepository } from '../application/welcome-repository';
import { accounts } from './schema';

// ADR-036: la marca y la lectura del destinatario son un solo UPDATE ... RETURNING. De dos peticiones a la
// vez, solo una ve la fila con la marca vacía.
export class DrizzleWelcomeRepository implements WelcomeRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async claim(accountId: string, at: Date): Promise<WelcomeRecipient | null> {
    const [claimed] = await this.db
      .update(accounts)
      .set({ welcomeEmailSentAt: at })
      .where(
        and(
          eq(accounts.id, accountId),
          isNull(accounts.welcomeEmailSentAt),
          isNotNull(accounts.emailVerifiedAt),
        ),
      )
      .returning({ email: accounts.email, displayName: accounts.displayName });
    return claimed ?? null;
  }
}
