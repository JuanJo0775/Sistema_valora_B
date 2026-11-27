import type { MerchantCaseRepository } from './merchant-cases';

export interface MyDisputePorts {
  cases: Pick<MerchantCaseRepository, 'openDisputeOf'>;
  // La tienda, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

export interface MyDisputeView {
  establishment: { id: string; name: string };
  // Cuándo se abrió la disputa.
  requestedAt: Date;
}

// H17: GET /commerce/me/dispute. Quien disputó una tienda ve que su solicitud sigue abierta. Solo la
// tienda y la fecha: ni la cuenta ni los datos del dueño actual (EC-08).
export class MyDispute {
  constructor(private readonly ports: MyDisputePorts) {}

  async find(accountId: string): Promise<MyDisputeView | null> {
    const open = await this.ports.cases.openDisputeOf(accountId);
    if (!open) return null;
    const establishment = await this.ports.establishments.find(open.establishmentId);
    return {
      establishment: { id: open.establishmentId, name: establishment?.name ?? '' },
      requestedAt: open.openedAt,
    };
  }
}
