import { departFrom, type MerchantDeparturePorts } from './merchant-departures';

export type LeaveResult = { status: 'dejada'; establishmentId: string } | { status: 'sin_tienda' };

// H36 (ADR-040): la propia cuenta deja de administrar su tienda. La tienda sigue en el mapa y la
// cuenta puede volver a reclamarla. Idempotente: sin tienda no hace nada.
export class LeaveEstablishment {
  constructor(private readonly ports: MerchantDeparturePorts) {}

  async execute(accountId: string): Promise<LeaveResult> {
    const claim = await this.ports.claims.findByAccount(accountId);
    if (!claim || !(await departFrom(this.ports, claim, 'dejada'))) {
      return { status: 'sin_tienda' };
    }
    return { status: 'dejada', establishmentId: claim.establishmentId };
  }
}
