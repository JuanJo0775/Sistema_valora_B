export interface PurgeAccountSubscriptionsPorts {
  subscriptions: { removeAll(accountId: string): Promise<void> };
  // El registro de avisos enviados también guarda el id de la cuenta (ADR-044).
  notices: { removeAll(accountId: string): Promise<void> };
}

// ADR-032 con el hallazgo de B7 (#208): al recibir AccountPurged de identity, notifications borra los
// dispositivos de esa cuenta y el registro de los avisos que se le enviaron. Idempotente: borrar lo ya
// borrado no hace nada.
export class PurgeAccountSubscriptions {
  constructor(private readonly ports: PurgeAccountSubscriptionsPorts) {}

  async execute(accountId: string): Promise<void> {
    await this.ports.subscriptions.removeAll(accountId);
    await this.ports.notices.removeAll(accountId);
  }
}
