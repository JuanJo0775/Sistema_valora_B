export interface PurgeAccountSubscriptionsPorts {
  subscriptions: { removeAll(accountId: string): Promise<void> };
}

// ADR-032 con el hallazgo de B7 (#208): al recibir AccountPurged de identity, notifications borra los
// dispositivos de esa cuenta. Idempotente: borrar lo ya borrado no hace nada.
export class PurgeAccountSubscriptions {
  constructor(private readonly ports: PurgeAccountSubscriptionsPorts) {}

  async execute(accountId: string): Promise<void> {
    await this.ports.subscriptions.removeAll(accountId);
  }
}
